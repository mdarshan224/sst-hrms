import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { database } from "./d1-adapter.mjs";
import { mutate, readWorkspace, bootstrap } from "../lib/hrms/service.ts";
import {
  employeePage,
  candidatePage,
  jobPage,
  employeeTimeline,
  employeeExport,
} from "../lib/hrms/records.ts";
import { scope } from "../lib/hrms/access.ts";
import { csvCell } from "../lib/hrms/domain.ts";
import { handleRequest } from "../lib/hrms/http.ts";
const at = () => new Date().toISOString();
async function fixture() {
  const { db, sql } = database();
  const identity = {
    userId: crypto.randomUUID(),
    mobile: "9000000001",
    email: "root@example.test",
    displayName: "Synthetic Root",
  };
  sql
    .prepare(
      "INSERT INTO users(id,mobile,email,display_name,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      identity.userId,
      identity.mobile,
      identity.email,
      identity.displayName,
      at(),
      at(),
    );
  const owner = { db, identity, adminMobile: identity.mobile };
  const a = (
    await mutate(owner, "tenant.create", "", {
      name: "Alpha Synthetic",
      slug: "alpha-synthetic",
      adminMobile: identity.mobile,
    })
  ).id;
  const b = (
    await mutate(owner, "tenant.create", "", {
      name: "Beta Synthetic",
      slug: "beta-synthetic",
      adminMobile: "9000000002",
    })
  ).id;
  const betaUser = sql
    .prepare("SELECT * FROM users WHERE mobile=?")
    .get("9000000002");
  const beta = {
    ...owner,
    identity: {
      userId: betaUser.id,
      mobile: betaUser.mobile,
      email: "beta@example.test",
      displayName: "Synthetic Beta",
    },
  };
  const branch1 = (
    await mutate(owner, "organization.create", a, {
      kind: "branches",
      name: "North",
    })
  ).id;
  const branch2 = (
    await mutate(owner, "organization.create", a, {
      kind: "branches",
      name: "South",
    })
  ).id;
  const dept1 = (
    await mutate(owner, "organization.create", a, {
      kind: "departments",
      name: "Engineering",
    })
  ).id;
  const dept2 = (
    await mutate(owner, "organization.create", a, {
      kind: "departments",
      name: "Finance",
    })
  ).id;
  return { db, sql, owner, beta, a, b, branch1, branch2, dept1, dept2 };
}
const employee = (i = 1, extra = {}) => ({
  fullName: `Synthetic Employee ${i}`,
  email: `employee${i}@example.test`,
  designation: "Engineer",
  joiningDate: "2026-10-12",
  ...extra,
});
const job = (extra = {}) => ({
  title: "Synthetic Engineer",
  description: "Build and maintain secure business software.",
  location: "Bengaluru",
  status: "open",
  ...extra,
});
const denied = (fn, status) => assert.rejects(fn, (e) => e.status === status);
async function member(s, grants, scope = {}) {
  const role = (
    await mutate(s.owner, "role.create", s.a, {
      name: "Restricted " + crypto.randomUUID(),
      permissions: grants,
      ...scope,
    })
  ).id;
  const uid = crypto.randomUUID(),
    mobile = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const invite = await mutate(s.owner, "member.invite", s.a, {
    roleId: role,
    mobile,
  });
  s.sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,verified_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(uid, mobile, "Synthetic Member", at(), at());
  const context = {
    ...s.owner,
    identity: {
      userId: uid,
      mobile,
      email: "member@example.test",
      displayName: "Synthetic Member",
    },
  };
  await mutate(context, "invite.accept", "", { token: invite.inviteToken });
  return context;
}
test("branch and department restrictions apply to directory, aggregates, exports, writes and history", async () => {
  const s = await fixture();
  const allowed = await mutate(
    s.owner,
    "employee.create",
    s.a,
    employee(1, { branchId: s.branch1, departmentId: s.dept1 }),
  );
  const hidden = await mutate(
    s.owner,
    "employee.create",
    s.a,
    employee(2, { branchId: s.branch2, departmentId: s.dept1 }),
  );
  await mutate(
    s.owner,
    "employee.create",
    s.a,
    employee(3, { branchId: s.branch1, departmentId: s.dept2 }),
  );
  const m = await member(
    s,
    [
      "employee.view",
      "employee.create",
      "employee.edit",
      "employee.archive",
      "employee.export",
    ],
    { branchId: s.branch1, departmentId: s.dept1 },
  );
  assert.deepEqual(
    (await employeePage(m, s.a)).rows.map((r) => r.id),
    [allowed.id],
  );
  assert.equal((await readWorkspace(m, s.a)).stats.employeeActive, 1);
  assert.equal((await employeeExport(m, s.a)).rows.length, 1);
  assert.equal((await employeePage(m, s.a, { branchId: s.branch2 })).total, 0);
  await denied(() => employeeTimeline(m, s.a, hidden.id), 404);
  await denied(
    () =>
      mutate(m, "employee.archive", s.a, {
        id: hidden.id,
        reason: "Not in scope",
      }),
    404,
  );
  await denied(
    () =>
      mutate(
        m,
        "employee.create",
        s.a,
        employee(4, { branchId: s.branch2, departmentId: s.dept1 }),
      ),
    403,
  );
  await denied(
    () =>
      mutate(m, "employee.edit", s.a, {
        ...employee(1, { branchId: s.branch2, departmentId: s.dept1 }),
        id: allowed.id,
        version: 1,
        reason: "Move outside scope",
      }),
    403,
  );
  await denied(() => employeePage(m, s.b), 404);
});
test("restricted roles cannot grant broader permissions or organizational scopes", async () => {
  const s = await fixture();
  const m = await member(s, ["role.manage", "employee.view"], {
    branchId: s.branch1,
  });
  await denied(
    () =>
      mutate(m, "role.create", s.a, {
        name: "Escalated",
        permissions: ["employee.create"],
        branchId: s.branch1,
      }),
    403,
  );
  await denied(
    () =>
      mutate(m, "role.create", s.a, {
        name: "Company Wide",
        permissions: ["employee.view"],
      }),
    403,
  );
  const r = await mutate(m, "role.create", s.a, {
    name: "Same Scope",
    permissions: ["employee.view"],
    branchId: s.branch1,
  });
  const ownerRole = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? AND name='Company Owner'")
    .get(s.a).id;
  await denied(
    () =>
      mutate(m, "member.invite", s.a, {
        mobile: "9000000008",
        roleId: ownerRole,
      }),
    403,
  );
  await denied(() => mutate(m, "roles.presets", s.a, {}), 403);
  await denied(
    () =>
      mutate(m, "branding.update", s.a, {
        name: "Bad",
        brandColor: "#123456",
        employeePrefix: "BAD",
        timezone: "UTC",
      }),
    403,
  );
  assert.ok(r.id);
});
test("Company Owner role name is reserved and role presets preserve existing roles", async () => {
  const s = await fixture();
  await assert.rejects(
    () =>
      mutate(s.owner, "role.create", s.a, {
        name: "Company Owner",
        permissions: ["employee.view"],
      }),
    (e) => e.status === 422,
  );
  await mutate(s.owner, "roles.presets", s.a, {});
  await mutate(s.owner, "roles.presets", s.a, {});
  assert.equal(
    s.sql.prepare("SELECT count(*) total FROM roles WHERE tenant_id=?").get(s.a)
      .total,
    6,
  );
});
test("server pagination, literal wildcard search, sort and aggregate counts work beyond the former 500-row cap", async () => {
  const s = await fixture();
  const insert = s.sql.prepare(
    "INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,branch_id,joining_date,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  s.sql.exec("BEGIN");
  for (let i = 0; i < 1201; i++)
    insert.run(
      crypto.randomUUID(),
      s.a,
      `S-${String(i).padStart(5, "0")}`,
      i === 77 ? "100%_ Literal" : `Synthetic ${i}`,
      `bulk${i}@example.test`,
      "Engineer",
      s.branch1,
      "2026-10-12",
      i % 2 ? "archived" : "active",
      at(),
    );
  s.sql.exec("COMMIT");
  const p1 = await employeePage(s.owner, s.a, { pageSize: 100, sort: "code" }),
    p2 = await employeePage(s.owner, s.a, {
      pageSize: 100,
      sort: "code",
      page: 2,
    });
  assert.equal(p1.total, 1201);
  assert.equal(p1.totalPages, 13);
  assert.equal(p2.rows.length, 100);
  assert.ok(!p2.rows.some((r) => p1.rows.some((a) => a.id === r.id)));
  assert.equal((await employeePage(s.owner, s.a, { q: "%_" })).total, 1);
  const stats = (await readWorkspace(s.owner, s.a)).stats;
  assert.equal(stats.employeeTotal, 1201);
  assert.equal(stats.employeeActive, 601);
  assert.equal(stats.branchCounts[s.branch1], 601);
  await assert.rejects(() => employeePage(s.owner, s.a, { pageSize: 101 }));
  await assert.rejects(() =>
    employeePage(s.owner, s.a, { sort: "id;DROP TABLE employees" }),
  );
});
test("candidate and vacancy pages, histories and applicant totals respect branch scope", async () => {
  const s = await fixture();
  const j1 = await mutate(
    s.owner,
    "job.create",
    s.a,
    job({ branchId: s.branch1 }),
  );
  const j2 = await mutate(
    s.owner,
    "job.create",
    s.a,
    job({ branchId: s.branch2 }),
  );
  for (let i = 0; i < 3; i++)
    await mutate(s.owner, "candidate.create", s.a, {
      fullName: "Synthetic Candidate " + i,
      email: `candidate${i}@example.test`,
      phone: "9000000005",
      source: "Test",
      jobId: i === 2 ? j2.id : j1.id,
    });
  const m = await member(
    s,
    [
      "job.view",
      "job.edit",
      "candidate.view",
      "candidate.create",
      "candidate.transition",
    ],
    { branchId: s.branch1 },
  );
  assert.equal((await candidatePage(m, s.a)).total, 2);
  assert.equal((await jobPage(m, s.a)).total, 1);
  assert.equal((await jobPage(m, s.a)).rows[0].applicant_count, 2);
  const stats = (await readWorkspace(m, s.a)).stats;
  assert.equal(stats.candidateTotal, 2);
  assert.equal(stats.openJobs, 1);
  await denied(
    () =>
      mutate(m, "job.edit", s.a, {
        ...job({ branchId: s.branch2 }),
        id: j2.id,
        version: 1,
      }),
    404,
  );
  await denied(
    () =>
      mutate(m, "candidate.create", s.a, {
        fullName: "Unauthorized Candidate",
        email: "blocked@example.test",
        phone: "9000000006",
        source: "Test",
        jobId: j2.id,
      }),
    403,
  );
  const noCandidate = await member(s, ["job.view"], { branchId: s.branch1 });
  assert.equal((await jobPage(noCandidate, s.a)).rows[0].applicant_count, null);
});
test("employee edits preserve immutable history, reject stale versions and quota violations on restore", async () => {
  const s = await fixture();
  const e = await mutate(s.owner, "employee.create", s.a, employee());
  await mutate(s.owner, "employee.edit", s.a, {
    ...employee(),
    designation: "Senior Engineer",
    id: e.id,
    version: 1,
    reason: "Promotion approved",
  });
  await denied(
    () =>
      mutate(s.owner, "employee.edit", s.a, {
        ...employee(),
        id: e.id,
        version: 1,
        reason: "Stale version update",
      }),
    409,
  );
  assert.equal((await employeeTimeline(s.owner, s.a, e.id)).length, 2);
  assert.throws(
    () => s.sql.exec("UPDATE employee_history SET reason='tampered'"),
    /immutable/,
  );
  assert.throws(() => s.sql.exec("DELETE FROM employee_history"), /immutable/);
  await mutate(s.owner, "employee.archive", s.a, {
    id: e.id,
    version: 2,
    reason: "Separation completed",
  });
  assert.equal((await employeeTimeline(s.owner, s.a, e.id)).length, 3);
  s.sql.exec("UPDATE plans SET employee_limit=1");
  await mutate(s.owner, "employee.create", s.a, employee(2));
  await denied(
    () =>
      mutate(s.owner, "employee.restore", s.a, {
        id: e.id,
        version: 3,
        reason: "Return to employment",
      }),
    409,
  );
  assert.equal((await employeeTimeline(s.owner, s.a, e.id)).length, 3);
});
test("vacancy edits reject stale and interleaved updates without false audits", async () => {
  const s = await fixture(),
    j = await mutate(s.owner, "job.create", s.a, job());
  await mutate(s.owner, "job.edit", s.a, {
    ...job(),
    id: j.id,
    version: 1,
    status: "closed",
  });
  await denied(
    () => mutate(s.owner, "job.edit", s.a, { ...job(), id: j.id, version: 1 }),
    409,
  );
  const prior = s.sql
    .prepare("SELECT count(*) total FROM audit_logs WHERE action='job.updated'")
    .get().total;
  const batch = s.db.batch;
  s.db.batch = async (cmds) => {
    s.db.batch = batch;
    s.sql.prepare("UPDATE jobs SET version=version+1 WHERE id=?").run(j.id);
    return batch(cmds);
  };
  await denied(
    () => mutate(s.owner, "job.edit", s.a, { ...job(), id: j.id, version: 2 }),
    409,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) total FROM audit_logs WHERE action='job.updated'",
      )
      .get().total,
    prior,
  );
});
test("membership revocation removes only that company access and restoration is audited", async () => {
  const s = await fixture();
  const m = await member(s, ["employee.view"]);
  const id = s.sql
    .prepare("SELECT id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.a, m.identity.userId).id;
  await mutate(s.owner, "member.revoke", s.a, { id, reason: "Contract ended" });
  assert.equal((await bootstrap(m)).workspaces.length, 0);
  await denied(() => scope(m, s.a, "employee.view"), 404);
  await denied(
    () =>
      mutate(s.beta, "member.restore", s.b, {
        id,
        reason: "Cross tenant restore",
      }),
    404,
  );
  await mutate(s.owner, "member.restore", s.a, {
    id,
    reason: "Access reviewed and restored",
  });
  assert.equal((await bootstrap(m)).workspaces.length, 1);
  await denied(
    () =>
      mutate(s.owner, "member.revoke", s.a, {
        id: s.sql
          .prepare("SELECT id FROM memberships WHERE tenant_id=? AND user_id=?")
          .get(s.a, s.owner.identity.userId).id,
        reason: "Self revoke",
      }),
    409,
  );
});
test("composite foreign keys reject cross-company role scopes and vacancy organization", async () => {
  const s = await fixture();
  const foreign = (
    await mutate(s.beta, "organization.create", s.b, {
      kind: "branches",
      name: "Beta branch",
    })
  ).id;
  const rid = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? LIMIT 1")
    .get(s.a).id;
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO role_scopes(role_id,tenant_id,branch_id) VALUES(?,?,?)",
        )
        .run(rid, s.a, foreign),
    /FOREIGN KEY/,
  );
  const jid = await mutate(s.owner, "job.create", s.a, job());
  assert.throws(
    () =>
      s.sql
        .prepare("UPDATE job_organization SET branch_id=? WHERE job_id=?")
        .run(foreign, jid.id),
    /FOREIGN KEY/,
  );
});
test("HTTP paginated views are permission checked and send security headers", async () => {
  const s = await fixture();
  const request = new Request(
    `https://hrms.example.test/api/hrms?view=employees&tenant=${s.a}&pageSize=10`,
  );
  const deniedResponse = await handleRequest(request, async () => s.beta);
  assert.equal(deniedResponse.status, 404);
  const ok = await handleRequest(request, async () => s.owner);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).pageSize, 10);
  assert.equal(ok.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
});
test("CSV cells neutralize formulas after leading whitespace and control characters", () => {
  for (const value of ["=SUM(1,2)", "  +cmd", "\t@cmd", "\r-cmd"])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.equal(csvCell('ordinary "text"'), '"ordinary ""text"""');
});
test("append-only migration upgrade preserves existing rows and passes integrity checks", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  const files = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files.filter((f) => Number(f.slice(0, 4)) <= 2))
    sql.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  sql
    .prepare(
      "INSERT INTO tenants(id,name,slug,stages,created_at) VALUES('retained','Retained','retained','[]',?)",
    )
    .run(at());
  sql
    .prepare(
      "INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,joining_date,created_at) VALUES('old','retained','EMP-1','Synthetic Legacy','legacy@example.test','Engineer','2026-01-01',?)",
    )
    .run(at());
  for (const file of files.filter((f) => Number(f.slice(0, 4)) > 2))
    sql.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  assert.equal(
    sql.prepare("SELECT full_name,version FROM employees WHERE id='old'").get()
      .version,
    1,
  );
  assert.equal(
    sql.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(sql.prepare("PRAGMA foreign_key_check").all().length, 0);
  sql.close();
});

test("synthetic backup restoration preserves records, history and authorization constraints", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const s = await fixture();
  const e = await mutate(s.owner, "employee.create", s.a, employee());
  await mutate(s.owner, "employee.archive", s.a, {
    id: e.id,
    reason: "Synthetic restore drill",
  });
  const directory = mkdtempSync(join(tmpdir(), "hrms-restore-"));
  const target = join(directory, "snapshot.sqlite");
  try {
    s.sql.prepare("VACUUM INTO ?").run(target);
    const restored = new DatabaseSync(target);
    restored.exec("PRAGMA foreign_keys=ON");
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(restored.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(
      restored.prepare("SELECT status FROM employees WHERE id=?").get(e.id)
        .status,
      "archived",
    );
    assert.equal(
      restored
        .prepare(
          "SELECT count(*) total FROM employee_history WHERE employee_id=?",
        )
        .get(e.id).total,
      2,
    );
    assert.throws(
      () => restored.exec("DELETE FROM employee_history"),
      /immutable/,
    );
    restored.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
