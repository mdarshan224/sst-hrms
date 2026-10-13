import {
  AppError,
  permissions,
  assertPermission,
  assertEntitlement,
} from "./domain.ts";
export type Identity = {
  userId: string;
  mobile: string;
  email: string;
  displayName: string;
};
export type Row = Record<string, unknown>;
export type Context = {
  db: D1Database;
  identity: Identity;
  adminMobile: string;
  sessionId?: string;
  boundTenantId?: string;
  deploymentVersion?: string;
};
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const json = (v: unknown) => JSON.stringify(v);
export const all = async (db: D1Database, sql: string, ...args: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all<Row>()
  ).results;
export const first = async (db: D1Database, sql: string, ...args: unknown[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .first<Row>();
export const stmt = (db: D1Database, sql: string, ...args: unknown[]) =>
  db.prepare(sql).bind(...args);
export const audit = (
  c: Context,
  tenantId: string | null,
  action: string,
  resource: string,
  details: unknown = {},
) =>
  stmt(
    c.db,
    "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) VALUES(?,?,?,?,?,?,?)",
    id(),
    tenantId,
    c.identity.userId,
    action,
    resource,
    json(details),
    now(),
  );
export function isPlatform(c: Context) {
  return (
    !c.boundTenantId &&
    Boolean(c.adminMobile) &&
    c.identity.mobile === c.adminMobile
  );
}
export function platform(c: Context) {
  if (!isPlatform(c)) throw new AppError(403, "Platform access is required.");
}
export async function scope(
  c: Context,
  tenantId: string,
  permission: string,
  module = "core",
) {
  if (c.boundTenantId && c.boundTenantId !== tenantId)
    throw new AppError(404, "Record not found in this workspace.");
  let t = await first(
    c.db,
    "SELECT t.*,r.permissions,r.name role_name,rs.branch_id access_branch_id,rs.department_id access_department_id,s.status subscription_status,s.expires_at,p.modules,p.employee_limit FROM tenants t JOIN memberships m ON m.tenant_id=t.id JOIN roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id LEFT JOIN role_scopes rs ON rs.role_id=r.id AND rs.tenant_id=t.id LEFT JOIN membership_revocations rv ON rv.membership_id=m.id AND rv.restored_at IS NULL JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE t.id=? AND m.user_id=? AND rv.membership_id IS NULL",
    tenantId,
    c.identity.userId,
  );
  if (!t && isPlatform(c) && c.sessionId)
    t = await first(
      c.db,
      "SELECT t.*,? permissions,'Platform support' role_name,g.expires_at support_expires_at,s.status subscription_status,s.expires_at,p.modules,p.employee_limit FROM support_access g JOIN tenants t ON t.id=g.tenant_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE g.tenant_id=? AND g.user_id=? AND g.session_id=? AND g.revoked_at IS NULL AND g.expires_at>?",
      json(permissions),
      tenantId,
      c.identity.userId,
      c.sessionId,
      now(),
    );
  if (!t) throw new AppError(404, "Workspace not found.");
  if (t.status !== "active")
    throw new AppError(403, "This workspace is suspended or archived.");
  // The existing immutable Company Owner preset represents company ownership.
  // Resolve it from the database, never from browser-supplied role names.
  if (t.role_name === "Company Owner") t.permissions = json(permissions);
  if (permission)
    assertPermission(JSON.parse(String(t.permissions)), permission);
  assertEntitlement(
    String(t.subscription_status),
    String(t.expires_at),
    JSON.parse(String(t.modules)),
    module,
  );
  return t;
}

export type Constraint = {
  branchId?: string | null;
  departmentId?: string | null;
};
export function organizationPredicate(t: Row, alias: string) {
  const sql: string[] = [],
    args: unknown[] = [];
  if (t.access_branch_id) {
    sql.push(`${alias}.branch_id=?`);
    args.push(t.access_branch_id);
  }
  if (t.access_department_id) {
    sql.push(`${alias}.department_id=?`);
    args.push(t.access_department_id);
  }
  return { sql: sql.length ? " AND " + sql.join(" AND ") : "", args };
}
export function assertOrganizationScope(t: Row, value: Constraint) {
  if (
    (t.access_branch_id && t.access_branch_id !== value.branchId) ||
    (t.access_department_id && t.access_department_id !== value.departmentId)
  )
    throw new AppError(
      403,
      "This record is outside your assigned branch or department.",
    );
}
export function assertCompanyWide(t: Row) {
  if (t.access_branch_id || t.access_department_id)
    throw new AppError(403, "Company-wide administration access is required.");
}
export async function validateOrganization(
  c: Context,
  tenantId: string,
  value: Constraint,
) {
  for (const [table, key] of [
    ["branches", value.branchId],
    ["departments", value.departmentId],
  ])
    if (
      key &&
      !(await first(
        c.db,
        `SELECT id FROM ${table} WHERE tenant_id=? AND id=?`,
        tenantId,
        key,
      ))
    )
      throw new AppError(422, "Invalid organizational assignment.");
}
export function assertDelegation(
  actor: Row,
  targetPermissions: string[],
  value: Constraint,
) {
  const grants = JSON.parse(String(actor.permissions)) as string[];
  if (targetPermissions.some((p) => !grants.includes(p)))
    throw new AppError(
      403,
      "You cannot delegate permissions beyond your own authority.",
    );
  assertOrganizationScope(actor, value);
}
export async function roleForDelegation(
  c: Context,
  tenantId: string,
  actor: Row,
  roleId: string,
) {
  const role = await first(
    c.db,
    "SELECT r.*,s.branch_id,s.department_id FROM roles r LEFT JOIN role_scopes s ON s.role_id=r.id AND s.tenant_id=r.tenant_id WHERE r.id=? AND r.tenant_id=?",
    roleId,
    tenantId,
  );
  if (!role) throw new AppError(422, "Invalid role.");
  const grants =
    role.name === "Company Owner"
      ? [...permissions]
      : JSON.parse(String(role.permissions));
  assertDelegation(actor, grants, {
    branchId: role.branch_id as string | null,
    departmentId: role.department_id as string | null,
  });
  return role;
}
export async function scopedEmployee(
  c: Context,
  tenantId: string,
  t: Row,
  employeeId: string,
) {
  const p = organizationPredicate(t, "e");
  const employee = await first(
    c.db,
    `SELECT e.*,d.name department,b.name branch FROM employees e LEFT JOIN departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id LEFT JOIN branches b ON b.id=e.branch_id AND b.tenant_id=e.tenant_id WHERE e.tenant_id=? AND e.id=?${p.sql}`,
    tenantId,
    employeeId,
    ...p.args,
  );
  if (!employee) throw new AppError(404, "Employee not found.");
  return employee;
}
export async function scopedCandidate(
  c: Context,
  tenantId: string,
  t: Row,
  candidateId: string,
) {
  const p = organizationPredicate(t, "o");
  const candidate = await first(
    c.db,
    `SELECT c.* FROM candidates c LEFT JOIN job_organization o ON o.job_id=c.job_id AND o.tenant_id=c.tenant_id WHERE c.tenant_id=? AND c.id=?${p.sql}`,
    tenantId,
    candidateId,
    ...p.args,
  );
  if (!candidate) throw new AppError(404, "Candidate not found.");
  return candidate;
}
export async function requireFreshSession(
  c: Context,
  purpose = "opening company admin access",
) {
  if (!c.sessionId) throw new AppError(401, "A verified session is required.");
  const session = await first(
    c.db,
    "SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>? AND created_at>=?",
    c.sessionId,
    c.identity.userId,
    now(),
    new Date(Date.now() - 10 * 60000).toISOString(),
  );
  if (!session)
    throw new AppError(
      428,
      `Verify your mobile number again before ${purpose}.`,
    );
}
