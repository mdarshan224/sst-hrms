import { claimOnboarding } from "./onboarding.ts";
import {
  workspaceSlug,
  slugFromName,
  slugCandidate,
} from "./workspace-links.ts";
import {
  publicBrand,
  platformBrand,
  validateLogo,
  primaryContrast,
} from "./branding.ts";
import {
  dashboardModes,
  inviteEmployee,
  acceptEmployeeActivation,
  unlinkEmployee,
  assignManager,
  requestProfileChange,
  reviewProfileChange,
} from "./employee-portal.ts";
import {
  employeePage,
  candidatePage,
  jobPage,
  workspaceStats,
  changeEmployee,
  changeJob,
  revokeMember,
} from "./records.ts";
import {
  AppError,
  permissions,
  defaultStages,
  tenantInput,
  employeeInput,
  jobInput,
  candidateInput,
  roleInput,
  inviteInput,
  brandingInput,
  assertTransition,
  tokenHash,
  dashboardInput,
} from "./domain.ts";
import type { Stage } from "./domain.ts";
import {
  scope,
  isPlatform,
  platform,
  all,
  first,
  stmt,
  audit,
  now,
  id,
  json,
  assertCompanyWide,
  assertOrganizationScope,
  validateOrganization,
  assertDelegation,
  roleForDelegation,
  scopedCandidate,
  organizationPredicate,
  requireFreshSession,
} from "./access.ts";
import type { Context, Row } from "./access.ts";
export { scope, isPlatform, all, first } from "./access.ts";
export type { Context, Identity } from "./access.ts";
export async function bootstrap(c: Context) {
  const workspaces = await all(
    c.db,
    "SELECT t.*,r.name role_name,r.permissions FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.user_id=? AND (? IS NULL OR t.id=?) AND NOT EXISTS(SELECT 1 FROM membership_revocations rv WHERE rv.membership_id=m.id AND rv.restored_at IS NULL) ORDER BY t.name",
    c.identity.userId,
    c.boundTenantId ?? null,
    c.boundTenantId ?? null,
  );
  if (isPlatform(c) && c.sessionId) {
    const support = await all(
      c.db,
      "SELECT DISTINCT t.*, 'Platform support' role_name,? permissions,g.expires_at support_expires_at FROM support_access g JOIN tenants t ON t.id=g.tenant_id WHERE g.user_id=? AND g.session_id=? AND g.revoked_at IS NULL AND g.expires_at>?",
      json(permissions),
      c.identity.userId,
      c.sessionId,
      now(),
    );
    for (const t of support)
      if (!workspaces.some((w) => w.id === t.id)) workspaces.push(t);
  }
  return {
    user: c.identity,
    platform: isPlatform(c),
    permissions: [...permissions],
    workspaces,
  };
}
export async function readWorkspace(c: Context, tenantId: string) {
  const t = await scope(c, tenantId, "");
  t.privacy_grants = json(
    (await first(
      c.db,
      "SELECT g.can_view,g.can_review,g.can_view_documents,g.can_review_documents,g.can_manage_onboarding,g.can_approve_onboarding FROM verification_role_grants g JOIN memberships m ON m.role_id=g.role_id AND m.tenant_id=g.tenant_id WHERE g.tenant_id=? AND m.user_id=?",
      tenantId,
      c.identity.userId,
    )) ?? {},
  );
  const grants = JSON.parse(String(t.permissions)) as string[],
    modules = JSON.parse(String(t.modules)) as string[];
  const available = (p: string) => grants.includes(p);
  const employeeResult = available("employee.view")
    ? await employeePage(c, tenantId, {})
    : null;
  const jobsResult =
    available("job.view") && modules.includes("recruitment")
      ? await jobPage(c, tenantId, {})
      : null;
  const candidateResult =
    available("candidate.view") && modules.includes("recruitment")
      ? await candidatePage(c, tenantId, {})
      : null;
  const roles = available("role.manage")
    ? await all(
        c.db,
        "SELECT r.*,s.branch_id,s.department_id,b.name branch,d.name department FROM roles r LEFT JOIN role_scopes s ON s.role_id=r.id AND s.tenant_id=r.tenant_id LEFT JOIN branches b ON b.id=s.branch_id AND b.tenant_id=r.tenant_id LEFT JOIN departments d ON d.id=s.department_id AND d.tenant_id=r.tenant_id WHERE r.tenant_id=?",
        tenantId,
      )
    : [];
  const permittedRoles = roles.filter((role) => {
    try {
      assertDelegation(
        t,
        role.name === "Company Owner"
          ? [...permissions]
          : JSON.parse(String(role.permissions)),
        {
          branchId: role.branch_id as string | null,
          departmentId: role.department_id as string | null,
        },
      );
      return true;
    } catch {
      return false;
    }
  });
  const members = available("role.manage")
    ? await all(
        c.db,
        "SELECT m.email,m.id,m.role_id,u.mobile,r.name role_name,rv.revoked_at,rv.restored_at FROM memberships m LEFT JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id LEFT JOIN membership_revocations rv ON rv.membership_id=m.id WHERE m.tenant_id=?",
        tenantId,
      )
    : [];
  const ep = organizationPredicate(t, "e"),
    op = organizationPredicate(t, "o");
  const brand = await publicBrand(c.db, String(t.slug));
  return {
    tenant: { ...t, ...brand },
    dashboardModes: await dashboardModes(c, tenantId, t),
    stats: await workspaceStats(c, tenantId, t),
    employees: employeeResult?.rows ?? [],
    employeePagination: employeeResult,
    jobs: jobsResult?.rows ?? [],
    jobPagination: jobsResult,
    candidates: candidateResult?.rows ?? [],
    candidatePagination: candidateResult,
    branches: await all(
      c.db,
      `SELECT * FROM branches WHERE tenant_id=?${t.access_branch_id ? " AND id=?" : ""}`,
      tenantId,
      ...(t.access_branch_id ? [t.access_branch_id] : []),
    ),
    departments: await all(
      c.db,
      `SELECT * FROM departments WHERE tenant_id=?${t.access_department_id ? " AND id=?" : ""}`,
      tenantId,
      ...(t.access_department_id ? [t.access_department_id] : []),
    ),
    roles: permittedRoles,
    memberships: members.filter((m) =>
      permittedRoles.some((r) => r.id === m.role_id),
    ),
    invitations: available("role.manage")
      ? (
          await all(
            c.db,
            "SELECT id,email,mobile,role_id,expires_at,used_at,revoked_at FROM invitations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",
            tenantId,
          )
        ).filter((i) => permittedRoles.some((r) => r.id === i.role_id))
      : [],
    audit: available("audit.view")
      ? await all(
          c.db,
          `SELECT a.id,a.action,a.resource_id,a.created_at,a.actor_id FROM audit_logs a WHERE a.tenant_id=?${t.access_branch_id || t.access_department_id ? ` AND (a.actor_id=? OR EXISTS(SELECT 1 FROM employees e WHERE e.id=a.resource_id AND e.tenant_id=a.tenant_id${ep.sql}) OR EXISTS(SELECT 1 FROM candidates cr LEFT JOIN job_organization o ON o.job_id=cr.job_id AND o.tenant_id=cr.tenant_id WHERE cr.id=a.resource_id AND cr.tenant_id=a.tenant_id${op.sql}))` : ""} ORDER BY a.created_at DESC LIMIT 60`,
          tenantId,
          ...(t.access_branch_id || t.access_department_id
            ? [c.identity.userId, ...ep.args, ...op.args]
            : []),
        )
      : [],
  };
}
export async function readPlatform(c: Context) {
  platform(c);
  return {
    tenants: await all(
      c.db,
      "SELECT t.id,t.name,t.slug,t.status,t.created_at,p.name plan_name,s.status subscription_status,s.expires_at,(SELECT count(*) FROM employees e WHERE e.tenant_id=t.id AND e.status='active') employee_count FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id ORDER BY t.created_at DESC",
    ),
    plans: await all(c.db, "SELECT * FROM plans"),
    audit: await all(
      c.db,
      "SELECT id,action,resource_id,created_at FROM audit_logs WHERE tenant_id IS NULL ORDER BY created_at DESC LIMIT 60",
    ),
  };
}
export async function mutate(
  c: Context,
  action: string,
  tenantId: string,
  payload: unknown,
): Promise<Row> {
  const data = payload as Row;
  if (action === "employee.invite") return inviteEmployee(c, tenantId, payload);
  if (action === "employee.unlink") return unlinkEmployee(c, tenantId, payload);
  if (action === "employee.manager") return assignManager(c, tenantId, payload);
  if (action === "profile.request")
    return requestProfileChange(c, tenantId, payload);
  if (action === "profile.review")
    return reviewProfileChange(c, tenantId, payload);
  if (
    ["employee.edit", "employee.archive", "employee.restore"].includes(action)
  )
    return changeEmployee(c, tenantId, action, data);
  if (action === "job.edit") return changeJob(c, tenantId, data);
  if (action === "member.revoke" || action === "member.restore")
    return revokeMember(c, tenantId, data, action === "member.restore");
  if (action === "roles.presets") {
    const actor = await scope(c, tenantId, "role.manage");
    assertCompanyWide(actor);
    const presets = [
      { name: "Company Admin", permissions: [...permissions] },
      {
        name: "HR Manager",
        permissions: [
          "employee.view",
          "employee.create",
          "employee.edit",
          "employee.archive",
          "employee.export",
          "employee.activate",
          "candidate.view",
          "candidate.create",
          "candidate.transition",
          "job.view",
          "job.create",
          "job.edit",
          "report.view",
        ],
      },
      {
        name: "Recruiter",
        permissions: [
          "candidate.view",
          "candidate.create",
          "candidate.transition",
          "job.view",
          "job.create",
          "job.edit",
          "report.view",
        ],
      },
      {
        name: "Auditor",
        permissions: [
          "employee.view",
          "candidate.view",
          "job.view",
          "audit.view",
          "report.view",
        ],
      },
    ];
    for (const preset of presets)
      assertDelegation(actor, preset.permissions, {});
    await c.db.batch([
      ...presets.map((p) =>
        stmt(
          c.db,
          "INSERT OR IGNORE INTO roles(id,tenant_id,name,permissions,created_at) VALUES(?,?,?,?,?)",
          id(),
          tenantId,
          p.name,
          json(p.permissions),
          now(),
        ),
      ),
      audit(c, tenantId, "roles.presets_installed", tenantId),
    ]);
    return {};
  }

  if (action === "tenant.create") {
    platform(c);
    const v = tenantInput.parse(data),
      tid = id(),
      rid = id(),
      pid = "trial-foundation",
      at = now(),
      expiry = new Date(Date.now() + 14 * 86400000).toISOString();
    const uid = id();
    const baseSlug = v.slug
      ? workspaceSlug.parse(v.slug)
      : slugFromName(v.name);
    for (let attempt = 0; attempt < 100; attempt++) {
      const slug = v.slug ? baseSlug : slugCandidate(baseSlug, attempt);
      if (
        await first(
          c.db,
          "SELECT id FROM tenants WHERE slug=? UNION ALL SELECT tenant_id id FROM tenant_slug_aliases WHERE slug=? LIMIT 1",
          slug,
          slug,
        )
      ) {
        if (v.slug)
          throw new AppError(
            409,
            "This workspace identifier is already reserved.",
          );
        continue;
      }
      const commands = [
        stmt(
          c.db,
          "INSERT OR IGNORE INTO plans(id,name,employee_limit,modules,price_paise,created_at) VALUES(?,?,?,?,?,?)",
          pid,
          "Foundation trial",
          50,
          json(["core", "recruitment"]),
          0,
          at,
        ),
        stmt(
          c.db,
          "INSERT INTO tenants(id,name,slug,stages,brand_color,created_at) VALUES(?,?,?,?,?,?)",
          tid,
          v.name,
          slug,
          json(defaultStages),
          platformBrand.primary,
          at,
        ),
        stmt(
          c.db,
          "INSERT INTO subscriptions(tenant_id,plan_id,status,expires_at,created_at) VALUES(?,?,?,?,?)",
          tid,
          pid,
          "trial",
          expiry,
          at,
        ),
        stmt(
          c.db,
          "INSERT INTO roles(id,tenant_id,name,permissions,created_at) VALUES(?,?,?,?,?)",
          rid,
          tid,
          "Company Owner",
          json(permissions),
          at,
        ),
        stmt(
          c.db,
          "INSERT INTO roles(id,tenant_id,name,permissions,created_at) VALUES(?,?,?,?,?)",
          id(),
          tid,
          "Employee",
          json(["report.view"]),
          at,
        ),
        stmt(
          c.db,
          "INSERT OR IGNORE INTO users(id,mobile,email,display_name,created_at) VALUES(?,?,?,?,?)",
          uid,
          v.adminMobile,
          v.adminEmail,
          v.name + " Admin",
          at,
        ),
        stmt(
          c.db,
          "INSERT INTO memberships(id,tenant_id,user_id,email,role_id,created_at) SELECT ?,?,id,?,?,? FROM users WHERE mobile=?",
          id(),
          tid,
          v.adminEmail,
          rid,
          at,
          v.adminMobile,
        ),
        audit(c, null, "tenant.created", tid),
        audit(c, tid, "company_administrator.assigned", tid, {
          mobileLast4: v.adminMobile.slice(-4),
        }),
      ];
      try {
        await c.db.batch(commands);
        return { id: tid, slug };
      } catch (error) {
        // D1 batches roll back atomically. Only retry a proven slug race.
        const taken = await first(
          c.db,
          "SELECT id FROM tenants WHERE slug=? UNION ALL SELECT tenant_id id FROM tenant_slug_aliases WHERE slug=? LIMIT 1",
          slug,
          slug,
        );
        if (!taken) throw error;
        if (v.slug)
          throw new AppError(
            409,
            "This workspace identifier is already reserved.",
          );
      }
    }
    throw new AppError(
      409,
      "Unable to allocate a workspace identifier. Choose one explicitly.",
    );
  }
  if (action === "tenant.slug") {
    platform(c);
    const tenant = await first(
      c.db,
      "SELECT id,slug FROM tenants WHERE id=?",
      String(data.id ?? ""),
    );
    if (!tenant) throw new AppError(404, "Company not found.");
    const slug = workspaceSlug.parse(data.slug);
    if (slug === tenant.slug) return { id: tenant.id, slug };
    await c.db.batch([
      stmt(
        c.db,
        "INSERT OR IGNORE INTO tenant_slug_aliases(slug,tenant_id,created_at) SELECT slug,id,? FROM tenants WHERE id=?",
        now(),
        tenant.id,
      ),
      stmt(
        c.db,
        "UPDATE tenants SET slug=? WHERE id=? RETURNING id",
        slug,
        tenant.id,
      ),
      audit(c, null, "tenant.slug_changed", String(tenant.id), { to: slug }),
    ]);
    // A competing rename must not produce an apparently successful stale update.
    const actual = await first(
      c.db,
      "SELECT slug FROM tenants WHERE id=?",
      tenant.id,
    );
    if (actual?.slug !== slug)
      throw new AppError(
        409,
        "The workspace identifier changed. Refresh and retry.",
      );
    return { id: tenant.id, slug };
  }
  if (action === "support.open") {
    platform(c);
    if (!c.sessionId)
      throw new AppError(401, "A verified session is required.");
    await requireFreshSession(c);
    const reason = String(data.reason ?? "").trim();
    if (reason.length < 5 || reason.length > 300)
      throw new AppError(
        422,
        "Enter a support-access reason (5–300 characters).",
      );
    const tenant = await first(
      c.db,
      "SELECT id,slug FROM tenants WHERE id=? AND status='active'",
      String(data.id),
    );
    if (!tenant) throw new AppError(404, "Active company not found.");
    const sid = id(),
      at = now(),
      expires = new Date(Date.now() + 60 * 60000).toISOString();
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE support_access SET revoked_at=? WHERE user_id=? AND session_id=? AND tenant_id=? AND revoked_at IS NULL",
        at,
        c.identity.userId,
        c.sessionId,
        tenant.id,
      ),
      stmt(
        c.db,
        "INSERT INTO support_access(id,tenant_id,user_id,session_id,reason,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        sid,
        tenant.id,
        c.identity.userId,
        c.sessionId,
        reason,
        expires,
        at,
      ),
      audit(c, String(tenant.id), "support.access_opened", sid, {
        reason,
        expiresAt: expires,
      }),
      audit(c, null, "support.access_opened", String(tenant.id), {
        reason,
        expiresAt: expires,
      }),
    ]);
    return { id: tenant.id, slug: tenant.slug, expiresAt: expires };
  }
  if (action === "support.close") {
    platform(c);
    if (!c.sessionId)
      throw new AppError(401, "A verified session is required.");
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE support_access SET revoked_at=? WHERE user_id=? AND session_id=? AND tenant_id=? AND revoked_at IS NULL",
        now(),
        c.identity.userId,
        c.sessionId,
        tenantId,
      ),
      audit(c, tenantId, "support.access_closed", tenantId),
    ]);
    return {};
  }
  if (action === "tenant.status") {
    platform(c);
    if (!["active", "suspended", "archived"].includes(String(data.status)))
      throw new AppError(422, "Invalid status.");
    const target = await first(
      c.db,
      "SELECT id FROM tenants WHERE id=?",
      String(data.id),
    );
    if (!target) throw new AppError(404, "Tenant not found.");
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE tenants SET status=? WHERE id=?",
        String(data.status),
        String(data.id),
      ),
      audit(c, null, "tenant.status_changed", String(data.id), {
        status: data.status,
      }),
    ]);
    return {};
  }
  if (action === "plan.create") {
    platform(c);
    const limit = Number(data.employeeLimit);
    const price = Number(data.pricePaise);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100000 ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      String(data.name).trim().length < 2 ||
      String(data.name).length > 100
    )
      throw new AppError(422, "Invalid plan.");
    const modules = Array.isArray(data.modules) ? data.modules : [];
    if (
      !modules.includes("core") ||
      modules.some(
        (m) =>
          ![
            "core",
            "recruitment",
            "employee_verification",
            "private_documents",
            "onboarding",
          ].includes(String(m)),
      )
    )
      throw new AppError(422, "Invalid modules.");
    const pid = id();
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO plans(id,name,employee_limit,modules,price_paise,created_at) VALUES(?,?,?,?,?,?)",
        pid,
        String(data.name).trim(),
        limit,
        json(modules),
        price,
        now(),
      ),
      audit(c, null, "plan.created", pid),
    ]);
    return { id: pid };
  }
  if (action === "subscription.assign") {
    platform(c);
    const plan = await first(
      c.db,
      "SELECT id FROM plans WHERE id=?",
      String(data.planId),
    );
    const expiry = new Date(String(data.expiresAt));
    if (!plan || !Number.isFinite(expiry.getTime()) || expiry <= new Date())
      throw new AppError(422, "Choose a plan and future expiry.");
    const target = await first(
      c.db,
      "SELECT tenant_id FROM subscriptions WHERE tenant_id=?",
      String(data.id),
    );
    if (!target) throw new AppError(404, "Tenant not found.");
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE subscriptions SET plan_id=?,status='active',expires_at=? WHERE tenant_id=?",
        String(data.planId),
        expiry.toISOString(),
        String(data.id),
      ),
      audit(c, null, "subscription.assigned", String(data.id), {
        planId: data.planId,
        expiresAt: expiry.toISOString(),
      }),
    ]);
    return {};
  }
  if (action === "invite.accept") {
    const token = String(data.token);
    if (token.length > 200) throw new AppError(422, "Invalid invitation.");
    const inv = await first(
      c.db,
      "SELECT i.*,t.status tenant_status FROM invitations i JOIN tenants t ON t.id=i.tenant_id WHERE i.token_hash=?",
      await tokenHash(token),
    );
    if (!inv || (c.boundTenantId && c.boundTenantId !== inv.tenant_id))
      throw new AppError(404, "Invitation not found.");
    if (
      !inv.mobile ||
      c.identity.mobile !== inv.mobile ||
      inv.used_at ||
      inv.revoked_at ||
      new Date(String(inv.expires_at)) <= new Date()
    )
      throw new AppError(
        403,
        "Invitation is unavailable for this verified mobile account.",
      );
    if (inv.tenant_status !== "active")
      throw new AppError(403, "Workspace is inactive.");
    if (
      await first(
        c.db,
        "SELECT id FROM onboarding_cases WHERE invitation_id=? AND tenant_id=?",
        inv.id,
        inv.tenant_id,
      )
    )
      return claimOnboarding(c, String(data.token));
    const activated = await acceptEmployeeActivation(c, inv);
    if (activated) return activated;
    const existing = await first(
      c.db,
      "SELECT id FROM memberships WHERE tenant_id=? AND user_id=?",
      inv.tenant_id,
      c.identity.userId,
    );
    if (existing)
      throw new AppError(409, "You already belong to this workspace.");
    const at = now();
    const results = await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO memberships(id,tenant_id,user_id,email,role_id,created_at) SELECT ?,tenant_id,?,?,role_id,? FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?",
        id(),
        c.identity.userId,
        String(inv.email),
        at,
        inv.id,
        at,
      ),
      stmt(
        c.db,
        "UPDATE invitations SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?",
        at,
        inv.id,
        at,
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'invitation.accepted',?, '{}',? WHERE changes()=1",
        id(),
        inv.tenant_id,
        c.identity.userId,
        inv.id,
        at,
      ),
    ]);
    if (!results[0].meta.changes)
      throw new AppError(
        409,
        "Invitation changed or expired. Request a new link.",
      );
    return { id: inv.tenant_id };
  }
  if (action === "employee.create") {
    const t = await scope(c, tenantId, "employee.create"),
      v = employeeInput.parse(data),
      eid = id(),
      at = now();
    assertOrganizationScope(t, v);
    for (const [table, ref] of [
      ["departments", v.departmentId],
      ["branches", v.branchId],
    ])
      if (
        ref &&
        !(await first(
          c.db,
          `SELECT id FROM ${table} WHERE tenant_id=? AND id=?`,
          tenantId,
          ref,
        ))
      )
        throw new AppError(422, "Invalid organizational assignment.");
    const count = await first(
      c.db,
      "SELECT count(*) count FROM employees WHERE tenant_id=? AND status='active'",
      tenantId,
    );
    if (Number(count?.count) >= Number(t.employee_limit))
      throw new AppError(409, "Your plan's employee limit has been reached.");
    const results = await c.db.batch([
      stmt(c.db, "UPDATE tenants SET sequence=sequence+1 WHERE id=?", tenantId),
      stmt(
        c.db,
        "INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,department_id,branch_id,joining_date,status,created_at) SELECT ?,id,employee_prefix||'-'||printf('%05d',sequence),?,?,?,?,?,?, 'active',? FROM tenants WHERE id=? AND (SELECT count(*) FROM employees WHERE tenant_id=? AND status='active') < ?",
        eid,
        v.fullName,
        v.email,
        v.designation,
        v.departmentId,
        v.branchId,
        v.joiningDate,
        at,
        tenantId,
        tenantId,
        t.employee_limit,
      ),
      stmt(
        c.db,
        "INSERT INTO employee_history(id,tenant_id,employee_id,actor_id,kind,reason,snapshot,effective_date,created_at) SELECT ?,tenant_id,id,?,'created','Existing employee record created',json_object('full_name',full_name,'email',email,'designation',designation,'branch_id',branch_id,'department_id',department_id,'joining_date',joining_date,'status',status,'version',version),joining_date,? FROM employees WHERE id=?",
        id(),
        c.identity.userId,
        at,
        eid,
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'employee.created',?, '{}',? WHERE EXISTS(SELECT 1 FROM employees WHERE id=?)",
        id(),
        tenantId,
        c.identity.userId,
        eid,
        at,
        eid,
      ),
    ]);
    if (!results[1].meta.changes)
      throw new AppError(409, "Employee limit reached.");
    return { id: eid };
  }
  if (action === "job.create") {
    const t = await scope(c, tenantId, "job.create", "recruitment");
    const v = jobInput.parse(data),
      jid = id();
    await validateOrganization(c, tenantId, v);
    assertOrganizationScope(t, v);
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO jobs(id,tenant_id,title,description,location,status,created_at) VALUES(?,?,?,?,?,?,?)",
        jid,
        tenantId,
        v.title,
        v.description,
        v.location,
        v.status,
        now(),
      ),
      stmt(
        c.db,
        "INSERT INTO job_organization(job_id,tenant_id,branch_id,department_id) VALUES(?,?,?,?)",
        jid,
        tenantId,
        v.branchId,
        v.departmentId,
      ),
      audit(c, tenantId, "job.created", jid),
    ]);
    return { id: jid };
  }
  if (action === "candidate.create") {
    const t = await scope(c, tenantId, "candidate.create", "recruitment"),
      v = candidateInput.parse(data),
      cid = id();
    if (
      !(await first(
        c.db,
        "SELECT id FROM jobs WHERE tenant_id=? AND id=? AND status='open'",
        tenantId,
        v.jobId,
      ))
    )
      throw new AppError(422, "Choose an open vacancy in this workspace.");
    const jobOrg = await first(
      c.db,
      "SELECT branch_id,department_id FROM job_organization WHERE job_id=? AND tenant_id=?",
      v.jobId,
      tenantId,
    );
    assertOrganizationScope(t, {
      branchId: jobOrg?.branch_id as string | null,
      departmentId: jobOrg?.department_id as string | null,
    });
    const stages = JSON.parse(String(t.stages)) as Stage[];
    const at = now();
    const results = await c.db.batch([
      stmt(
        c.db,
        `INSERT INTO candidates(id,tenant_id,job_id,full_name,email,phone,source,stage,version,created_at) SELECT ?,id,?,?,?,?,?,?,1,? FROM tenants WHERE id=? AND stages=? AND EXISTS(SELECT 1 FROM jobs jo LEFT JOIN job_organization o ON o.job_id=jo.id AND o.tenant_id=jo.tenant_id WHERE jo.tenant_id=? AND jo.id=? AND jo.status='open'${organizationPredicate(t, "o").sql})`,
        cid,
        v.jobId,
        v.fullName,
        v.email,
        v.phone,
        v.source,
        stages[0].id,
        at,
        tenantId,
        t.stages,
        tenantId,
        v.jobId,
        ...organizationPredicate(t, "o").args,
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'candidate.created',?, '{}',? WHERE changes()=1",
        id(),
        tenantId,
        c.identity.userId,
        cid,
        at,
      ),
    ]);
    if (!results[0].meta.changes)
      throw new AppError(
        409,
        "Vacancy or pipeline changed. Refresh and retry.",
      );
    return { id: cid };
  }
  if (action === "candidate.transition") {
    const t = await scope(c, tenantId, "candidate.transition", "recruitment");
    const row = await scopedCandidate(c, tenantId, t, String(data.id));
    const to = String(data.stage),
      reason = String(data.reason ?? "").trim();
    if (reason.length > 2000) throw new AppError(422, "Reason is too long.");
    const version = Number(data.version);
    if (version !== row.version)
      throw new AppError(409, "The candidate changed. Refresh and try again.");
    assertTransition(
      JSON.parse(String(t.stages)),
      String(row.stage),
      to,
      reason,
    );
    const hid = id(),
      at = now();
    const results = await c.db.batch([
      stmt(
        c.db,
        `UPDATE candidates SET stage=?,version=version+1 WHERE tenant_id=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM tenants WHERE id=? AND stages=?) AND EXISTS(SELECT 1 FROM jobs jo LEFT JOIN job_organization o ON o.job_id=jo.id AND o.tenant_id=jo.tenant_id WHERE jo.id=candidates.job_id AND jo.tenant_id=candidates.tenant_id${organizationPredicate(t, "o").sql})`,
        to,
        tenantId,
        row.id,
        version,
        tenantId,
        t.stages,
        ...organizationPredicate(t, "o").args,
      ),
      stmt(
        c.db,
        "INSERT INTO candidate_history(id,tenant_id,candidate_id,from_stage,to_stage,reason,actor_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1",
        hid,
        tenantId,
        row.id,
        row.stage,
        to,
        reason,
        c.identity.userId,
        at,
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'candidate.transitioned',?,?,? WHERE EXISTS(SELECT 1 FROM candidate_history WHERE id=?)",
        id(),
        tenantId,
        c.identity.userId,
        row.id,
        json({ from: row.stage, to }),
        at,
        hid,
      ),
    ]);
    if (!results[0].meta.changes)
      throw new AppError(409, "Candidate was updated concurrently.");
    return {};
  }
  if (action === "organization.create") {
    assertCompanyWide(await scope(c, tenantId, "company.settings.manage"));
    const kind = String(data.kind);
    if (
      !["departments", "branches"].includes(kind) ||
      String(data.name).trim().length < 2 ||
      String(data.name).length > 160
    )
      throw new AppError(422, "Invalid organization details.");
    const oid = id();
    await c.db.batch([
      stmt(
        c.db,
        `INSERT INTO ${kind}(id,tenant_id,name) VALUES(?,?,?)`,
        oid,
        tenantId,
        String(data.name).trim(),
      ),
      audit(c, tenantId, `${kind}.created`, oid),
    ]);
    return { id: oid };
  }
  if (action === "role.create") {
    const actor = await scope(c, tenantId, "role.manage");
    const v = roleInput.parse(data),
      rid = id();
    if (v.name.toLowerCase() === "company owner")
      throw new AppError(422, "The Company Owner role is reserved.");
    await validateOrganization(c, tenantId, v);
    assertDelegation(actor, v.permissions, v);
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO roles(id,tenant_id,name,permissions,created_at) VALUES(?,?,?,?,?)",
        rid,
        tenantId,
        v.name,
        json([...new Set(v.permissions)]),
        now(),
      ),
      stmt(
        c.db,
        "INSERT INTO role_scopes(role_id,tenant_id,branch_id,department_id) VALUES(?,?,?,?)",
        rid,
        tenantId,
        v.branchId,
        v.departmentId,
      ),
      audit(c, tenantId, "role.created", rid, {
        permissions: v.permissions,
        branchId: v.branchId,
        departmentId: v.departmentId,
      }),
    ]);
    return { id: rid };
  }
  if (action === "member.invite") {
    const actor = await scope(c, tenantId, "role.manage");
    const v = inviteInput.parse(data);
    await roleForDelegation(c, tenantId, actor, v.roleId);
    if (
      !(await first(
        c.db,
        "SELECT id FROM roles WHERE tenant_id=? AND id=?",
        tenantId,
        v.roleId,
      ))
    )
      throw new AppError(422, "Invalid role.");
    const token = crypto.randomUUID() + crypto.randomUUID(),
      iid = id();
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO invitations(id,tenant_id,email,mobile,role_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        iid,
        tenantId,
        v.email,
        v.mobile,
        v.roleId,
        await tokenHash(token),
        new Date(Date.now() + 48 * 3600000).toISOString(),
        now(),
      ),
      audit(c, tenantId, "invitation.created", iid),
    ]);
    return { inviteToken: token };
  }
  if (action === "invite.revoke") {
    const actor = await scope(c, tenantId, "role.manage");
    const inv = await first(
      c.db,
      "SELECT id,role_id FROM invitations WHERE tenant_id=? AND id=? AND used_at IS NULL",
      tenantId,
      String(data.id),
    );
    if (!inv) throw new AppError(404, "Invitation not found.");
    await roleForDelegation(c, tenantId, actor, String(inv.role_id));
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE invitations SET revoked_at=? WHERE tenant_id=? AND id=?",
        now(),
        tenantId,
        inv.id,
      ),
      audit(c, tenantId, "invitation.revoked", String(inv.id)),
    ]);
    return {};
  }
  if (action === "member.role") {
    const actor = await scope(c, tenantId, "role.manage");
    const member = await first(
      c.db,
      "SELECT * FROM memberships WHERE tenant_id=? AND id=?",
      tenantId,
      String(data.id),
    );
    const role = await first(
      c.db,
      "SELECT * FROM roles WHERE tenant_id=? AND id=?",
      tenantId,
      String(data.roleId),
    );
    if (!member || !role) throw new AppError(404, "Member or role not found.");
    await roleForDelegation(c, tenantId, actor, String(member.role_id));
    await roleForDelegation(c, tenantId, actor, String(role.id));
    if (member.user_id === c.identity.userId)
      throw new AppError(
        409,
        "Your own role cannot be changed by this operation.",
      );
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE memberships SET role_id=? WHERE tenant_id=? AND id=?",
        role.id,
        tenantId,
        member.id,
      ),
      audit(c, tenantId, "membership.role_changed", String(member.id), {
        roleId: role.id,
      }),
    ]);
    return {};
  }
  if (action === "dashboard.update") {
    assertCompanyWide(await scope(c, tenantId, "company.settings.manage"));
    const v = dashboardInput.parse(data);
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE tenants SET dashboard_config=? WHERE id=?",
        json(v),
        tenantId,
      ),
      audit(c, tenantId, "dashboard.customized", tenantId),
    ]);
    return {};
  }
  if (action === "branding.update") {
    const t = await scope(c, tenantId, "company.settings.manage");
    assertCompanyWide(t);
    const v = brandingInput.parse(data);
    if (primaryContrast(v.brandColor) < 4.5)
      throw new AppError(
        422,
        "Choose a darker primary colour for readable white button text.",
      );
    if (v.logoData) validateLogo(v.logoData);
    const existing = await first(
      c.db,
      "SELECT * FROM tenant_branding WHERE tenant_id=?",
      tenantId,
    );
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE tenants SET name=?,brand_color=?,employee_prefix=?,timezone=?,locale=?,currency=? WHERE id=?",
        v.name,
        v.brandColor,
        v.employeePrefix,
        v.timezone,
        v.locale ?? t.locale,
        v.currency ?? t.currency,
        tenantId,
      ),
      stmt(
        c.db,
        "INSERT INTO tenant_branding(tenant_id,accent_color,logo_data,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET accent_color=excluded.accent_color,logo_data=excluded.logo_data,updated_at=excluded.updated_at,version=tenant_branding.version+1",
        tenantId,
        v.accentColor ?? existing?.accent_color ?? platformBrand.accent,
        v.logoData === undefined ? (existing?.logo_data ?? null) : v.logoData,
        now(),
      ),
      audit(c, tenantId, "branding.updated", tenantId, {
        logoChanged: v.logoData !== undefined,
      }),
    ]);
    return {};
  }
  if (action === "pipeline.update") {
    assertCompanyWide(
      await scope(c, tenantId, "company.settings.manage", "recruitment"),
    );
    const stages = data.stages as Stage[];
    if (
      !Array.isArray(stages) ||
      stages.length < 2 ||
      stages.length > 12 ||
      stages.some(
        (s) =>
          !s ||
          typeof s.id !== "string" ||
          !/^[a-z][a-z0-9_]{1,30}$/.test(s.id) ||
          typeof s.label !== "string" ||
          s.label.length < 2 ||
          s.label.length > 40 ||
          !Array.isArray(s.next) ||
          s.next.some((n) => typeof n !== "string"),
      ) ||
      new Set(stages.map((s) => s.id)).size !== stages.length ||
      stages.some((s) =>
        s.next.some((n) => !stages.some((x) => x.id === n) || n === s.id),
      )
    )
      throw new AppError(422, "Invalid pipeline definition.");
    const used = await all(
      c.db,
      "SELECT DISTINCT stage FROM candidates WHERE tenant_id=?",
      tenantId,
    );
    if (used.some((s) => !stages.some((x) => x.id === s.stage)))
      throw new AppError(409, "Cannot remove a stage with candidates.");
    const results = await c.db.batch([
      stmt(
        c.db,
        `UPDATE tenants SET stages=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM candidates WHERE tenant_id=? AND stage NOT IN (${stages.map(() => "?").join(",")}))`,
        json(stages),
        tenantId,
        tenantId,
        ...stages.map((s) => s.id),
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'pipeline.updated',?, '{}',? WHERE changes()=1",
        id(),
        tenantId,
        c.identity.userId,
        tenantId,
        now(),
      ),
    ]);
    if (!results[0].meta.changes)
      throw new AppError(
        409,
        "Candidates changed. Keep occupied stages and retry.",
      );
    return {};
  }
  throw new AppError(404, "Unknown operation.");
}
