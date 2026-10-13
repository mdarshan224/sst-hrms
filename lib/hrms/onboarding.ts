import { z } from "zod";
import {
  AppError,
  employeeInput,
  phone,
  tokenHash,
  assertEntitlement,
} from "./domain.ts";
import {
  scope,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  requireFreshSession,
  assertCompanyWide,
  scopedEmployee,
  scopedCandidate,
  validateOrganization,
  assertOrganizationScope,
  organizationPredicate,
} from "./access.ts";
import type { Context, Row } from "./access.ts";
import { privacyScope } from "./privacy.ts";
import { ownedCase, adminCase } from "./onboarding-access.ts";
import { seal, unseal, digestText } from "./private-config.ts";
import type { PrivateConfig } from "./private-config.ts";
import { outbox, guardedAudit } from "./outbox.ts";
import { tenantUrl } from "./domains.ts";
export const templateDefinition = z.object({
  fields: z
    .array(
      z.object({
        key: z.enum([
          "address",
          "emergency_name",
          "emergency_phone",
          "education",
          "previous_employment",
        ]),
        label: z.string().trim().min(2).max(80),
        required: z.boolean(),
      }),
    )
    .max(5)
    .refine((v) => new Set(v.map((f) => f.key)).size === v.length),
  documents: z
    .array(
      z.object({
        category: z.enum(["resume", "education", "signed_offer", "employment"]),
        required: z.boolean(),
      }),
    )
    .max(4)
    .refine((v) => new Set(v.map((f) => f.category)).size === v.length),
  tasks: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
        label: z.string().min(2).max(120),
        owner: z.enum(["employee", "hr"]),
        required: z.boolean(),
      }),
    )
    .max(20)
    .refine((v) => new Set(v.map((f) => f.key)).size === v.length),
  privacyNotice: z.string().trim().min(30).max(4000),
  noticeVersion: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
});
export const DEFAULT_TEMPLATE = {
  fields: [
    { key: "address", label: "Contact address", required: true },
    { key: "emergency_name", label: "Emergency contact name", required: true },
    {
      key: "emergency_phone",
      label: "Emergency contact mobile",
      required: true,
    },
    { key: "education", label: "Education details", required: false },
    {
      key: "previous_employment",
      label: "Previous employment",
      required: false,
    },
  ],
  documents: [],
  tasks: [
    {
      key: "policy_ack",
      label: "I acknowledge the joining policies shared by HR",
      owner: "employee",
      required: true,
    },
  ],
  privacyNotice:
    "I consent to my company collecting these employment onboarding details for joining administration. Identity verification consent is requested separately. Contact HR for access, correction and retention questions.",
  noticeVersion: "onboarding-v1",
};
async function inviteLink(c: Context, tid: string, token: string) {
  return new URL(
    "/join/" + token,
    await tenantUrl(c.db, tid, "/", c.deploymentVersion),
  ).href;
}
export async function claimOnboarding(c: Context, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError(404, "Invitation unavailable.");
  const row = await first(
    c.db,
    "SELECT o.*,i.mobile,i.used_at,i.revoked_at,i.expires_at,i.role_id,t.status tenant_status,s.status subscription_status,s.expires_at subscription_expires,p.modules FROM invitations i JOIN onboarding_cases o ON o.invitation_id=i.id AND o.tenant_id=i.tenant_id JOIN tenants t ON t.id=i.tenant_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE i.token_hash=?",
    await tokenHash(token),
  );
  if (
    !row ||
    (c.boundTenantId && c.boundTenantId !== row.tenant_id) ||
    row.mobile !== c.identity.mobile
  )
    throw new AppError(404, "Invitation unavailable.");
  if (
    row.tenant_status !== "active" ||
    row.revoked_at ||
    String(row.expires_at) <= now() ||
    ["revoked", "rejected"].includes(String(row.status))
  )
    throw new AppError(410, "Invitation expired or closed.");
  assertEntitlement(
    String(row.subscription_status),
    String(row.subscription_expires),
    JSON.parse(String(row.modules)),
    "onboarding",
  );
  if (row.user_id) {
    if (row.user_id !== c.identity.userId)
      throw new AppError(409, "Invitation is already claimed.");
    return { id: row.tenant_id, caseId: row.id };
  }
  if (row.used_at) throw new AppError(409, "Invitation has already been used.");
  const role = await first(
    c.db,
    "SELECT id,permissions FROM roles WHERE tenant_id=? AND id=? AND name='Employee'",
    row.tenant_id,
    row.role_id,
  );
  if (
    !role ||
    JSON.parse(String(role.permissions)).some(
      (p: string) => p !== "report.view",
    )
  )
    throw new AppError(409, "Safe employee role configuration is required.");
  if (
    await first(
      c.db,
      "SELECT a.employee_id FROM employee_accounts a WHERE a.tenant_id=? AND a.user_id=? AND a.revoked_at IS NULL",
      row.tenant_id,
      c.identity.userId,
    )
  )
    throw new AppError(409, "This account is already linked to an employee.");
  if (
    await first(
      c.db,
      "SELECT m.id FROM memberships m JOIN membership_revocations r ON r.membership_id=m.id AND r.restored_at IS NULL WHERE m.tenant_id=? AND m.user_id=?",
      row.tenant_id,
      c.identity.userId,
    )
  )
    throw new AppError(403, "Company access was revoked.");
  const at = now(),
    results = await c.db.batch([
      stmt(
        c.db,
        "UPDATE onboarding_cases SET user_id=?,status='in_progress',version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND user_id IS NULL AND status='invited' AND EXISTS(SELECT 1 FROM invitations WHERE id=onboarding_cases.invitation_id AND mobile=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?)",
        c.identity.userId,
        at,
        row.id,
        row.tenant_id,
        c.identity.mobile,
        at,
      ),
      stmt(
        c.db,
        "INSERT OR IGNORE INTO memberships(id,tenant_id,user_id,email,role_id,created_at) SELECT ?,o.tenant_id,?,e.email,?,? FROM onboarding_cases o JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id WHERE o.id=? AND o.user_id=?",
        id(),
        c.identity.userId,
        row.role_id,
        at,
        row.id,
        c.identity.userId,
      ),
      stmt(
        c.db,
        "UPDATE invitations SET used_at=? WHERE id=? AND EXISTS(SELECT 1 FROM onboarding_cases WHERE invitation_id=invitations.id AND user_id=?)",
        at,
        row.invitation_id,
        c.identity.userId,
      ),
      guardedAudit(
        c.db,
        String(row.tenant_id),
        c.identity.userId,
        "onboarding.claimed",
        String(row.id),
        "changes()=1",
      ),
    ]);
  if (!results[0].meta.changes) {
    const latest = await first(
      c.db,
      "SELECT user_id FROM onboarding_cases WHERE id=?",
      row.id,
    );
    if (latest?.user_id !== c.identity.userId)
      throw new AppError(409, "Invitation changed or was claimed.");
  }
  return { id: row.tenant_id, caseId: row.id };
}
export async function onboardingRead(
  c: Context,
  config: PrivateConfig,
  view: string,
  tid: string,
  input: Record<string, string> = {},
) {
  if (view === "templates") {
    try {
      await scope(c, tid, "company.settings.manage");
    } catch {
      await privacyScope(c, tid, "onboarding", "onboarding");
    }
    return {
      rows: await all(
        c.db,
        "SELECT * FROM onboarding_templates WHERE tenant_id=? AND archived_at IS NULL ORDER BY name",
        tid,
      ),
      defaultDefinition: DEFAULT_TEMPLATE,
    };
  }
  if (view === "queue") {
    const t = await privacyScope(c, tid, "onboarding", "onboarding"),
      p = organizationPredicate(t, "e"),
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(input.page ?? 1),
      status = z
        .enum([
          "all",
          "invited",
          "in_progress",
          "submitted",
          "correction_required",
          "approved",
          "rejected",
          "revoked",
        ])
        .parse(input.status ?? "all");
    return {
      rows: await all(
        c.db,
        `SELECT o.id,o.employee_id,o.candidate_id,o.status,o.version,o.created_at,o.updated_at,o.reason,e.full_name,e.employee_code,i.expires_at FROM onboarding_cases o JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id JOIN invitations i ON i.id=o.invitation_id WHERE o.tenant_id=?${p.sql}${status === "all" ? "" : " AND o.status=?"} ORDER BY o.updated_at DESC,o.id LIMIT 25 OFFSET ?`,
        tid,
        ...p.args,
        ...(status === "all" ? [] : [status]),
        (page - 1) * 25,
      ),
      page,
    };
  }
  if (view === "case") {
    const isOwner = input.owner === "1",
      t = isOwner
        ? null
        : await privacyScope(c, tid, "onboarding", "onboarding"),
      row = isOwner
        ? await ownedCase(c, tid, input.id)
        : await adminCase(c, tid, input.id, t!),
      e = isOwner
        ? await first(
            c.db,
            "SELECT id,full_name,email,designation,joining_date,status FROM employees WHERE id=? AND tenant_id=?",
            row.employee_id,
            tid,
          )
        : await scopedEmployee(c, tid, t!, String(row.employee_id)),
      offer = row.offer_id
        ? await first(
            c.db,
            "SELECT terms,joining_date,expires_at,status,accepted_at FROM recruitment_offers WHERE id=? AND tenant_id=? AND candidate_id=?",
            row.offer_id,
            tid,
            row.candidate_id,
          )
        : null;
    await audit(c, tid, "onboarding.read", String(row.id)).run();
    return {
      case: {
        id: row.id,
        employee_id: row.employee_id,
        status: row.status,
        version: row.version,
        reason: row.reason,
        submitted_at: row.submitted_at,
        approved_at: row.approved_at,
        user_id: isOwner ? undefined : row.user_id,
      },
      employee: e,
      template: JSON.parse(String(row.template_snapshot)),
      form: row.form_ciphertext
        ? await unseal(
            config,
            String(row.form_ciphertext),
            `onboarding:${tid}:${row.id}`,
          )
        : {},
      offer,
      tasks: await all(
        c.db,
        "SELECT task_key,actor_id,completed_at FROM onboarding_task_completions WHERE tenant_id=? AND case_id=?",
        tid,
        row.id,
      ),
      history: await all(
        c.db,
        "SELECT action,actor_id,details,created_at FROM audit_logs WHERE tenant_id=? AND resource_id=? AND action LIKE 'onboarding.%' ORDER BY created_at,id LIMIT 100",
        tid,
        row.id,
      ),
    };
  }
  throw new AppError(404, "Onboarding view not found.");
}
export async function onboardingAction(
  c: Context,
  config: PrivateConfig,
  action: string,
  tid: string,
  input: unknown,
) {
  if (action === "template.save") {
    const t = await scope(c, tid, "company.settings.manage");
    assertCompanyWide(t);
    const d = z
        .object({
          id: z.string().uuid().optional(),
          name: z.string().trim().min(2).max(100),
          definition: templateDefinition,
          version: z.number().int().min(0).default(0),
        })
        .parse(input),
      templateId = d.id ?? id(),
      at = now();
    const r = await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO onboarding_templates(id,tenant_id,name,definition,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ?=0 OR ?=(SELECT version FROM onboarding_templates WHERE id=? AND tenant_id=?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,definition=excluded.definition,version=version+1,updated_at=excluded.updated_at WHERE onboarding_templates.tenant_id=? AND onboarding_templates.version=? AND onboarding_templates.archived_at IS NULL",
        templateId,
        tid,
        d.name,
        JSON.stringify(d.definition),
        at,
        at,
        d.version,
        d.version,
        templateId,
        tid,
        tid,
        d.version,
      ),
      audit(c, tid, "onboarding.template_change_requested", templateId),
    ]);
    if (!r[0].meta.changes)
      throw new AppError(409, "Template changed. Reload before saving.");
    return { id: templateId };
  }
  if (action === "case.create") {
    const t = await privacyScope(c, tid, "onboarding", "onboarding");
    await scope(c, tid, "employee.create");
    const d = z
        .object({
          templateId: z.string().uuid(),
          candidateId: z.string().uuid().optional(),
          employeeId: z.string().uuid().optional(),
          offerId: z.string().uuid().optional(),
          mobile: phone,
          expiryHours: z.number().int().min(1).max(168).default(48),
          designation: z.string().min(2).max(160).optional(),
          joiningDate: z.string().optional(),
        })
        .refine(
          (v) => Boolean(v.candidateId) !== Boolean(v.employeeId),
          "Choose candidate or employee",
        )
        .parse(input),
      template = await first(
        c.db,
        "SELECT * FROM onboarding_templates WHERE tenant_id=? AND id=? AND archived_at IS NULL",
        tid,
        d.templateId,
      );
    if (!template) throw new AppError(404, "Template not found.");
    let e: Row | null = null,
      candidate: Row | null = null,
      offer: Row | null = null;
    if (d.candidateId) {
      await scope(c, tid, "candidate.view", "recruitment");
      candidate = await scopedCandidate(c, tid, t, d.candidateId);
      if (candidate.stage !== "selected")
        throw new AppError(
          409,
          "Candidate must reach the selected stage before onboarding.",
        );
      offer = await first(
        c.db,
        "SELECT * FROM recruitment_offers WHERE tenant_id=? AND candidate_id=? AND id=? AND status='approved' AND expires_at>?",
        tid,
        d.candidateId,
        d.offerId ?? "",
        now(),
      );
      if (!offer)
        throw new AppError(409, "An approved, unexpired offer is required.");
      e = await first(
        c.db,
        "SELECT * FROM employees WHERE tenant_id=? AND email=?",
        tid,
        candidate.email,
      );
      if (e) await scopedEmployee(c, tid, t, String(e.id));
    } else e = await scopedEmployee(c, tid, t, d.employeeId!);
    if (
      e &&
      (await first(
        c.db,
        "SELECT employee_id FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND revoked_at IS NULL",
        tid,
        e.id,
      ))
    )
      throw new AppError(
        409,
        "Employee is already active. Use their verification profile.",
      );
    const organization = candidate
      ? {
          branchId: candidate.branch_id as string | null,
          departmentId: candidate.department_id as string | null,
        }
      : {
          branchId: e!.branch_id as string | null,
          departmentId: e!.department_id as string | null,
        };
    await validateOrganization(c, tid, organization);
    assertOrganizationScope(t, organization);
    const role = await first(
      c.db,
      "SELECT id,permissions FROM roles WHERE tenant_id=? AND name='Employee'",
      tid,
    );
    if (
      !role ||
      JSON.parse(String(role.permissions)).some(
        (p: string) => p !== "report.view",
      )
    )
      throw new AppError(409, "Safe Employee role configuration is required.");
    const p = await first(
        c.db,
        "SELECT * FROM employee_verification_policy WHERE tenant_id=?",
        tid,
      ),
      definition = templateDefinition.parse(
        JSON.parse(String(template.definition)),
      ),
      snapshot = {
        ...definition,
        panRequired: Boolean(p?.enabled && p.pan_required),
        hrReviewRequired: Boolean(p?.hr_review_required ?? 1),
        verificationPolicyVersion: Number(p?.version ?? 0),
      },
      cid = id(),
      eid = String(e?.id ?? id()),
      iid = id(),
      token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      at = now(),
      expiry = new Date(Date.now() + d.expiryHours * 3600000).toISOString(),
      v = employeeInput.parse({
        fullName: e?.full_name ?? candidate!.full_name,
        email: e?.email ?? candidate!.email,
        designation: e?.designation ?? d.designation ?? "New joiner",
        joiningDate: e?.joining_date ?? offer?.joining_date ?? d.joiningDate,
        departmentId: organization.departmentId,
        branchId: organization.branchId,
      });
    // Encrypt a probe before DB work: fail closed when key provisioning is absent.
    await seal(config, {}, `onboarding:${tid}:${cid}`);
    const commands: D1PreparedStatement[] = [];
    if (!e) {
      commands.push(
        stmt(c.db, "UPDATE tenants SET sequence=sequence+1 WHERE id=?", tid),
        stmt(
          c.db,
          "INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,department_id,branch_id,joining_date,status,created_at) SELECT ?,id,employee_prefix||'-'||printf('%05d',sequence),?,?,?,?,?,?,'onboarding',? FROM tenants WHERE id=?",
          eid,
          v.fullName,
          v.email,
          v.designation,
          v.departmentId,
          v.branchId,
          v.joiningDate,
          at,
          tid,
        ),
      );
    } else
      commands.push(
        stmt(
          c.db,
          "UPDATE employees SET status='onboarding',version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND version=?",
          at,
          eid,
          tid,
          e.version,
        ),
      );
    commands.push(
      stmt(
        c.db,
        "INSERT INTO invitations(id,tenant_id,email,mobile,role_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        iid,
        tid,
        v.email,
        d.mobile,
        role.id,
        await tokenHash(token),
        expiry,
        at,
      ),
      stmt(
        c.db,
        "INSERT INTO onboarding_cases(id,tenant_id,employee_id,candidate_id,offer_id,invitation_id,template_id,template_snapshot,creator_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        cid,
        tid,
        eid,
        d.candidateId ?? null,
        d.offerId ?? null,
        iid,
        d.templateId,
        JSON.stringify(snapshot),
        c.identity.userId,
        at,
        at,
      ),
      stmt(
        c.db,
        "INSERT INTO employee_history(id,tenant_id,employee_id,actor_id,kind,reason,snapshot,effective_date,created_at) VALUES(?,?,?,?,'onboarding_started','Draft onboarding reserved',?,?,?)",
        id(),
        tid,
        eid,
        c.identity.userId,
        JSON.stringify({
          status: "onboarding",
          candidateId: d.candidateId ?? null,
        }),
        v.joiningDate,
        at,
      ),
      audit(c, tid, "onboarding.created", cid, {
        candidate: Boolean(d.candidateId),
        mobileLast4: d.mobile.slice(-4),
      }),
    );
    await c.db.batch(commands);
    return {
      id: cid,
      employeeId: eid,
      inviteUrl: await inviteLink(c, tid, token),
      expiresAt: expiry,
      deliveryStatus: "not_sent",
    };
  }
  if (action === "case.purge_private") {
    const t = await privacyScope(c, tid, "onboarding", "onboarding");
    assertCompanyWide(t);
    await requireFreshSession(c, "purging expired onboarding submissions");
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const rows = await all(
      c.db,
      "SELECT id FROM onboarding_cases WHERE tenant_id=? AND status IN('approved','rejected','revoked') AND updated_at<? AND form_ciphertext IS NOT NULL ORDER BY updated_at LIMIT 20",
      tid,
      cutoff,
    );
    for (const r of rows)
      await c.db.batch([
        stmt(
          c.db,
          "UPDATE onboarding_cases SET form_ciphertext=NULL WHERE id=? AND tenant_id=? AND status IN('approved','rejected','revoked') AND updated_at<?",
          r.id,
          tid,
          cutoff,
        ),
        guardedAudit(
          c.db,
          tid,
          c.identity.userId,
          "onboarding.private_submission_purged",
          String(r.id),
          "changes()=1",
        ),
      ]);
    return { purged: rows.length, retentionDays: 90 };
  }
  const d = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().min(1).optional(),
      reason: z.string().trim().min(5).max(500).optional(),
      data: z.record(z.string().max(2000)).optional(),
      consent: z.boolean().optional(),
      taskKey: z.string().optional(),
      decision: z
        .enum(["approved", "rejected", "correction_required"])
        .optional(),
    })
    .parse(input);
  if (
    ["case.save", "case.submit", "offer.accept", "task.complete"].includes(
      action,
    )
  ) {
    let row: Row;
    try {
      row = await ownedCase(
        c,
        tid,
        d.id,
        ["case.save", "case.submit", "offer.accept"].includes(action),
      );
    } catch (error) {
      if (action !== "task.complete") throw error;
      const t = await privacyScope(c, tid, "onboarding", "onboarding");
      row = await adminCase(c, tid, d.id, t);
    }
    const definition = JSON.parse(String(row.template_snapshot)) as z.infer<
      typeof templateDefinition
    >;
    if (action === "task.complete") {
      const task = definition.tasks.find((f) => f.key === d.taskKey);
      if (!task) throw new AppError(422, "Task not found.");
      if (task.owner === "employee") {
        if (row.user_id !== c.identity.userId)
          throw new AppError(
            403,
            "Only the intended employee can acknowledge this task.",
          );
      } else await privacyScope(c, tid, "onboarding", "onboarding");
      await c.db.batch([
        stmt(
          c.db,
          "INSERT OR IGNORE INTO onboarding_task_completions(id,tenant_id,case_id,task_key,actor_id,completed_at) VALUES(?,?,?,?,?,?)",
          id(),
          tid,
          d.id,
          d.taskKey,
          c.identity.userId,
          now(),
        ),
        guardedAudit(
          c.db,
          tid,
          c.identity.userId,
          "onboarding.task_completed",
          d.id,
          "changes()=1",
          [],
          { task: d.taskKey },
        ),
      ]);
      return { saved: true };
    }
    if (action === "offer.accept") {
      if (!row.offer_id)
        throw new AppError(404, "No offer for this onboarding record.");
      if (!d.consent)
        throw new AppError(422, "Explicit offer acceptance is required.");
      const r = await c.db.batch([
        stmt(
          c.db,
          "UPDATE recruitment_offers SET status='accepted',accepted_by=?,accepted_at=?,version=version+1 WHERE id=? AND tenant_id=? AND candidate_id=? AND status='approved' AND expires_at>?",
          c.identity.userId,
          now(),
          row.offer_id,
          tid,
          row.candidate_id,
          now(),
        ),
        guardedAudit(
          c.db,
          tid,
          c.identity.userId,
          "onboarding.offer_accepted",
          d.id,
          "changes()=1",
        ),
      ]);
      if (!r[0].meta.changes) {
        const existing = await first(
          c.db,
          "SELECT accepted_by FROM recruitment_offers WHERE id=? AND tenant_id=?",
          row.offer_id,
          tid,
        );
        if (existing?.accepted_by !== c.identity.userId)
          throw new AppError(409, "Offer expired or changed.");
      }
      return { accepted: true };
    }
    if (d.version !== row.version)
      throw new AppError(409, "Onboarding changed. Reload before saving.");
    const values = d.data ?? {},
      allowed = definition.fields.map((f) => f.key);
    if (Object.keys(values).some((k) => !allowed.includes(k as never)))
      throw new AppError(422, "Unexpected or sensitive form field.");
    if (values.emergency_phone && !/^[6-9]\d{9}$/.test(values.emergency_phone))
      throw new AppError(422, "Enter a valid emergency contact mobile.");
    if (
      action === "case.submit" &&
      (definition.fields.some((f) => f.required && !values[f.key]?.trim()) ||
        !d.consent)
    )
      throw new AppError(
        422,
        "Complete required fields and consent before submitting.",
      );
    if (
      Object.values(values).some((v) =>
        /\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{12}\b/.test(v),
      )
    )
      throw new AppError(
        422,
        "Do not enter PAN or Aadhaar in general form fields. Use the verification flow.",
      );
    const cipher = await seal(config, values, `onboarding:${tid}:${d.id}`),
      at = now(),
      r = await c.db.batch([
        stmt(
          c.db,
          "UPDATE onboarding_cases SET form_ciphertext=?,form_consent_at=?,status=?,submitted_at=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND user_id=? AND version=? AND status IN('in_progress','correction_required')",
          cipher,
          d.consent ? at : row.form_consent_at,
          action === "case.submit" ? "submitted" : row.status,
          action === "case.submit" ? at : row.submitted_at,
          at,
          d.id,
          tid,
          c.identity.userId,
          d.version,
        ),
        guardedAudit(
          c.db,
          tid,
          c.identity.userId,
          action === "case.submit"
            ? "onboarding.submitted"
            : "onboarding.progress_saved",
          d.id,
          "changes()=1",
        ),
        outbox(
          c.db,
          tid,
          "onboarding_notice",
          d.id,
          `${action}:${d.id}:${d.version}`,
          "EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND version=?)",
          [d.id, Number(d.version) + 1],
        ),
      ]);
    if (!r[0].meta.changes)
      throw new AppError(409, "Submission changed or was closed.");
    return { saved: true };
  }
  const t = await privacyScope(
      c,
      tid,
      action === "case.review" ? "onboardingApproval" : "onboarding",
      "onboarding",
    ),
    row = await adminCase(c, tid, d.id, t);
  if (action === "case.reissue") {
    if (!["revoked", "rejected"].includes(String(row.status)) || !d.reason)
      throw new AppError(
        409,
        "A closed, inactive case and reissue reason are required.",
      );
    await requireFreshSession(c, "reissuing a closed onboarding invitation");
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      at = now(),
      results = await c.db.batch([
        stmt(
          c.db,
          "UPDATE onboarding_cases SET status=CASE WHEN user_id IS NULL THEN 'invited' ELSE 'correction_required' END,reason=?,submitted_at=NULL,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND version=? AND status IN('revoked','rejected') AND EXISTS(SELECT 1 FROM employees e WHERE e.id=onboarding_cases.employee_id AND e.tenant_id=onboarding_cases.tenant_id AND e.status='onboarding')",
          d.reason,
          at,
          d.id,
          tid,
          row.version,
        ),
        stmt(
          c.db,
          "UPDATE invitations SET token_hash=?,expires_at=?,revoked_at=NULL WHERE id=? AND EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND tenant_id=? AND version=? AND status IN('invited','correction_required'))",
          await tokenHash(token),
          new Date(Date.now() + 48 * 3600000).toISOString(),
          row.invitation_id,
          d.id,
          tid,
          Number(row.version) + 1,
        ),
        audit(c, tid, "onboarding.reissue_requested", d.id),
      ]);
    if (!results[0].meta.changes || !results[1].meta.changes)
      throw new AppError(409, "Case changed or employee is already active.");
    return {
      inviteUrl: await inviteLink(c, tid, token),
      deliveryStatus: "not_sent",
    };
  }
  if (action === "case.rotate") {
    if (["approved", "revoked", "rejected"].includes(String(row.status)))
      throw new AppError(409, "This case is closed.");
    await requireFreshSession(c, "rotating onboarding invitations");
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      r = await c.db.batch([
        stmt(
          c.db,
          "UPDATE invitations SET token_hash=?,expires_at=? WHERE id=? AND revoked_at IS NULL",
          await tokenHash(token),
          new Date(Date.now() + 48 * 3600000).toISOString(),
          row.invitation_id,
        ),
        audit(c, tid, "onboarding.link_rotated", d.id),
      ]);
    if (!r[0].meta.changes) throw new AppError(409, "Invitation was revoked.");
    return {
      inviteUrl: await inviteLink(c, tid, token),
      deliveryStatus: "not_sent",
    };
  }
  if (action === "case.revoke") {
    if (row.status === "approved")
      throw new AppError(
        409,
        "Use employee access revocation after activation.",
      );
    if (!d.reason) throw new AppError(422, "Revocation reason is required.");
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE onboarding_cases SET status='revoked',reason=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND status<>'approved'",
        d.reason,
        now(),
        d.id,
        tid,
      ),
      stmt(
        c.db,
        "UPDATE invitations SET revoked_at=? WHERE id=?",
        now(),
        row.invitation_id,
      ),
      audit(c, tid, "onboarding.revoked", d.id),
    ]);
    return { revoked: true };
  }
  if (action === "case.review") {
    await scope(c, tid, "employee.activate");
    await requireFreshSession(c, "approving employee activation");
    if (row.user_id === c.identity.userId)
      throw new AppError(403, "You cannot approve your own onboarding.");
    if (!d.reason || !d.decision)
      throw new AppError(422, "Review decision and reason are required.");
    if (row.status === "approved" && d.decision === "approved")
      return { approved: true, employeeId: row.employee_id, replayed: true };
    if (row.status !== "submitted" || row.version !== d.version)
      throw new AppError(409, "Onboarding changed or is not submitted.");
    if (d.decision !== "approved") {
      const at = now(),
        r = await c.db.batch([
          stmt(
            c.db,
            "UPDATE onboarding_cases SET status=?,reason=?,reviewer_id=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND status='submitted' AND version=?",
            d.decision,
            d.reason,
            c.identity.userId,
            at,
            d.id,
            tid,
            d.version,
          ),
          guardedAudit(
            c.db,
            tid,
            c.identity.userId,
            "onboarding.reviewed",
            d.id,
            "changes()=1",
            [],
            { decision: d.decision },
          ),
          outbox(
            c.db,
            tid,
            "onboarding_notice",
            d.id,
            `review:${d.id}:${d.version}`,
          ),
        ]);
      if (!r[0].meta.changes)
        throw new AppError(409, "Another reviewer completed this case.");
      return { saved: true };
    }
    const e = await scopedEmployee(c, tid, t, String(row.employee_id)),
      definition = JSON.parse(String(row.template_snapshot));
    if (!row.user_id || !row.form_consent_at || !row.form_ciphertext)
      throw new AppError(
        409,
        "Employee authentication and consented submission are required.",
      );
    const p = await first(
        c.db,
        "SELECT * FROM employee_verification_policy WHERE tenant_id=?",
        tid,
      ),
      needsPAN = Boolean(
        definition.panRequired || (p?.enabled && p.pan_required),
      );
    if (needsPAN) {
      const check = await first(
        c.db,
        "SELECT v.* FROM employee_verification_checks v JOIN onboarding_case_checks m ON m.check_id=v.id AND m.tenant_id=v.tenant_id AND m.employee_id=v.employee_id WHERE m.case_id=? AND v.id=? AND v.tenant_id=? AND v.employee_id=? AND v.product='pan_lite' AND v.user_id=?",
        d.id,
        row.current_check_id,
        tid,
        row.employee_id,
        row.user_id,
      );
      if (
        !check ||
        check.status !== "verified" ||
        String(check.retain_until) <= now() ||
        check.subject_name_hash !== (await digestText(String(e.full_name))) ||
        !["approved", "not_required"].includes(String(check.review_status)) ||
        ((definition.hrReviewRequired || p?.hr_review_required) &&
          check.review_status !== "approved")
      )
        throw new AppError(
          409,
          "Mandatory PAN verification and permitted independent HR review must be complete.",
        );
    }
    for (const req of definition.documents.filter(
      (v: { required: boolean }) => v.required,
    )) {
      const doc = await first(
        c.db,
        "SELECT d.id FROM document_slots s JOIN private_employee_documents d ON d.id=s.current_id AND d.tenant_id=s.tenant_id AND d.employee_id=s.employee_id WHERE s.tenant_id=? AND s.employee_id=? AND s.category=? AND d.scan_status='clean' AND d.review_status='approved' AND d.deleted_at IS NULL AND d.retain_until>? AND d.user_id=?",
        tid,
        row.employee_id,
        req.category,
        now(),
        row.user_id,
      );
      if (!doc)
        throw new AppError(
          409,
          "Required documents need scanner clearance and HR approval.",
        );
    }
    const completed = await all(
      c.db,
      "SELECT task_key FROM onboarding_task_completions WHERE tenant_id=? AND case_id=?",
      tid,
      d.id,
    );
    if (
      definition.tasks.some(
        (task: { required: boolean; key: string }) =>
          task.required && !completed.some((v) => v.task_key === task.key),
      )
    )
      throw new AppError(
        409,
        "Complete required joining checklist tasks first.",
      );
    if (row.candidate_id) {
      const offer = await first(
        c.db,
        "SELECT id FROM recruitment_offers WHERE tenant_id=? AND candidate_id=? AND id=? AND status='accepted' AND accepted_by=? AND accepted_at<=expires_at",
        tid,
        row.candidate_id,
        row.offer_id,
        row.user_id,
      );
      if (!offer)
        throw new AppError(
          409,
          "The intended employee must accept an approved, current offer.",
        );
    }
    const at = now(),
      nonce = id(),
      r = await c.db.batch([
        stmt(
          c.db,
          "UPDATE onboarding_cases SET status='approved',reviewer_id=?,approved_at=?,approval_nonce=?,reason=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND status='submitted' AND version=? AND EXISTS(SELECT 1 FROM employees WHERE id=onboarding_cases.employee_id AND tenant_id=onboarding_cases.tenant_id AND status='onboarding' AND version=?) AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=onboarding_cases.user_id AND m.tenant_id=onboarding_cases.tenant_id AND NOT EXISTS(SELECT 1 FROM membership_revocations rv WHERE rv.membership_id=m.id AND rv.restored_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM employee_accounts a WHERE a.tenant_id=onboarding_cases.tenant_id AND a.user_id=onboarding_cases.user_id AND a.revoked_at IS NULL) AND (SELECT count(*) FROM employees WHERE tenant_id=? AND status='active')<?",
          c.identity.userId,
          at,
          nonce,
          d.reason,
          at,
          d.id,
          tid,
          d.version,
          e.version,
          tid,
          t.employee_limit,
        ),
        stmt(
          c.db,
          "UPDATE employees SET status='active',version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND approval_nonce=?)",
          at,
          row.employee_id,
          tid,
          d.id,
          nonce,
        ),
        stmt(
          c.db,
          "INSERT INTO employee_accounts(employee_id,tenant_id,user_id,actor_id,created_at) SELECT employee_id,tenant_id,user_id,?,? FROM onboarding_cases WHERE id=? AND approval_nonce=? ON CONFLICT(employee_id) DO UPDATE SET user_id=excluded.user_id,actor_id=excluded.actor_id,created_at=excluded.created_at,revoked_at=NULL,version=employee_accounts.version+1",
          c.identity.userId,
          at,
          d.id,
          nonce,
        ),
        stmt(
          c.db,
          "INSERT INTO employee_history(id,tenant_id,employee_id,actor_id,kind,reason,snapshot,effective_date,created_at) SELECT ?,tenant_id,employee_id,?,'onboarding_activated',?,json_object('case_id',id,'status','active'),?,? FROM onboarding_cases WHERE id=? AND approval_nonce=?",
          id(),
          c.identity.userId,
          d.reason,
          at.slice(0, 10),
          at,
          d.id,
          nonce,
        ),
        guardedAudit(
          c.db,
          tid,
          c.identity.userId,
          "onboarding.approved",
          d.id,
          "EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND approval_nonce=?)",
          [d.id, nonce],
        ),
        outbox(
          c.db,
          tid,
          "onboarding_notice",
          d.id,
          `approved:${d.id}`,
          "EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND approval_nonce=?)",
          [d.id, nonce],
        ),
      ]);
    if (!r[0].meta.changes)
      throw new AppError(
        409,
        "Activation conditions changed or employee quota was reached.",
      );
    return { approved: true, employeeId: row.employee_id };
  }
  throw new AppError(404, "Onboarding action not found.");
}
