import { z } from "zod";
import { AppError, phone, tokenHash } from "./domain.ts";
import {
  scope,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  json,
  scopedEmployee,
  organizationPredicate,
} from "./access.ts";
import type { Context, Row } from "./access.ts";
import { workspaceStats, candidatePage, jobPage } from "./records.ts";
export async function ownEmployee(c: Context, tenantId: string) {
  await scope(c, tenantId, "");
  const e = await first(
    c.db,
    "SELECT e.id,e.tenant_id,e.employee_code,e.full_name,e.email,e.designation,e.joining_date,e.status,e.branch_id,e.department_id,e.version,d.name department,b.name branch,r.manager_id,m.full_name manager FROM employee_accounts a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id LEFT JOIN departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id LEFT JOIN branches b ON b.id=e.branch_id AND b.tenant_id=e.tenant_id LEFT JOIN employee_reporting r ON r.employee_id=e.id AND r.tenant_id=e.tenant_id LEFT JOIN employees m ON m.id=r.manager_id AND m.tenant_id=r.tenant_id WHERE a.tenant_id=? AND a.user_id=? AND a.revoked_at IS NULL AND e.status='active'",
    tenantId,
    c.identity.userId,
  );
  if (!e)
    throw new AppError(
      403,
      "Your account is not linked to an active employee in this company.",
    );
  return e;
}
export async function dashboardModes(c: Context, tenantId: string, t?: Row) {
  t ??= await scope(c, tenantId, "");
  const grants = JSON.parse(String(t.permissions)) as string[],
    modules = JSON.parse(String(t.modules)) as string[];
  const modes: string[] = [];
  if (
    grants.includes("company.settings.manage") ||
    grants.includes("role.manage")
  )
    modes.push("admin");
  if (grants.includes("employee.edit") || grants.includes("employee.create"))
    modes.push("hr");
  if (
    modules.includes("recruitment") &&
    (grants.includes("candidate.view") || grants.includes("job.view"))
  )
    modes.push("recruiter");
  const account = await first(
    c.db,
    "SELECT a.employee_id FROM employee_accounts a JOIN employees e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id WHERE a.tenant_id=? AND a.user_id=? AND a.revoked_at IS NULL AND e.status='active'",
    tenantId,
    c.identity.userId,
  );
  if (account) {
    if (grants.includes("team.view")) modes.push("manager");
    modes.push("employee");
  }
  if (!modes.length) modes.push("workspace");
  return modes;
}
const pageInput = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(""),
});
export async function teamPage(
  c: Context,
  tenantId: string,
  input: unknown = {},
) {
  const t = await scope(c, tenantId, "team.view"),
    own = await ownEmployee(c, tenantId),
    p = organizationPredicate(t, "e"),
    q = pageInput.parse(input);
  let where = "e.tenant_id=? AND r.manager_id=? AND e.status='active'" + p.sql;
  const args: unknown[] = [tenantId, own.id, ...p.args];
  if (q.q) {
    where +=
      " AND (e.full_name LIKE ? ESCAPE '\\' OR e.employee_code LIKE ? ESCAPE '\\')";
    const pattern = "%" + q.q.replace(/[\\%_]/g, "\\$&") + "%";
    args.push(pattern, pattern);
  }
  const results = await c.db.batch([
    stmt(
      c.db,
      `SELECT count(*) total FROM employees e JOIN employee_reporting r ON r.employee_id=e.id AND r.tenant_id=e.tenant_id WHERE ${where}`,
      ...args,
    ),
    stmt(
      c.db,
      `SELECT e.id,e.employee_code,e.full_name,e.designation,e.joining_date,d.name department,b.name branch FROM employees e JOIN employee_reporting r ON r.employee_id=e.id AND r.tenant_id=e.tenant_id LEFT JOIN departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id LEFT JOIN branches b ON b.id=e.branch_id AND b.tenant_id=e.tenant_id WHERE ${where} ORDER BY e.full_name COLLATE NOCASE,e.id LIMIT ? OFFSET ?`,
      ...args,
      q.pageSize,
      (q.page - 1) * q.pageSize,
    ),
  ]);
  const total = Number((results[0].results[0] as Row).total);
  return {
    rows: results[1].results,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
export async function profileQueue(c: Context, tenantId: string) {
  const t = await scope(c, tenantId, "employee.edit"),
    p = organizationPredicate(t, "e");
  return all(
    c.db,
    `SELECT r.id,r.employee_id,r.full_name,r.email,r.reason,r.version,r.employee_version,r.created_at,e.full_name current_name,e.email current_email,e.version current_employee_version,e.employee_code FROM profile_requests r JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.status='pending'${p.sql} ORDER BY r.created_at LIMIT 100`,
    tenantId,
    ...p.args,
  );
}
export async function readDashboard(
  c: Context,
  tenantId: string,
  mode: string,
  input: unknown = {},
) {
  const t = await scope(c, tenantId, "");
  if (!(await dashboardModes(c, tenantId, t)).includes(mode))
    throw new AppError(
      403,
      "This dashboard is not available for your account.",
    );
  if (mode === "employee") {
    const employee = await ownEmployee(c, tenantId);
    const requests = await all(
      c.db,
      "SELECT id,full_name,email,reason,status,version,review_reason,created_at,reviewed_at FROM profile_requests WHERE tenant_id=? AND employee_id=? ORDER BY created_at DESC LIMIT 50",
      tenantId,
      employee.id,
    );
    return { employee, requests };
  }
  if (mode === "manager")
    return {
      employee: await ownEmployee(c, tenantId),
      team: await teamPage(c, tenantId, input),
    };
  if (mode === "hr") {
    const grants = JSON.parse(String(t.permissions));
    return {
      stats: await workspaceStats(c, tenantId, t),
      queue: grants.includes("employee.edit")
        ? await profileQueue(c, tenantId)
        : [],
    };
  }
  if (mode === "recruiter") {
    const grants = JSON.parse(String(t.permissions));
    return {
      stats: await workspaceStats(c, tenantId, t),
      candidates: grants.includes("candidate.view")
        ? await candidatePage(c, tenantId, { pageSize: 10 })
        : null,
      jobs: grants.includes("job.view")
        ? await jobPage(c, tenantId, { pageSize: 10, status: "open" })
        : null,
    };
  }
  return { stats: await workspaceStats(c, tenantId, t) };
}
export async function inviteEmployee(
  c: Context,
  tenantId: string,
  payload: unknown,
) {
  const t = await scope(c, tenantId, "employee.activate"),
    v = z
      .object({ id: z.string().uuid(), mobile: phone })
      .strict()
      .parse(payload),
    employee = await scopedEmployee(c, tenantId, t, v.id);
  if (employee.status !== "active")
    throw new AppError(409, "Only active employee records can be activated.");
  if (
    await first(
      c.db,
      "SELECT employee_id FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND revoked_at IS NULL",
      tenantId,
      v.id,
    )
  )
    throw new AppError(
      409,
      "This employee already has an active linked account.",
    );
  const role = await first(
    c.db,
    "SELECT id,permissions FROM roles WHERE tenant_id=? AND name='Employee'",
    tenantId,
  );
  if (
    !role ||
    JSON.parse(String(role.permissions)).some(
      (p: string) => p !== "report.view",
    )
  )
    throw new AppError(
      409,
      "The default Employee role must have only the safe report.view permission before activation.",
    );
  const token = id() + id(),
    iid = id(),
    at = now();
  await c.db.batch([
    stmt(
      c.db,
      "INSERT INTO invitations(id,tenant_id,email,mobile,role_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      iid,
      tenantId,
      employee.email,
      v.mobile,
      role.id,
      await tokenHash(token),
      new Date(Date.now() + 48 * 3600000).toISOString(),
      at,
    ),
    stmt(
      c.db,
      "INSERT INTO employee_activations(invitation_id,tenant_id,employee_id,created_at) VALUES(?,?,?,?)",
      iid,
      tenantId,
      employee.id,
      at,
    ),
    audit(c, tenantId, "employee.activation_invited", String(employee.id), {
      mobileLast4: v.mobile.slice(-4),
    }),
  ]);
  return { inviteToken: token };
}
export async function acceptEmployeeActivation(c: Context, inv: Row) {
  const activation = await first(
    c.db,
    "SELECT * FROM employee_activations WHERE invitation_id=? AND tenant_id=?",
    inv.id,
    inv.tenant_id,
  );
  if (!activation) return null;
  const at = now(),
    claim = id(),
    tenantId = String(inv.tenant_id);
  await scopeForActivation(c, tenantId);
  const result = await c.db.batch([
    stmt(
      c.db,
      "UPDATE employee_activations SET claim_id=? WHERE invitation_id=? AND tenant_id=? AND EXISTS(SELECT 1 FROM invitations i WHERE i.id=employee_activations.invitation_id AND i.tenant_id=employee_activations.tenant_id AND i.mobile=? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?) AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_activations.employee_id AND e.tenant_id=employee_activations.tenant_id AND e.status='active') AND NOT EXISTS(SELECT 1 FROM employee_accounts a WHERE a.employee_id=employee_activations.employee_id AND a.tenant_id=employee_activations.tenant_id AND a.revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM memberships m JOIN membership_revocations r ON r.membership_id=m.id WHERE m.tenant_id=employee_activations.tenant_id AND m.user_id=? AND r.restored_at IS NULL) AND EXISTS(SELECT 1 FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE t.id=employee_activations.tenant_id AND t.status='active' AND s.status IN('active','trial') AND s.expires_at>? AND EXISTS(SELECT 1 FROM json_each(p.modules) WHERE value='core'))",
      claim,
      inv.id,
      tenantId,
      c.identity.mobile,
      at,
      c.identity.userId,
      at,
    ),
    stmt(
      c.db,
      "INSERT OR IGNORE INTO memberships(id,tenant_id,user_id,email,role_id,created_at) SELECT ?,i.tenant_id,?,i.email,i.role_id,? FROM invitations i JOIN employee_activations a ON a.invitation_id=i.id AND a.tenant_id=i.tenant_id WHERE a.claim_id=?",
      id(),
      c.identity.userId,
      at,
      claim,
    ),
    stmt(
      c.db,
      "INSERT INTO employee_accounts(employee_id,tenant_id,user_id,actor_id,created_at) SELECT employee_id,tenant_id,?,?,? FROM employee_activations WHERE claim_id=? ON CONFLICT(employee_id) DO UPDATE SET user_id=excluded.user_id,actor_id=excluded.actor_id,created_at=excluded.created_at,revoked_at=NULL,version=employee_accounts.version+1 WHERE employee_accounts.revoked_at IS NOT NULL",
      c.identity.userId,
      c.identity.userId,
      at,
      claim,
    ),
    stmt(
      c.db,
      "UPDATE invitations SET used_at=? WHERE id=? AND EXISTS(SELECT 1 FROM employee_activations a JOIN employee_accounts e ON e.employee_id=a.employee_id AND e.tenant_id=a.tenant_id WHERE a.invitation_id=invitations.id AND a.claim_id=? AND e.user_id=? AND e.revoked_at IS NULL)",
      at,
      inv.id,
      claim,
      c.identity.userId,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,'employee.account_activated',?,'{}',? WHERE changes()=1",
      id(),
      tenantId,
      c.identity.userId,
      activation.employee_id,
      at,
    ),
  ]);
  if (!result[0].meta.changes || !result[2].meta.changes)
    throw new AppError(
      409,
      "Employee activation changed or is unavailable. Contact HR.",
    );
  return { id: tenantId };
}
async function scopeForActivation(c: Context, tenantId: string) {
  const row = await first(
    c.db,
    "SELECT t.status,s.status subscription_status,s.expires_at,p.modules FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE t.id=?",
    tenantId,
  );
  if (!row || row.status !== "active")
    throw new AppError(403, "Workspace is inactive.");
  const { assertEntitlement } = await import("./domain.ts");
  assertEntitlement(
    String(row.subscription_status),
    String(row.expires_at),
    JSON.parse(String(row.modules)),
    "core",
  );
}
export async function unlinkEmployee(
  c: Context,
  tenantId: string,
  payload: unknown,
) {
  const t = await scope(c, tenantId, "employee.activate"),
    v = z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(payload);
  await scopedEmployee(c, tenantId, t, v.id);
  const link = await first(
    c.db,
    "SELECT version FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND revoked_at IS NULL",
    tenantId,
    v.id,
  );
  if (!link) throw new AppError(409, "No active employee account to unlink.");
  const at = now();
  const result = await c.db.batch([
    stmt(
      c.db,
      "UPDATE employee_accounts SET revoked_at=?,version=version+1 WHERE tenant_id=? AND employee_id=? AND revoked_at IS NULL AND version=?",
      at,
      tenantId,
      v.id,
      link.version,
    ),
    stmt(
      c.db,
      "UPDATE invitations SET revoked_at=? WHERE tenant_id=? AND used_at IS NULL AND id IN(SELECT invitation_id FROM employee_activations WHERE tenant_id=? AND employee_id=?) AND EXISTS(SELECT 1 FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND revoked_at=? AND version=?)",
      at,
      tenantId,
      tenantId,
      v.id,
      tenantId,
      v.id,
      at,
      Number(link.version) + 1,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,'employee.account_unlinked',?,?,? WHERE EXISTS(SELECT 1 FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND revoked_at=? AND version=?)",
      id(),
      tenantId,
      c.identity.userId,
      v.id,
      json({ reason: v.reason }),
      at,
      tenantId,
      v.id,
      at,
      Number(link.version) + 1,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "No active employee account to unlink.");
  return {};
}
export async function assignManager(
  c: Context,
  tenantId: string,
  payload: unknown,
) {
  const t = await scope(c, tenantId, "employee.edit"),
    v = z
      .object({
        id: z.string().uuid(),
        managerId: z.string().uuid().nullable(),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(payload);
  await scopedEmployee(c, tenantId, t, v.id);
  if (v.managerId) {
    const manager = await scopedEmployee(c, tenantId, t, v.managerId);
    if (manager.status !== "active")
      throw new AppError(409, "Choose an active reporting manager.");
  }
  if (v.id === v.managerId)
    throw new AppError(422, "An employee cannot report to themselves.");
  const at = now(),
    result = await c.db.batch([
      stmt(
        c.db,
        "WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT r.manager_id FROM employee_reporting r JOIN chain x ON r.employee_id=x.id WHERE r.tenant_id=? AND r.manager_id IS NOT NULL) INSERT INTO employee_reporting(employee_id,tenant_id,manager_id,updated_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM chain WHERE id=?) ON CONFLICT(employee_id) DO UPDATE SET manager_id=excluded.manager_id,updated_at=excluded.updated_at,version=employee_reporting.version+1",
        v.managerId,
        tenantId,
        v.id,
        tenantId,
        v.managerId,
        at,
        v.id,
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,'employee.manager_changed',?,?,? WHERE changes()=1",
        id(),
        tenantId,
        c.identity.userId,
        v.id,
        json({ managerId: v.managerId, reason: v.reason }),
        at,
      ),
    ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Reporting relationships cannot contain a cycle.");
  return {};
}
const requestInput = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export async function requestProfileChange(
  c: Context,
  tenantId: string,
  payload: unknown,
) {
  const own = await ownEmployee(c, tenantId),
    v = requestInput.parse(payload),
    rid = id(),
    at = now();
  if (v.fullName === own.full_name && v.email === own.email)
    throw new AppError(422, "Change a profile field before submitting.");
  const result = await c.db.batch([
    stmt(
      c.db,
      "INSERT INTO profile_requests(id,tenant_id,employee_id,actor_id,full_name,email,reason,employee_version,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM employee_accounts a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id JOIN memberships m ON m.user_id=a.user_id AND m.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.employee_id=? AND a.user_id=? AND a.revoked_at IS NULL AND e.status='active' AND e.version=? AND NOT EXISTS(SELECT 1 FROM membership_revocations rv WHERE rv.membership_id=m.id AND rv.restored_at IS NULL))",
      rid,
      tenantId,
      own.id,
      c.identity.userId,
      v.fullName,
      v.email,
      v.reason,
      own.version,
      at,
      tenantId,
      own.id,
      c.identity.userId,
      own.version,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,'profile.change_requested',?,?,? WHERE changes()=1",
      id(),
      tenantId,
      c.identity.userId,
      own.id,
      json({ requestId: rid }),
      at,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Employee account changed. Refresh and try again.");
  return { id: rid };
}
export async function reviewProfileChange(
  c: Context,
  tenantId: string,
  payload: unknown,
) {
  const t = await scope(c, tenantId, "employee.edit"),
    v = z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(payload);
  const request = await first(
    c.db,
    "SELECT * FROM profile_requests WHERE tenant_id=? AND id=?",
    tenantId,
    v.id,
  );
  if (!request) throw new AppError(404, "Request not found.");
  const employee = await scopedEmployee(
    c,
    tenantId,
    t,
    String(request.employee_id),
  );
  if (request.actor_id === c.identity.userId)
    throw new AppError(
      403,
      "A different authorized reviewer must decide your request.",
    );
  if (request.status !== "pending" || request.version !== v.version)
    throw new AppError(409, "Request already changed. Refresh and retry.");
  if (
    v.decision === "approved" &&
    (employee.status !== "active" ||
      employee.version !== request.employee_version)
  )
    throw new AppError(
      409,
      "The employee changed after submission. Reject this request and ask for a new one.",
    );
  const decision = id(),
    at = now();
  const commands = [
    stmt(
      c.db,
      `UPDATE profile_requests SET status=?,version=version+1,reviewer_id=?,review_reason=?,reviewed_at=?,decision_id=? WHERE tenant_id=? AND id=? AND version=? AND status='pending'${v.decision === "approved" ? " AND EXISTS(SELECT 1 FROM employees e WHERE e.id=profile_requests.employee_id AND e.tenant_id=profile_requests.tenant_id AND e.version=profile_requests.employee_version AND e.status='active') AND EXISTS(SELECT 1 FROM employee_accounts a JOIN memberships m ON m.user_id=a.user_id AND m.tenant_id=a.tenant_id WHERE a.employee_id=profile_requests.employee_id AND a.tenant_id=profile_requests.tenant_id AND a.user_id=profile_requests.actor_id AND a.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM membership_revocations rv WHERE rv.membership_id=m.id AND rv.restored_at IS NULL))" : ""}`,
      v.decision,
      c.identity.userId,
      v.reason,
      at,
      decision,
      tenantId,
      v.id,
      v.version,
    ),
  ];
  if (v.decision === "approved")
    commands.push(
      stmt(
        c.db,
        "UPDATE employees SET full_name=?,email=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM profile_requests r WHERE r.id=? AND r.decision_id=? AND r.status='approved')",
        request.full_name,
        request.email,
        at,
        tenantId,
        employee.id,
        request.employee_version,
        v.id,
        decision,
      ),
      stmt(
        c.db,
        "INSERT INTO employee_history(id,tenant_id,employee_id,actor_id,kind,reason,snapshot,effective_date,created_at) SELECT ?,tenant_id,id,?,'profile_approved',?,json_object('full_name',full_name,'email',email,'version',version),?,? FROM employees WHERE tenant_id=? AND id=? AND EXISTS(SELECT 1 FROM profile_requests r WHERE r.id=? AND r.decision_id=?)",
        id(),
        c.identity.userId,
        v.reason,
        at.slice(0, 10),
        at,
        tenantId,
        employee.id,
        v.id,
        decision,
      ),
    );
  commands.push(
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,'profile.'||?,?,?,? WHERE EXISTS(SELECT 1 FROM profile_requests WHERE id=? AND decision_id=?)",
      id(),
      tenantId,
      c.identity.userId,
      v.decision,
      employee.id,
      json({ requestId: v.id, reason: v.reason }),
      at,
      v.id,
      decision,
    ),
  );
  const result = await c.db.batch(commands);
  if (!result[0].meta.changes)
    throw new AppError(
      409,
      "Request or employee changed concurrently. Refresh and retry.",
    );
  return {};
}
