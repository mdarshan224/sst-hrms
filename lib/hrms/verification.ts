import { z } from "zod";
import { AppError } from "./domain.ts";
import {
  scope,
  platform,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  json,
  requireFreshSession,
  assertCompanyWide,
  scopedEmployee,
  organizationPredicate,
} from "./access.ts";
import type { Context } from "./access.ts";
import { verificationEmployee } from "./verification-subject.ts";
import { digestText } from "./private-config.ts";
import { outbox } from "./outbox.ts";
import { privacyScope } from "./privacy.ts";
import {
  verifyPan,
  panRequest,
  credentialStatus,
  verifySecureIdWebhook,
} from "./cashfree.ts";
import type { CashfreeConfig, CashfreeMode } from "./cashfree.ts";
export const CONSENT_VERSION = "pan-lite-v1";
export const CONSENT_NOTICE =
  "I consent to sending my PAN, date of birth and registered employee name to Cashfree Secure ID for employment identity verification. HR may review the masked result. Full PAN and date of birth are not retained by this application. I can contact my company HR to request correction or deletion.";
async function settings(c: Context) {
  return (
    (await first(
      c.db,
      "SELECT * FROM secure_id_platform WHERE id='cashfree'",
    )) ?? {
      enabled: 0,
      pan_enabled: 0,
      mode: "sandbox",
      version: 0,
      last_test_at: null,
    }
  );
}
async function policy(c: Context, tid: string) {
  return (
    (await first(
      c.db,
      "SELECT * FROM employee_verification_policy WHERE tenant_id=?",
      tid,
    )) ?? {
      enabled: 0,
      pan_required: 0,
      hr_review_required: 1,
      retention_days: 90,
      version: 0,
    }
  );
}
async function available(c: Context, config: CashfreeConfig) {
  const g = await settings(c),
    mode = g.mode as CashfreeMode;
  if (
    !g.enabled ||
    !g.pan_enabled ||
    !credentialStatus(config, mode).configured
  )
    throw new AppError(
      503,
      "PAN Lite verification is unavailable. Contact your company administrator.",
    );
  if (
    mode === "production" &&
    (!config.productionApproved || !config.production.publicKey)
  )
    throw new AppError(
      503,
      "Production verification is not approved or configured.",
    );
  return { g, mode };
}
async function grant(c: Context, tid: string, review = false) {
  const t = await scope(c, tid, "", "employee_verification");
  // Explicit privacy grants are separate from broad role presets and support access.
  const g = await first(
    c.db,
    "SELECT g.can_view,g.can_review FROM verification_role_grants g JOIN memberships m ON m.role_id=g.role_id AND m.tenant_id=g.tenant_id WHERE g.tenant_id=? AND m.user_id=?",
    tid,
    c.identity.userId,
  );
  if (!g?.can_view || (review && !g.can_review))
    throw new AppError(
      403,
      "An explicit employee verification permission is required.",
    );
  return t;
}
export async function verificationRead(
  c: Context,
  config: CashfreeConfig,
  view: string,
  tid: string,
  input: Record<string, string> = {},
) {
  if (view === "platform") {
    platform(c);
    const g = await settings(c);
    return {
      settings: g,
      credentials: {
        sandbox: credentialStatus(config, "sandbox"),
        production: credentialStatus(config, "production"),
      },
      products: {
        pan_lite: "implemented",
        aadhaar: "unavailable",
        digilocker: "hosted_consent_adapter_account_gated",
        ocr: "unavailable",
        bank: "unavailable",
      },
    };
  }
  if (view === "policy") {
    const t = await scope(c, tid, "company.settings.manage");
    assertCompanyWide(t);
    return {
      policy: await policy(c, tid),
      platformEnabled: Boolean((await settings(c)).enabled),
      roles:
        t.role_name === "Company Owner"
          ? await all(
              c.db,
              "SELECT r.id,r.name,coalesce(g.can_view,0) can_view,coalesce(g.can_review,0) can_review,coalesce(g.can_view_documents,0) can_view_documents,coalesce(g.can_review_documents,0) can_review_documents,coalesce(g.can_manage_onboarding,0) can_manage_onboarding,coalesce(g.can_approve_onboarding,0) can_approve_onboarding FROM roles r LEFT JOIN verification_role_grants g ON g.role_id=r.id AND g.tenant_id=r.tenant_id WHERE r.tenant_id=?",
              tid,
            )
          : [],
    };
  }
  if (view === "self") {
    await scope(c, tid, "", "employee_verification");
    const e = await verificationEmployee(c, tid, input.caseId);
    return {
      employeeName: e.full_name,
      policy: await policy(c, tid),
      consentVersion: CONSENT_VERSION,
      consentNotice: CONSENT_NOTICE,
      rows: await all(
        c.db,
        "SELECT id,product,status,mode,masked_identifier,provider_reference,name_matched,dob_matched,review_status,review_reason,created_at,completed_at,retain_until FROM employee_verification_checks WHERE tenant_id=? AND employee_id=? AND retain_until>? ORDER BY created_at DESC LIMIT 50",
        tid,
        e.id,
        now(),
      ),
    };
  }
  if (view === "queue") {
    const t = await grant(c, tid),
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
          "pending",
          "verified",
          "failed",
          "needs_manual_review",
          "needs_reconciliation",
          "name_review",
        ])
        .parse(input.status ?? "all");
    let where = `v.tenant_id=? AND v.retain_until>?${p.sql}`;
    const args: unknown[] = [tid, now(), ...p.args];
    if (status === "name_review") {
      where +=
        " AND (v.name_matched=0 OR v.name_score < (SELECT name_review_threshold FROM employee_verification_policy WHERE tenant_id=v.tenant_id))";
    } else if (status !== "all") {
      where += " AND v.status=?";
      args.push(status);
    }
    const rows = await all(
      c.db,
      `SELECT v.id,v.employee_id,e.full_name,v.product,v.status,v.mode,v.masked_identifier,v.provider_reference,v.name_matched,v.name_score,v.dob_matched,v.review_status,v.review_reason,v.reviewer_id,v.created_at,v.completed_at FROM employee_verification_checks v JOIN employees e ON e.tenant_id=v.tenant_id AND e.id=v.employee_id WHERE ${where} ORDER BY v.created_at DESC,v.id LIMIT 25 OFFSET ?`,
      ...args,
      (page - 1) * 25,
    );
    await audit(c, tid, "verification.queue_read", tid, { page, status }).run();
    return { rows, page };
  }
  if (view === "employee") {
    const t = await privacyScope(c, tid, "view", "employee_verification"),
      e = await scopedEmployee(
        c,
        tid,
        t,
        z.string().uuid().parse(input.employeeId),
      );
    await audit(c, tid, "verification.employee_read", String(e.id)).run();
    return {
      employeeName: e.full_name,
      rows: await all(
        c.db,
        "SELECT id,product,status,mode,masked_identifier,provider_reference,name_matched,dob_matched,name_score,review_status,review_reason,reviewer_id,created_at,completed_at,transport_status,purpose FROM employee_verification_checks WHERE tenant_id=? AND employee_id=? AND retain_until>? ORDER BY created_at DESC,id DESC LIMIT 100",
        tid,
        e.id,
        now(),
      ),
      history: await all(
        c.db,
        "SELECT r.kind,r.outcome,r.reason,r.actor_id,r.created_at FROM verification_reconciliations r WHERE r.tenant_id=? AND r.employee_id=? ORDER BY r.created_at DESC LIMIT 100",
        tid,
        e.id,
      ),
    };
  }
  throw new AppError(404, "Verification view not found.");
}
const platformInput = z.object({
  enabled: z.boolean(),
  mode: z.enum(["sandbox", "production"]),
  panEnabled: z.boolean(),
  digilockerEnabled: z.boolean().default(false),
  version: z.number().int().min(0),
});
const policyInput = z.object({
  enabled: z.boolean(),
  panRequired: z.boolean(),
  hrReviewRequired: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  version: z.number().int().min(0),
  nameReviewThreshold: z.number().int().min(50).max(100).default(100),
  digilockerEnabled: z.boolean().default(false),
});
export async function verificationAction(
  c: Context,
  config: CashfreeConfig,
  action: string,
  tid: string,
  data: unknown,
) {
  if (action === "platform.save") {
    platform(c);
    await requireFreshSession(c, "changing Secure ID configuration");
    const d = platformInput.parse(data);
    if (
      d.enabled &&
      d.mode === "production" &&
      (!config.productionApproved ||
        !config.production.publicKey ||
        !credentialStatus(config, "production").configured)
    )
      throw new AppError(
        503,
        "Validate production account/product entitlement and configure RSA authentication before enabling production.",
      );
    if (
      d.digilockerEnabled &&
      !(
        d.mode === "sandbox"
          ? config.sandboxProducts
          : config.productionProducts
      )?.includes("digilocker")
    )
      throw new AppError(
        503,
        "Validate DigiLocker account entitlement before enabling hosted consent.",
      );
    const result = await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO secure_id_platform(id,enabled,mode,pan_enabled,digilocker_enabled,version,updated_at) SELECT 'cashfree',?,?,?,?,?,? WHERE ?=0 OR ?=(SELECT version FROM secure_id_platform WHERE id='cashfree') ON CONFLICT(id) DO UPDATE SET enabled=?,mode=?,pan_enabled=?,digilocker_enabled=?,version=version+1,updated_at=?,last_test_at=NULL WHERE secure_id_platform.version=?",
        Number(d.enabled),
        d.mode,
        Number(d.panEnabled),
        Number(d.digilockerEnabled),
        1,
        now(),
        d.version,
        d.version,
        Number(d.enabled),
        d.mode,
        Number(d.panEnabled),
        Number(d.digilockerEnabled),
        now(),
        d.version,
      ),
      audit(c, null, "secure_id.configuration_change_requested", "cashfree", {
        enabled: d.enabled,
        mode: d.mode,
        version: d.version,
      }),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "Configuration changed. Reload before saving.");
    return { saved: true };
  }
  if (action === "platform.test") {
    platform(c);
    await requireFreshSession(c, "testing Cashfree sandbox");
    const outcome = await verifyPan(config, "sandbox", {
      pan: "ABCPV1234D",
      name: "John Doe",
      dob: "1993-06-30",
      verification_id: "test_" + id().replaceAll("-", ""),
    });
    if (outcome.outcome !== "verified")
      throw new AppError(502, "Sandbox returned an inconclusive test result.");
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE secure_id_platform SET last_test_at=?,updated_at=? WHERE id='cashfree' AND mode='sandbox'",
        now(),
        now(),
      ),
      audit(c, null, "secure_id.sandbox_connection_test", "cashfree"),
    ]);
    return { connected: true, mode: "sandbox" };
  }
  if (action === "policy.save") {
    const t = await scope(c, tid, "company.settings.manage");
    assertCompanyWide(t);
    const d = policyInput.parse(data),
      g = await settings(c);
    if (d.enabled)
      await scope(c, tid, "company.settings.manage", "employee_verification");
    if (d.digilockerEnabled && !g.digilocker_enabled)
      throw new AppError(503, "Hosted consent is not globally available.");
    if (d.enabled && (!g.enabled || !g.pan_enabled))
      throw new AppError(403, "The platform must enable PAN Lite first.");
    const r = await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO employee_verification_policy(tenant_id,enabled,pan_required,hr_review_required,retention_days,name_review_threshold,digilocker_enabled,version,updated_at) SELECT ?,?,?,?,?,?,?,1,? WHERE ?=0 OR ?=(SELECT version FROM employee_verification_policy WHERE tenant_id=?) ON CONFLICT(tenant_id) DO UPDATE SET enabled=?,pan_required=?,hr_review_required=?,retention_days=?,name_review_threshold=?,digilocker_enabled=?,version=version+1,updated_at=? WHERE employee_verification_policy.version=?",
        tid,
        Number(d.enabled),
        Number(d.panRequired),
        Number(d.hrReviewRequired),
        d.retentionDays,
        d.nameReviewThreshold,
        Number(d.digilockerEnabled),
        now(),
        d.version,
        d.version,
        tid,
        Number(d.enabled),
        Number(d.panRequired),
        Number(d.hrReviewRequired),
        d.retentionDays,
        d.nameReviewThreshold,
        Number(d.digilockerEnabled),
        now(),
        d.version,
      ),
      audit(c, tid, "verification.policy_change_requested", tid, {
        version: d.version,
      }),
    ]);
    if (!r[0].meta.changes)
      throw new AppError(409, "Policy changed. Reload before saving.");
    return { saved: true };
  }
  if (action === "privacy.grant") {
    const t = await scope(c, tid, "company.settings.manage");
    assertCompanyWide(t);
    await requireFreshSession(c, "granting verification access");
    if (t.role_name !== "Company Owner")
      throw new AppError(
        403,
        "Only the authenticated company owner can grant this sensitive permission.",
      );
    const d = z
      .object({
        roleId: z.string().uuid(),
        canView: z.boolean(),
        canReview: z.boolean(),
        canViewDocuments: z.boolean().default(false),
        canReviewDocuments: z.boolean().default(false),
        canManageOnboarding: z.boolean().default(false),
        canApproveOnboarding: z.boolean().default(false),
      })
      .parse(data);
    if (d.canReviewDocuments && !d.canViewDocuments)
      throw new AppError(
        422,
        "Document review requires document view permission.",
      );
    if (d.canApproveOnboarding && !d.canManageOnboarding)
      throw new AppError(
        422,
        "Onboarding approval requires workflow management permission.",
      );
    if (d.canReview && !d.canView)
      throw new AppError(422, "Review permission requires view permission.");
    if (
      !(await first(
        c.db,
        "SELECT id FROM roles WHERE id=? AND tenant_id=?",
        d.roleId,
        tid,
      ))
    )
      throw new AppError(404, "Role not found.");
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO verification_role_grants(role_id,tenant_id,can_view,can_review,can_view_documents,can_review_documents,can_manage_onboarding,can_approve_onboarding,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(role_id) DO UPDATE SET can_view=excluded.can_view,can_review=excluded.can_review,can_view_documents=excluded.can_view_documents,can_review_documents=excluded.can_review_documents,can_manage_onboarding=excluded.can_manage_onboarding,can_approve_onboarding=excluded.can_approve_onboarding,updated_at=excluded.updated_at",
        d.roleId,
        tid,
        Number(d.canView),
        Number(d.canReview),
        Number(d.canViewDocuments),
        Number(d.canReviewDocuments),
        Number(d.canManageOnboarding),
        Number(d.canApproveOnboarding),
        now(),
      ),
      audit(c, tid, "verification.privacy_grant", d.roleId, {
        canView: d.canView,
        canReview: d.canReview,
        canViewDocuments: d.canViewDocuments,
        canReviewDocuments: d.canReviewDocuments,
        canManageOnboarding: d.canManageOnboarding,
        canApproveOnboarding: d.canApproveOnboarding,
      }),
    ]);
    return { saved: true };
  }
  if (action === "pan.start") {
    await scope(c, tid, "", "employee_verification");
    const e = await verificationEmployee(
        c,
        tid,
        (data as Record<string, unknown>)?.caseId,
        true,
      ),
      d = z
        .object({
          pan: z.string(),
          dob: z.string(),
          requestId: z.string().uuid(),
          consent: z.literal(true),
          consentVersion: z.literal(CONSENT_VERSION),
          caseId: z.string().uuid().optional(),
        })
        .parse(data),
      v = panRequest.parse({
        pan: d.pan,
        dob: d.dob,
        name: e.full_name,
        verification_id: "pan_" + id().replaceAll("-", ""),
      }),
      { g, mode } = await available(c, config),
      p = await policy(c, tid);
    if (!p.enabled)
      throw new AppError(403, "Company verification is disabled.");
    const fingerprint = await requestDigest(
        config[mode].clientSecret!,
        json([v.pan, v.dob, v.name, mode]),
      ),
      existing = await first(
        c.db,
        "SELECT id,request_hash,status FROM employee_verification_checks WHERE tenant_id=? AND employee_id=? AND request_id=?",
        tid,
        e.id,
        d.requestId,
      );
    if (existing) {
      if (existing.request_hash !== fingerprint)
        throw new AppError(
          409,
          "The retry does not match the original request.",
        );
      return { id: existing.id, status: existing.status, replayed: true };
    }
    if (
      await first(
        c.db,
        "SELECT id FROM employee_verification_checks WHERE tenant_id=? AND employee_id=? AND product='pan_lite' AND status IN('pending','needs_reconciliation')",
        tid,
        e.id,
      )
    )
      throw new AppError(
        409,
        "Reconcile the original provider request before initiating another check.",
      );
    const vid = v.verification_id,
      at = now();
    const inserted = await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO employee_verification_checks(id,tenant_id,employee_id,user_id,request_id,request_hash,mode,masked_identifier,consent_version,consent_at,policy_version,review_status,created_at,retain_until) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM employee_verification_policy WHERE tenant_id=? AND enabled=1 AND version=?) AND EXISTS(SELECT 1 FROM secure_id_platform WHERE id='cashfree' AND enabled=1 AND pan_enabled=1 AND mode=? AND version=?)",
        vid,
        tid,
        e.id,
        c.identity.userId,
        d.requestId,
        fingerprint,
        mode,
        "******" + v.pan.slice(-4),
        CONSENT_VERSION,
        at,
        p.version,
        p.hr_review_required ? "pending" : "not_required",
        at,
        new Date(
          Date.now() + Number(p.retention_days) * 86400000,
        ).toISOString(),
        tid,
        p.version,
        mode,
        g.version,
      ),
      audit(c, tid, "verification.consented", vid, {
        product: "pan_lite",
        noticeVersion: CONSENT_VERSION,
        mode,
      }),
    ]);
    if (!inserted[0].meta.changes)
      throw new AppError(
        409,
        "Verification policy changed. Reload before starting a check.",
      );
    await stmt(
      c.db,
      "UPDATE employee_verification_checks SET subject_name_hash=?,transport_status='sent_unknown' WHERE id=? AND tenant_id=?",
      await digestText(String(e.full_name)),
      vid,
      tid,
    ).run();
    if (d.caseId) {
      const mapped = await c.db.batch([
        stmt(
          c.db,
          "INSERT INTO onboarding_case_checks(check_id,tenant_id,employee_id,case_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM onboarding_cases WHERE id=? AND tenant_id=? AND employee_id=? AND user_id=? AND status IN('in_progress','correction_required'))",
          vid,
          tid,
          e.id,
          d.caseId,
          at,
          d.caseId,
          tid,
          e.id,
          c.identity.userId,
        ),
        stmt(
          c.db,
          "UPDATE onboarding_cases SET current_check_id=?,version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND EXISTS(SELECT 1 FROM onboarding_case_checks WHERE case_id=onboarding_cases.id AND check_id=?)",
          vid,
          now(),
          d.caseId,
          tid,
          vid,
        ),
      ]);
      if (!mapped[0].meta.changes) {
        await stmt(
          c.db,
          "UPDATE employee_verification_checks SET status='cancelled',transport_status='not_sent' WHERE id=?",
          vid,
        ).run();
        throw new AppError(
          409,
          "Onboarding closed before verification was sent.",
        );
      }
    }
    try {
      const outcome = await verifyPan(config, mode, v);
      await c.db.batch([
        stmt(
          c.db,
          "UPDATE employee_verification_checks SET status=?,provider_reference=?,name_matched=?,dob_matched=?,pan_status=?,completed_at=?,name_score=?,transport_status='confirmed' WHERE id=? AND tenant_id=? AND status='pending'",
          outcome.outcome,
          outcome.referenceId,
          Number(outcome.nameMatched),
          Number(outcome.dobMatched),
          outcome.panStatus,
          now(),
          outcome.nameScore,
          vid,
          tid,
        ),
        audit(c, tid, "verification.provider_result", vid, {
          status: outcome.outcome,
          mode,
        }),
      ]);
      return { id: vid, status: outcome.outcome };
    } catch {
      await c.db.batch([
        stmt(
          c.db,
          "UPDATE employee_verification_checks SET status='needs_reconciliation' WHERE id=? AND tenant_id=? AND status='pending'",
          vid,
          tid,
        ),
        audit(c, tid, "verification.provider_inconclusive", vid),
      ]);
      throw new AppError(
        503,
        "Provider outcome is uncertain. HR must reconcile it before another attempt. No automatic retry was sent.",
      );
    }
  }
  if (action === "reconcile.manual") {
    const t = await grant(c, tid, true);
    await requireFreshSession(c, "resolving uncertain provider operations");
    const d = z
        .object({
          id: z.string().max(50),
          outcome: z.enum(["unresolved", "cancelled_without_verification"]),
          reason: z.string().trim().min(10).max(500),
          supportReference: z.string().regex(/^[A-Za-z0-9._-]{3,100}$/),
          confirmedNotProcessed: z.boolean().default(false),
        })
        .parse(data),
      r = await first(
        c.db,
        "SELECT * FROM employee_verification_checks WHERE id=? AND tenant_id=?",
        d.id,
        tid,
      );
    if (!r) throw new AppError(404, "Verification not found.");
    await scopedEmployee(c, tid, t, String(r.employee_id));
    if (r.user_id === c.identity.userId)
      throw new AppError(403, "You cannot reconcile your own check.");
    if (!["pending", "needs_reconciliation"].includes(String(r.status)))
      throw new AppError(409, "Provider state is already final.");
    if (
      d.outcome === "cancelled_without_verification" &&
      !d.confirmedNotProcessed
    )
      throw new AppError(
        422,
        "Provider confirmation that the original request was not processed/charged is required before permitting a new request.",
      );
    const at = now();
    const result = await c.db.batch([
      stmt(
        c.db,
        "UPDATE employee_verification_checks SET status=CASE WHEN ?='cancelled_without_verification' THEN 'cancelled' ELSE status END,transport_status=CASE WHEN ?='cancelled_without_verification' THEN 'manually_closed_unverified' ELSE transport_status END WHERE id=? AND tenant_id=? AND status IN('pending','needs_reconciliation')",
        d.outcome,
        d.outcome,
        d.id,
        tid,
      ),
      stmt(
        c.db,
        "INSERT INTO verification_reconciliations(id,tenant_id,employee_id,check_id,actor_id,kind,outcome,reason,created_at) SELECT ?,?,?,?,?, 'provider_support',?,?,? WHERE changes()=1",
        id(),
        tid,
        r.employee_id,
        d.id,
        c.identity.userId,
        d.outcome,
        JSON.stringify({
          reason: d.reason,
          supportReference: d.supportReference,
          confirmedNotProcessed: d.confirmedNotProcessed,
        }),
        at,
      ),
      audit(c, tid, "verification.manual_resolution_requested", d.id, {
        outcome: d.outcome,
      }),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "Verification changed.");
    return { saved: true, verified: false };
  }
  if (action === "review") {
    const t = await grant(c, tid, true),
      d = z
        .object({
          id: z.string().min(1).max(50),
          decision: z.enum(["approved", "rejected", "correction_required"]),
          reason: z.string().trim().min(5).max(500),
        })
        .parse(data),
      r = await first(
        c.db,
        "SELECT * FROM employee_verification_checks WHERE id=? AND tenant_id=? AND retain_until>?",
        d.id,
        tid,
        now(),
      );
    if (!r) throw new AppError(404, "Verification not found.");
    await scopedEmployee(c, tid, t, String(r.employee_id));
    if (r.user_id === c.identity.userId)
      throw new AppError(403, "You cannot review your own identity check.");
    if (d.decision === "approved" && r.status !== "verified")
      throw new AppError(
        409,
        "An inconclusive or failed provider check cannot be approved as verified.",
      );
    if (r.status === "pending" || r.status === "needs_reconciliation")
      throw new AppError(
        409,
        "Reconcile the provider outcome before reviewing.",
      );
    const result = await c.db.batch([
      stmt(
        c.db,
        "UPDATE employee_verification_checks SET review_status=?,reviewer_id=?,review_reason=?,reviewed_at=? WHERE id=? AND tenant_id=? AND review_status='pending'",
        d.decision,
        c.identity.userId,
        d.reason,
        now(),
        d.id,
        tid,
      ),
      audit(c, tid, "verification.review_requested", d.id, {
        decision: d.decision,
      }),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "This review has already been completed.");
    return { saved: true };
  }
  throw new AppError(404, "Verification action not found.");
}
async function requestDigest(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function receiveSecureIdWebhook(
  c: Pick<Context, "db">,
  config: CashfreeConfig,
  mode: CashfreeMode,
  raw: Uint8Array,
  timestamp: string,
  signature: string,
) {
  const secret = config[mode].clientSecret;
  if (!secret) throw new AppError(503, "Webhook credentials are unavailable.");
  if (!(await verifySecureIdWebhook(raw, timestamp, signature, secret)))
    throw new AppError(403, "Invalid webhook signature or timestamp.");
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(raw)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let hint: { verification_id?: unknown; reference_id?: unknown };
  try {
    hint = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    hint = {};
  }
  const verificationId =
    typeof hint?.verification_id === "string" &&
    /^dgl_[a-f0-9]{32}$/.test(hint.verification_id)
      ? hint.verification_id
      : null;
  const flow = verificationId
    ? await first(
        c.db,
        "SELECT id,tenant_id,provider_reference FROM hosted_verification_flows WHERE id=? AND mode=?",
        verificationId,
        mode,
      )
    : null;
  const reference =
    typeof hint?.reference_id === "number" &&
    Number.isSafeInteger(hint.reference_id)
      ? String(hint.reference_id)
      : null;
  const matched =
    flow &&
    reference &&
    (!flow.provider_reference || flow.provider_reference === reference);
  const receiptId = id(),
    commands = [
      stmt(
        c.db,
        "INSERT INTO secure_id_webhook_receipts(id,mode,body_hash,received_at,processing_status,check_id,last_error) VALUES(?,?,?,?,?,?,?) ON CONFLICT(mode,body_hash) DO NOTHING",
        receiptId,
        mode,
        hash,
        now(),
        matched ? "queued" : "unsupported",
        matched ? verificationId : null,
        matched
          ? null
          : "No documented supported correlation. Provider payload was discarded.",
      ),
    ];
  if (matched)
    commands.push(
      outbox(
        c.db,
        String(flow.tenant_id),
        "hosted_reconcile",
        String(flow.id),
        `webhook:${mode}:${hash}`,
      ),
    );
  const result = await c.db.batch(commands);
  return {
    accepted: true,
    duplicate: result[0].meta.changes === 0,
    queued: Boolean(matched),
    applied: false,
  };
}
