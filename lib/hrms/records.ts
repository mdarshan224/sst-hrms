import { z } from "zod";
import { AppError, listInput, employeeEditInput, jobInput } from "./domain.ts";
import {
  scope,
  all,
  first,
  stmt,
  audit,
  now,
  id,
  json,
  organizationPredicate,
  scopedEmployee,
  scopedCandidate,
  validateOrganization,
  assertOrganizationScope,
  assertCompanyWide,
  roleForDelegation,
} from "./access.ts";
import type { Context, Row } from "./access.ts";
const like = (value: string) => "%" + value.replace(/[\\%_]/g, "\\$&") + "%";
async function pageQuery(
  c: Context,
  table: string,
  select: string,
  where: string,
  args: unknown[],
  order: string,
  page: number,
  pageSize: number,
) {
  const results = await c.db.batch([
    stmt(c.db, `SELECT count(*) total FROM ${table} WHERE ${where}`, ...args),
    stmt(
      c.db,
      `SELECT ${select} FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...args,
      pageSize,
      (page - 1) * pageSize,
    ),
  ]);
  const total = Number((results[0].results[0] as Row)?.total ?? 0);
  return {
    rows: results[1].results,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
export async function employeePage(
  c: Context,
  tenantId: string,
  input: unknown = {},
  permission = "employee.view",
) {
  const t = await scope(c, tenantId, permission),
    q = listInput.parse(input),
    p = organizationPredicate(t, "e");
  let where = "e.tenant_id=?" + p.sql;
  const args: unknown[] = [tenantId, ...p.args];
  if (q.status !== "all") {
    where += " AND e.status=?";
    args.push(q.status);
  }
  if (q.branchId) {
    where += " AND e.branch_id=?";
    args.push(q.branchId);
  }
  if (q.departmentId) {
    where += " AND e.department_id=?";
    args.push(q.departmentId);
  }
  if (q.q) {
    where +=
      " AND (e.full_name LIKE ? ESCAPE '\\' OR e.email LIKE ? ESCAPE '\\' OR e.employee_code LIKE ? ESCAPE '\\' OR e.designation LIKE ? ESCAPE '\\')";
    args.push(...Array(4).fill(like(q.q)));
  }
  const order = {
    name: "e.full_name COLLATE NOCASE,e.id",
    code: "e.employee_code,e.id",
    joining: "e.joining_date DESC,e.id",
    newest: "e.created_at DESC,e.id",
  }[q.sort];
  return pageQuery(
    c,
    "employees e LEFT JOIN departments d ON d.id=e.department_id AND d.tenant_id=e.tenant_id LEFT JOIN branches b ON b.id=e.branch_id AND b.tenant_id=e.tenant_id",
    "e.*,d.name department,b.name branch,(SELECT r.manager_id FROM employee_reporting r WHERE r.employee_id=e.id AND r.tenant_id=e.tenant_id) manager_id,(SELECT CASE WHEN a.revoked_at IS NULL THEN 'active' ELSE 'revoked' END FROM employee_accounts a WHERE a.employee_id=e.id AND a.tenant_id=e.tenant_id) account_status",
    where,
    args,
    order,
    q.page,
    q.pageSize,
  );
}
const candidateList = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).default(""),
  stage: z.string().max(32).optional(),
  jobId: z.string().uuid().optional(),
});
export async function candidatePage(
  c: Context,
  tenantId: string,
  input: unknown = {},
) {
  const t = await scope(c, tenantId, "candidate.view", "recruitment"),
    q = candidateList.parse(input),
    p = organizationPredicate(t, "o");
  let where = "c.tenant_id=?" + p.sql;
  const args: unknown[] = [tenantId, ...p.args];
  if (q.stage) {
    where += " AND c.stage=?";
    args.push(q.stage);
  }
  if (q.jobId) {
    where += " AND c.job_id=?";
    args.push(q.jobId);
  }
  if (q.q) {
    where +=
      " AND (c.full_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR j.title LIKE ? ESCAPE '\\')";
    args.push(...Array(3).fill(like(q.q)));
  }
  return pageQuery(
    c,
    "candidates c JOIN jobs j ON j.id=c.job_id AND j.tenant_id=c.tenant_id LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id",
    "c.*,j.title job_title,o.branch_id,o.department_id",
    where,
    args,
    "c.created_at DESC,c.id",
    q.page,
    q.pageSize,
  );
}
const jobList = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "draft", "open", "closed"]).default("all"),
});
export async function jobPage(
  c: Context,
  tenantId: string,
  input: unknown = {},
) {
  const t = await scope(c, tenantId, "job.view", "recruitment"),
    q = jobList.parse(input),
    p = organizationPredicate(t, "o");
  let where = "j.tenant_id=?" + p.sql;
  const args: unknown[] = [tenantId, ...p.args];
  if (q.status !== "all") {
    where += " AND j.status=?";
    args.push(q.status);
  }
  if (q.q) {
    where +=
      " AND (j.title LIKE ? ESCAPE '\\' OR j.location LIKE ? ESCAPE '\\')";
    args.push(like(q.q), like(q.q));
  }
  return pageQuery(
    c,
    "jobs j LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id",
    `j.*,o.branch_id,o.department_id,${JSON.parse(String(t.permissions)).includes("candidate.view") ? "(SELECT count(*) FROM candidates c WHERE c.tenant_id=j.tenant_id AND c.job_id=j.id)" : "NULL"} applicant_count`,
    where,
    args,
    "j.created_at DESC,j.id",
    q.page,
    q.pageSize,
  );
}
export async function workspaceStats(c: Context, tenantId: string, t: Row) {
  const grants = JSON.parse(String(t.permissions)) as string[],
    modules = JSON.parse(String(t.modules)) as string[],
    e = organizationPredicate(t, "e"),
    o = organizationPredicate(t, "o");
  const can = (p: string) => grants.includes(p);
  const statements: D1PreparedStatement[] = [];
  const keys: string[] = [];
  if (can("employee.view")) {
    keys.push("employees", "distribution");
    statements.push(
      stmt(
        c.db,
        `SELECT count(*) total,sum(CASE WHEN e.status='active' THEN 1 ELSE 0 END) active FROM employees e WHERE e.tenant_id=?${e.sql}`,
        tenantId,
        ...e.args,
      ),
      stmt(
        c.db,
        `SELECT e.department_id,e.branch_id,count(*) total FROM employees e WHERE e.tenant_id=? AND e.status='active'${e.sql} GROUP BY e.department_id,e.branch_id`,
        tenantId,
        ...e.args,
      ),
    );
  }
  if (modules.includes("recruitment") && can("candidate.view")) {
    keys.push("candidates");
    statements.push(
      stmt(
        c.db,
        `SELECT c.stage,count(*) total FROM candidates c LEFT JOIN job_organization o ON o.job_id=c.job_id AND o.tenant_id=c.tenant_id WHERE c.tenant_id=?${o.sql} GROUP BY c.stage`,
        tenantId,
        ...o.args,
      ),
    );
  }
  if (modules.includes("recruitment") && can("job.view")) {
    keys.push("jobs");
    statements.push(
      stmt(
        c.db,
        `SELECT j.status,count(*) total FROM jobs j LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id WHERE j.tenant_id=?${o.sql} GROUP BY j.status`,
        tenantId,
        ...o.args,
      ),
    );
  }
  const data: Record<string, Row[]> = {};
  if (statements.length) {
    const results = await c.db.batch(statements);
    keys.forEach((key, i) => (data[key] = results[i].results as Row[]));
  }
  const stageCounts = Object.fromEntries(
    (data.candidates ?? []).map((r) => [String(r.stage), Number(r.total)]),
  );
  const departmentCounts: Record<string, number> = {},
    branchCounts: Record<string, number> = {};
  for (const r of data.distribution ?? []) {
    if (r.department_id)
      departmentCounts[String(r.department_id)] =
        (departmentCounts[String(r.department_id)] ?? 0) + Number(r.total);
    if (r.branch_id)
      branchCounts[String(r.branch_id)] =
        (branchCounts[String(r.branch_id)] ?? 0) + Number(r.total);
  }
  return {
    employeeTotal: data.employees
      ? Number(data.employees[0]?.total ?? 0)
      : null,
    employeeActive: data.employees
      ? Number(data.employees[0]?.active ?? 0)
      : null,
    candidateTotal: data.candidates
      ? Object.values(stageCounts).reduce((a, b) => a + b, 0)
      : null,
    candidateActive: data.candidates
      ? Object.entries(stageCounts)
          .filter(([stage]) => stage !== "rejected")
          .reduce((a, [, n]) => a + n, 0)
      : null,
    openJobs: data.jobs
      ? Number(data.jobs.find((r) => r.status === "open")?.total ?? 0)
      : null,
    stageCounts,
    departmentCounts,
    branchCounts,
  };
}
export async function employeeTimeline(
  c: Context,
  tenantId: string,
  employeeId: string,
) {
  const t = await scope(c, tenantId, "employee.view");
  await scopedEmployee(c, tenantId, t, employeeId);
  return all(
    c.db,
    "SELECT kind,reason,snapshot,effective_date,created_at,actor_id FROM employee_history WHERE tenant_id=? AND employee_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
    tenantId,
    employeeId,
  );
}
function historyStatement(
  c: Context,
  tenantId: string,
  employeeId: string,
  kind: string,
  reason: string,
  snapshot: unknown,
  effectiveDate: string,
  at: string,
) {
  return stmt(
    c.db,
    "INSERT INTO employee_history(id,tenant_id,employee_id,actor_id,kind,reason,snapshot,effective_date,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1",
    id(),
    tenantId,
    employeeId,
    c.identity.userId,
    kind,
    reason,
    json(snapshot),
    effectiveDate,
    at,
  );
}
export async function changeEmployee(
  c: Context,
  tenantId: string,
  action: string,
  payload: unknown,
) {
  const data = payload as Row,
    t = await scope(
      c,
      tenantId,
      action === "employee.edit" ? "employee.edit" : "employee.archive",
    ),
    record = await scopedEmployee(c, tenantId, t, String(data.id));
  if (
    action === "employee.restore" &&
    (await first(
      c.db,
      "SELECT id FROM onboarding_cases WHERE tenant_id=? AND employee_id=? AND status NOT IN('approved','rejected','revoked')",
      tenantId,
      record.id,
    ))
  )
    throw new AppError(
      409,
      "Complete or revoke onboarding before restoring employee access.",
    );
  const at = now(),
    version = Number(record.version);
  if (data.version !== undefined && Number(data.version) !== version)
    throw new AppError(409, "Employee changed. Refresh and try again.");
  let command: D1PreparedStatement, snapshot: Row, reason: string, kind: string;
  if (action === "employee.edit") {
    const v = employeeEditInput.parse(data);
    await validateOrganization(c, tenantId, v);
    assertOrganizationScope(t, v);
    kind = "updated";
    reason = v.reason;
    snapshot = {
      ...record,
      full_name: v.fullName,
      email: v.email,
      designation: v.designation,
      department_id: v.departmentId,
      branch_id: v.branchId,
      joining_date: v.joiningDate,
      version: version + 1,
    };
    command = stmt(
      c.db,
      "UPDATE employees SET full_name=?,email=?,designation=?,department_id=?,branch_id=?,joining_date=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=? AND version=?",
      v.fullName,
      v.email,
      v.designation,
      v.departmentId,
      v.branchId,
      v.joiningDate,
      at,
      tenantId,
      record.id,
      version,
    );
  } else {
    const restoring = action === "employee.restore";
    kind = restoring ? "restored" : "archived";
    if (record.status === (restoring ? "active" : "archived"))
      throw new AppError(409, "Employee is already in this state.");
    reason = String(
      data.reason ??
        (restoring
          ? "Employee record reactivated"
          : "Employee record archived"),
    ).trim();
    if (reason.length < 5 || reason.length > 500)
      throw new AppError(422, "Enter a reason (5–500 characters).");
    snapshot = {
      ...record,
      status: restoring ? "active" : "archived",
      version: version + 1,
    };
    command = stmt(
      c.db,
      `UPDATE employees SET status=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=? AND version=?${restoring ? " AND (SELECT count(*) FROM employees WHERE tenant_id=? AND status='active')<?" : ""}`,
      snapshot.status,
      at,
      tenantId,
      record.id,
      version,
      ...(restoring ? [tenantId, t.employee_limit] : []),
    );
  }
  const hid = id();
  const results = await c.db.batch([
    command,
    historyStatement(
      c,
      tenantId,
      String(record.id),
      kind,
      reason,
      snapshot,
      at.slice(0, 10),
      at,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1",
      hid,
      tenantId,
      c.identity.userId,
      "employee." + kind,
      record.id,
      json({ reason, version: version + 1 }),
      at,
    ),
  ]);
  if (!results[0].meta.changes)
    throw new AppError(
      409,
      "Employee changed or your active-employee limit was reached. Refresh and retry.",
    );
  return { id: record.id };
}
export async function changeJob(c: Context, tenantId: string, data: Row) {
  const t = await scope(c, tenantId, "job.edit", "recruitment"),
    p = organizationPredicate(t, "o");
  const row = await first(
    c.db,
    `SELECT j.id,j.version FROM jobs j LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id WHERE j.tenant_id=? AND j.id=?${p.sql}`,
    tenantId,
    String(data.id),
    ...p.args,
  );
  if (!row) throw new AppError(404, "Vacancy not found.");
  const v = jobInput
    .extend({ version: z.number().int().positive().optional() })
    .parse(data);
  if (v.version !== undefined && v.version !== row.version)
    throw new AppError(409, "Vacancy changed. Refresh and retry.");
  await validateOrganization(c, tenantId, v);
  assertOrganizationScope(t, v);
  const result = await c.db.batch([
    stmt(
      c.db,
      `UPDATE jobs SET title=?,description=?,location=?,status=?,version=version+1 WHERE tenant_id=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM jobs jo LEFT JOIN job_organization o ON o.job_id=jo.id AND o.tenant_id=jo.tenant_id WHERE jo.id=jobs.id AND jo.tenant_id=jobs.tenant_id${p.sql})`,
      v.title,
      v.description,
      v.location,
      v.status,
      tenantId,
      row.id,
      row.version,
      ...p.args,
    ),
    stmt(
      c.db,
      "INSERT INTO job_organization(job_id,tenant_id,branch_id,department_id) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(job_id) DO UPDATE SET branch_id=excluded.branch_id,department_id=excluded.department_id",
      row.id,
      tenantId,
      v.branchId,
      v.departmentId,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?, 'job.updated',?,?,? WHERE changes()=1",
      id(),
      tenantId,
      c.identity.userId,
      row.id,
      json({ status: v.status, version: Number(row.version) + 1 }),
      now(),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Vacancy changed. Refresh and retry.");
  return { id: row.id };
}
export async function revokeMember(
  c: Context,
  tenantId: string,
  data: Row,
  restore = false,
) {
  const actor = await scope(c, tenantId, "role.manage");
  assertCompanyWide(actor);
  const m = await first(
    c.db,
    "SELECT m.*,r.name role_name FROM memberships m JOIN roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id WHERE m.id=? AND m.tenant_id=?",
    String(data.id),
    tenantId,
  );
  if (!m) throw new AppError(404, "Member not found.");
  if (m.user_id === c.identity.userId)
    throw new AppError(
      409,
      "Use sign out to end your session; your own company membership cannot be revoked here.",
    );
  await roleForDelegation(c, tenantId, actor, String(m.role_id));
  const reason = String(data.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500)
    throw new AppError(422, "Enter a reason (5–500 characters).");
  const at = now();
  const result = await c.db.batch([
    restore
      ? stmt(
          c.db,
          "UPDATE membership_revocations SET restored_at=? WHERE membership_id=? AND restored_at IS NULL",
          at,
          m.id,
        )
      : stmt(
          c.db,
          "INSERT INTO membership_revocations(membership_id,revoked_at,restored_at,reason,actor_id) VALUES(?,?,NULL,?,?) ON CONFLICT(membership_id) DO UPDATE SET revoked_at=excluded.revoked_at,restored_at=NULL,reason=excluded.reason,actor_id=excluded.actor_id",
          m.id,
          at,
          reason,
          c.identity.userId,
        ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1",
      id(),
      tenantId,
      c.identity.userId,
      restore ? "membership.restored" : "membership.revoked",
      m.id,
      json({ reason }),
      at,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Membership is not in the expected state.");
  return {};
}
export async function employeeExport(c: Context, tenantId: string) {
  const t = await scope(c, tenantId, "employee.export"),
    p = organizationPredicate(t, "e");
  const count = await first(
    c.db,
    `SELECT count(*) total FROM employees e WHERE e.tenant_id=?${p.sql}`,
    tenantId,
    ...p.args,
  );
  if (Number(count?.total) > 5000)
    throw new AppError(
      413,
      "This export exceeds 5,000 records. A background export is required.",
    );
  const rows = await all(
    c.db,
    `SELECT e.employee_code,e.full_name,e.email,e.designation,e.joining_date,e.status FROM employees e WHERE e.tenant_id=?${p.sql} ORDER BY e.employee_code LIMIT 5000`,
    tenantId,
    ...p.args,
  );
  await audit(c, tenantId, "employee.exported", tenantId, {
    records: rows.length,
  }).run();
  return { rows };
}
export async function candidateTimeline(
  c: Context,
  tenantId: string,
  candidateId: string,
) {
  const t = await scope(c, tenantId, "candidate.view", "recruitment");
  await scopedCandidate(c, tenantId, t, candidateId);
  return all(
    c.db,
    "SELECT from_stage,to_stage,reason,created_at FROM candidate_history WHERE tenant_id=? AND candidate_id=? ORDER BY created_at DESC,id DESC LIMIT 200",
    tenantId,
    candidateId,
  );
}
