import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1-adapter.mjs";
import {
  mutate as realMutate,
  scope,
  readWorkspace,
  readPlatform,
  bootstrap,
} from "../lib/hrms/service.ts";
import { handleRequest } from "../lib/hrms/http.ts";
import {
  AppError,
  assertOrigin,
  assertTransition,
  defaultStages,
  employeeInput,
  tokenHash,
} from "../lib/hrms/domain.ts";

const mobileFor = (email) =>
  ({
    "owner@example.test": "7676272709",
    "beta@example.test": "9876543210",
    "staff@example.test": "9123456789",
    "stranger@example.test": "9234567890",
    "recruiter@example.test": "9345678901",
    "evil@example.test": "9456789012",
  })[email] ?? "9567890123";
const identity = (userId, email) => ({
  userId,
  email,
  mobile: mobileFor(email),
  displayName: email,
});
async function mutate(c, action, tenant, data) {
  if (action === "tenant.create")
    data = {
      ...data,
      adminMobile: data.adminMobile ?? mobileFor(data.adminEmail),
    };
  if (action === "member.invite")
    data = { ...data, mobile: data.mobile ?? mobileFor(data.email) };
  // Test accounts represent authenticated, verified users before service operations.
  await c.db
    .prepare(
      "INSERT OR IGNORE INTO users(id,mobile,email,display_name,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      c.identity.userId,
      c.identity.mobile,
      c.identity.email,
      c.identity.displayName,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  return realMutate(c, action, tenant, data);
}
async function setup() {
  const { db, sql } = database();
  const owner = {
    db,
    identity: identity("platform-owner", "owner@example.test"),
    adminMobile: "7676272709",
  };
  const a = await mutate(owner, "tenant.create", "", {
    name: "Alpha Company",
    slug: "alpha-company",
    adminEmail: owner.identity.email,
  });
  const b = await mutate(owner, "tenant.create", "", {
    name: "Beta Company",
    slug: "beta-company",
    adminEmail: "beta@example.test",
  });
  const betaRow = sql
    .prepare("SELECT id FROM users WHERE mobile=?")
    .get(mobileFor("beta@example.test"));
  const beta = {
    db,
    identity: identity(betaRow.id, "beta@example.test"),
    adminMobile: owner.adminMobile,
  };
  return { db, sql, owner, beta, a: a.id, b: b.id };
}
const employee = (email = "employee@example.test") => ({
  fullName: "Test Employee",
  email,
  designation: "Engineer",
  joiningDate: "2026-10-12",
});
const vacancy = {
  title: "Software Engineer",
  description: "Build business software and maintain secure APIs.",
  location: "Bengaluru",
  status: "open",
};
async function candidate(s) {
  const job = await mutate(s.owner, "job.create", s.a, vacancy);
  const c = await mutate(s.owner, "candidate.create", s.a, {
    fullName: "A Candidate",
    email: "candidate@example.test",
    jobId: job.id,
    phone: "+919876543210",
    source: "Referral",
  });
  return { job: job.id, id: c.id };
}
const fails = (fn, status) => assert.rejects(fn, (e) => e.status === status);

test("company provisioning is atomic, default roles and trial are persisted", async () => {
  const s = await setup();
  assert.equal(s.sql.prepare("SELECT count(*) c FROM tenants").get().c, 2);
  assert.equal(s.sql.prepare("SELECT count(*) c FROM roles").get().c, 4);
  assert.equal((await bootstrap(s.beta)).workspaces.length, 1);
  const sub = s.sql
    .prepare("SELECT * FROM subscriptions WHERE tenant_id=?")
    .get(s.a);
  assert.equal(sub.status, "trial");
  assert.ok(new Date(sub.expires_at) > new Date());
});
test("duplicate tenant slug rolls back all dependent rows", async () => {
  const s = await setup();
  await assert.rejects(() =>
    mutate(s.owner, "tenant.create", "", {
      name: "Duplicate Alpha",
      slug: "alpha-company",
      adminEmail: s.owner.identity.email,
    }),
  );
  assert.equal(s.sql.prepare("SELECT count(*) c FROM tenants").get().c, 2);
  assert.equal(s.sql.prepare("SELECT count(*) c FROM memberships").get().c, 2);
});
test("platform owner has no automatic company data access", async () => {
  const s = await setup();
  await fails(() => readWorkspace(s.owner, s.b), 404);
  assert.equal((await readPlatform(s.owner)).tenants.length, 2);
});
test("company administrator cannot access platform operations", async () => {
  const s = await setup();
  await fails(() => readPlatform(s.beta), 403);
  await fails(
    () => mutate(s.beta, "tenant.status", "", { id: s.a, status: "suspended" }),
    403,
  );
});
test("cross-tenant reads, creation, archive and candidate history scope are denied", async () => {
  const s = await setup();
  const e = await mutate(s.owner, "employee.create", s.a, employee());
  await fails(() => scope(s.beta, s.a, "candidate.view", "recruitment"), 404);
  await fails(() => mutate(s.beta, "employee.create", s.a, employee()), 404);
  await fails(() => mutate(s.beta, "employee.archive", s.b, { id: e.id }), 404);
  await fails(() => readWorkspace(s.beta, s.a), 404);
});
test("employee IDs are sequential and company-specific", async () => {
  const s = await setup();
  await mutate(s.owner, "employee.create", s.a, employee("one@example.test"));
  await mutate(s.owner, "employee.create", s.a, employee("two@example.test"));
  await mutate(s.beta, "employee.create", s.b, employee("one@example.test"));
  assert.deepEqual(
    s.sql
      .prepare(
        "SELECT employee_code FROM employees WHERE tenant_id=? ORDER BY employee_code",
      )
      .all(s.a)
      .map((e) => e.employee_code),
    ["EMP-00001", "EMP-00002"],
  );
  assert.equal(
    s.sql
      .prepare("SELECT employee_code FROM employees WHERE tenant_id=?")
      .get(s.b).employee_code,
    "EMP-00001",
  );
});
test("duplicate employee email fails and rolls back sequence and audit", async () => {
  const s = await setup();
  await mutate(s.owner, "employee.create", s.a, employee());
  await assert.rejects(() =>
    mutate(s.owner, "employee.create", s.a, employee()),
  );
  assert.equal(
    s.sql.prepare("SELECT sequence FROM tenants WHERE id=?").get(s.a).sequence,
    1,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE action='employee.created'",
      )
      .get().c,
    1,
  );
});
test("cross-tenant department assignment is denied by service and database", async () => {
  const s = await setup();
  const d = await mutate(s.beta, "organization.create", s.b, {
    kind: "departments",
    name: "Beta Engineering",
  });
  await fails(
    () =>
      mutate(s.owner, "employee.create", s.a, {
        ...employee(),
        departmentId: d.id,
      }),
    422,
  );
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO employees(id,tenant_id,employee_code,full_name,email,designation,department_id,joining_date,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          s.a,
          "BAD-1",
          "Bad Actor",
          "bad@example.test",
          "Engineer",
          d.id,
          "2026-10-12",
          new Date().toISOString(),
        ),
    /FOREIGN KEY/,
  );
});
test("employee plan limit is enforced; archive frees an active seat", async () => {
  const s = await setup();
  s.sql.exec("UPDATE plans SET employee_limit=1");
  const e = await mutate(s.owner, "employee.create", s.a, employee());
  await fails(
    () =>
      mutate(s.owner, "employee.create", s.a, employee("other@example.test")),
    409,
  );
  await mutate(s.owner, "employee.archive", s.a, { id: e.id });
  await mutate(s.owner, "employee.create", s.a, employee("other@example.test"));
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM employees WHERE tenant_id=? AND status='active'",
      )
      .get(s.a).c,
    1,
  );
});
test("suspended tenant and expired subscription deny all workspace operations", async () => {
  const s = await setup();
  await mutate(s.owner, "tenant.status", "", { id: s.b, status: "suspended" });
  await fails(() => readWorkspace(s.beta, s.b), 403);
  await mutate(s.owner, "tenant.status", "", { id: s.b, status: "active" });
  s.sql
    .prepare("UPDATE subscriptions SET expires_at=? WHERE tenant_id=?")
    .run("2000-01-01T00:00:00.000Z", s.b);
  await fails(() => mutate(s.beta, "employee.create", s.b, employee()), 402);
});
test("disabled recruitment entitlement blocks job API", async () => {
  const s = await setup();
  s.sql.prepare("UPDATE plans SET modules=?").run(JSON.stringify(["core"]));
  await fails(() => mutate(s.owner, "job.create", s.a, vacancy), 403);
});
test("custom roles enforce backend permissions and do not need report.view", async () => {
  const s = await setup();
  const role = await mutate(s.owner, "role.create", s.a, {
    name: "Recruiter",
    permissions: ["candidate.view"],
  });
  const invite = await mutate(s.owner, "member.invite", s.a, {
    email: "recruiter@example.test",
    roleId: role.id,
  });
  const recruiter = {
    ...s.owner,
    identity: identity("recruiter", "recruiter@example.test"),
  };
  await mutate(recruiter, "invite.accept", "", { token: invite.inviteToken });
  await fails(() => mutate(recruiter, "employee.create", s.a, employee()), 403);
  const result = await readWorkspace(recruiter, s.a);
  assert.deepEqual(result.employees, []);
  assert.deepEqual(result.roles, []);
  assert.equal(JSON.parse(result.tenant.permissions).length, 1);
});
test("invitations are hashed, bound to mobile and cannot be reused", async () => {
  const s = await setup();
  const rid = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? AND name=?")
    .get(s.a, "Employee").id;
  const inv = await mutate(s.owner, "member.invite", s.a, {
    email: "staff@example.test",
    roleId: rid,
  });
  assert.equal((await tokenHash(inv.inviteToken)).length, 64);
  assert.ok(
    !JSON.stringify(s.sql.prepare("SELECT * FROM invitations").all()).includes(
      inv.inviteToken,
    ),
  );
  const stranger = {
    ...s.owner,
    identity: identity("stranger", "stranger@example.test"),
  };
  await fails(
    () => mutate(stranger, "invite.accept", "", { token: inv.inviteToken }),
    403,
  );
  const staff = {
    ...s.owner,
    identity: identity("staff", "staff@example.test"),
  };
  await mutate(staff, "invite.accept", "", { token: inv.inviteToken });
  await fails(
    () => mutate(staff, "invite.accept", "", { token: inv.inviteToken }),
    403,
  );
});
test("expired and revoked invitation tokens are denied", async () => {
  const s = await setup();
  const rid = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? LIMIT 1")
    .get(s.a).id;
  const inv = await mutate(s.owner, "member.invite", s.a, {
    email: "staff@example.test",
    roleId: rid,
  });
  const staff = {
    ...s.owner,
    identity: identity("staff", "staff@example.test"),
  };
  s.sql
    .prepare("UPDATE invitations SET expires_at=? WHERE token_hash=?")
    .run("2000-01-01T00:00:00Z", await tokenHash(inv.inviteToken));
  await fails(
    () => mutate(staff, "invite.accept", "", { token: inv.inviteToken }),
    403,
  );
  const inv2 = await mutate(s.owner, "member.invite", s.a, {
    email: "staff@example.test",
    roleId: rid,
  });
  const row = s.sql
    .prepare("SELECT id FROM invitations WHERE token_hash=?")
    .get(await tokenHash(inv2.inviteToken));
  await mutate(s.owner, "invite.revoke", s.a, { id: row.id });
  await fails(
    () => mutate(staff, "invite.accept", "", { token: inv2.inviteToken }),
    403,
  );
});
test("cross-tenant role invitation and membership references are rejected", async () => {
  const s = await setup();
  const role = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? LIMIT 1")
    .get(s.b).id;
  await fails(
    () =>
      mutate(s.owner, "member.invite", s.a, {
        email: "staff@example.test",
        roleId: role,
      }),
    422,
  );
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO memberships(id,tenant_id,user_id,email,role_id,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          s.a,
          "evil",
          "evil@example.test",
          role,
          new Date().toISOString(),
        ),
    /FOREIGN KEY/,
  );
});
test("open vacancy and unique candidate application are required", async () => {
  const s = await setup();
  const c = await candidate(s);
  const input = {
    fullName: "A Candidate",
    email: "candidate@example.test",
    jobId: c.job,
    phone: "+919876543210",
    source: "Direct",
  };
  await assert.rejects(() => mutate(s.owner, "candidate.create", s.a, input));
  await fails(() => mutate(s.beta, "candidate.create", s.b, input), 422);
  const draft = await mutate(s.owner, "job.create", s.a, {
    ...vacancy,
    status: "draft",
  });
  await fails(
    () =>
      mutate(s.owner, "candidate.create", s.a, { ...input, jobId: draft.id }),
    422,
  );
});
test("valid stage transitions write exactly one versioned decision and audit", async () => {
  const s = await setup();
  const c = await candidate(s);
  await mutate(s.owner, "candidate.transition", s.a, {
    id: c.id,
    version: 1,
    stage: "screening",
    reason: "Initial screening",
  });
  assert.equal(
    s.sql.prepare("SELECT version FROM candidates WHERE id=?").get(c.id)
      .version,
    2,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) c FROM candidate_history").get().c,
    1,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE action='candidate.transitioned'",
      )
      .get().c,
    1,
  );
});
test("invalid, stale and unexplained rejection transitions are rejected", async () => {
  const s = await setup();
  const c = await candidate(s);
  await fails(
    () =>
      mutate(s.owner, "candidate.transition", s.a, {
        id: c.id,
        version: 1,
        stage: "selected",
        reason: "",
      }),
    409,
  );
  await fails(
    () =>
      mutate(s.owner, "candidate.transition", s.a, {
        id: c.id,
        version: 1,
        stage: "rejected",
        reason: "",
      }),
    422,
  );
  await mutate(s.owner, "candidate.transition", s.a, {
    id: c.id,
    version: 1,
    stage: "screening",
    reason: "",
  });
  await fails(
    () =>
      mutate(s.owner, "candidate.transition", s.a, {
        id: c.id,
        version: 1,
        stage: "interview",
        reason: "",
      }),
    409,
  );
  await fails(
    () =>
      mutate(s.beta, "candidate.transition", s.b, {
        id: c.id,
        version: 2,
        stage: "interview",
        reason: "",
      }),
    404,
  );
});
test("pipeline definition validates transitions and protects occupied stages", async () => {
  const s = await setup();
  await candidate(s);
  await fails(
    () =>
      mutate(s.owner, "pipeline.update", s.a, {
        stages: defaultStages.filter((s) => s.id !== "applied"),
      }),
    409,
  );
  const pipeline = [
    { id: "screening", label: "Screening", next: ["selected"] },
    { id: "selected", label: "Selected", next: [] },
  ];
  await fails(
    () => mutate(s.owner, "pipeline.update", s.a, { stages: pipeline }),
    409,
  );
  const updated = defaultStages.map((s) =>
    s.id === "applied" ? { ...s, label: "New applications" } : s,
  );
  await mutate(s.owner, "pipeline.update", s.a, { stages: updated });
  assert.equal(
    JSON.parse(
      s.sql.prepare("SELECT stages FROM tenants WHERE id=?").get(s.a).stages,
    )[0].label,
    "New applications",
  );
});
test("branding changes apply tenant-specific employee prefix", async () => {
  const s = await setup();
  await mutate(s.owner, "branding.update", s.a, {
    name: "Alpha Updated",
    brandColor: "#6633aa",
    employeePrefix: "ALP",
    timezone: "Asia/Kolkata",
  });
  await mutate(s.owner, "employee.create", s.a, employee());
  assert.equal(
    s.sql
      .prepare("SELECT employee_code FROM employees WHERE tenant_id=?")
      .get(s.a).employee_code,
    "ALP-00001",
  );
  assert.equal(
    s.sql.prepare("SELECT employee_prefix FROM tenants WHERE id=?").get(s.b)
      .employee_prefix,
    "EMP",
  );
});
test("manual plan assignment persists entitlements without implying payment", async () => {
  const s = await setup();
  const plan = await mutate(s.owner, "plan.create", "", {
    name: "Professional",
    employeeLimit: 150,
    pricePaise: 299900,
    modules: ["core"],
  });
  await mutate(s.owner, "subscription.assign", "", {
    id: s.a,
    planId: plan.id,
    expiresAt: "2099-01-01",
  });
  assert.equal(
    s.sql
      .prepare("SELECT plan_id FROM subscriptions WHERE tenant_id=?")
      .get(s.a).plan_id,
    plan.id,
  );
  await fails(() => mutate(s.owner, "job.create", s.a, vacancy), 403);
});
test("authorization rejects forged browser origins and non-JSON writes", () => {
  assert.throws(
    () =>
      assertOrigin(
        new Request("https://hrms.example.test/api", {
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
        }),
      ),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      assertOrigin(
        new Request("https://hrms.example.test/api", {
          headers: {
            origin: "https://hrms.example.test",
            "content-type": "text/plain",
          },
        }),
      ),
    (e) => e.status === 415,
  );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request("https://hrms.example.test/api", {
        headers: {
          origin: "https://hrms.example.test",
          "content-type": "application/json",
        },
      }),
    ),
  );
});
test("input validation rejects malformed and impossible dates", () => {
  assert.equal(
    employeeInput.safeParse({ ...employee(), email: "invalid" }).success,
    false,
  );
  assert.equal(
    employeeInput.safeParse({ ...employee(), joiningDate: "2026-02-31" })
      .success,
    false,
  );
  assert.equal(
    employeeInput.safeParse({ ...employee(), joiningDate: "2026-99-99" })
      .success,
    false,
  );
});
test("transition guard rejects unknown stage IDs", () => {
  assert.throws(
    () => assertTransition(defaultStages, "unknown", "screening", ""),
    (e) => e.status === 409,
  );
});

const request = (action, tenant, data, origin = "https://hrms.example.test") =>
  new Request("https://hrms.example.test/api/hrms", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action, tenant, data }),
  });
test("HTTP API rejects unauthenticated reads and writes", async () => {
  const anonymous = async () => {
    throw new AppError(401, "Sign in to continue.");
  };
  assert.equal(
    (
      await handleRequest(
        new Request("https://hrms.example.test/api/hrms"),
        anonymous,
      )
    ).status,
    401,
  );
  assert.equal(
    (await handleRequest(request("employee.create", "", employee()), anonymous))
      .status,
    401,
  );
});
test("HTTP API denies cross-tenant reads, writes and exports", async () => {
  const s = await setup();
  const context = async () => s.beta;
  for (const view of ["workspace", "export", "history"]) {
    const res = await handleRequest(
      new Request(
        `https://hrms.example.test/api/hrms?view=${view}&tenant=${s.a}`,
      ),
      context,
    );
    assert.equal(res.status, 404);
  }
  const res = await handleRequest(
    request("employee.create", s.a, employee()),
    context,
  );
  assert.equal(res.status, 404);
});
test("HTTP API handles invalid JSON and origin without invoking mutation", async () => {
  const s = await setup();
  assert.equal(
    (
      await handleRequest(
        request("employee.create", s.a, employee(), "https://evil.test"),
        async () => s.owner,
      )
    ).status,
    403,
  );
  const invalid = new Request("https://hrms.example.test/api/hrms", {
    method: "POST",
    headers: {
      origin: "https://hrms.example.test",
      "content-type": "application/json",
    },
    body: "{broken",
  });
  assert.equal((await handleRequest(invalid, async () => s.owner)).status, 400);
});
test("HTTP API persists a realistic employee and returns no-store responses", async () => {
  const s = await setup();
  const res = await handleRequest(
    request("employee.create", s.a, employee()),
    async () => s.owner,
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const e = await res.json();
  assert.ok(e.id);
  const read = await handleRequest(
    new Request(
      `https://hrms.example.test/api/hrms?view=workspace&tenant=${s.a}`,
    ),
    async () => s.owner,
  );
  const payload = await read.json();
  assert.equal(payload.employees[0].full_name, "Test Employee");
});
test("HTTP write rate limiting is persistent and enforced", async () => {
  const s = await setup();
  s.sql
    .prepare("INSERT INTO rate_limits(key,window,count) VALUES(?,?,?)")
    .run(s.owner.identity.userId, Math.floor(Date.now() / 60000), 60);
  const res = await handleRequest(
    request("employee.create", s.a, employee()),
    async () => s.owner,
  );
  assert.equal(res.status, 429);
  assert.equal(s.sql.prepare("SELECT count(*) c FROM employees").get().c, 0);
});
test("database prevents edits and deletions of audit and candidate decisions", async () => {
  const s = await setup();
  const c = await candidate(s);
  await mutate(s.owner, "candidate.transition", s.a, {
    id: c.id,
    version: 1,
    stage: "screening",
    reason: "",
  });
  assert.throws(
    () => s.sql.exec("UPDATE audit_logs SET action='tampered'"),
    /immutable/,
  );
  assert.throws(() => s.sql.exec("DELETE FROM audit_logs"), /immutable/);
  assert.throws(
    () => s.sql.exec("UPDATE candidate_history SET reason='tampered'"),
    /immutable/,
  );
  assert.throws(() => s.sql.exec("DELETE FROM candidate_history"), /immutable/);
});
test("database rejects cross-tenant candidate decision reference", async () => {
  const s = await setup();
  const c = await candidate(s);
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO candidate_history(id,tenant_id,candidate_id,from_stage,to_stage,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          s.b,
          c.id,
          "applied",
          "screening",
          "",
          "actor",
          new Date().toISOString(),
        ),
    /FOREIGN KEY/,
  );
});

test("candidate intake does not use a pipeline definition changed before commit", async () => {
  const s = await setup();
  const job = await mutate(s.owner, "job.create", s.a, vacancy);
  const batch = s.db.batch;
  let first = true;
  s.db.batch = async (commands) => {
    if (first) {
      first = false;
      s.sql.prepare("UPDATE tenants SET stages=? WHERE id=?").run(
        JSON.stringify(
          defaultStages.map((stage) => ({
            ...stage,
            label: stage.label + " revised",
          })),
        ),
        s.a,
      );
    }
    return batch(commands);
  };
  await fails(
    () =>
      mutate(s.owner, "candidate.create", s.a, {
        fullName: "Concurrent Candidate",
        email: "concurrent@example.test",
        jobId: job.id,
        phone: "+919876543210",
        source: "Direct",
      }),
    409,
  );
  assert.equal(s.sql.prepare("SELECT count(*) c FROM candidates").get().c, 0);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE action='candidate.created'",
      )
      .get().c,
    0,
  );
});
test("pipeline update detects candidates added between validation and commit", async () => {
  const s = await setup();
  const job = await mutate(s.owner, "job.create", s.a, vacancy);
  const batch = s.db.batch;
  let first = true;
  s.db.batch = async (commands) => {
    if (first) {
      first = false;
      s.sql
        .prepare(
          "INSERT INTO candidates(id,tenant_id,job_id,full_name,email,phone,source,stage,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          s.a,
          job.id,
          "Concurrent Candidate",
          "concurrent@example.test",
          "9876543210",
          "Direct",
          "applied",
          new Date().toISOString(),
        );
    }
    return batch(commands);
  };
  await fails(
    () =>
      mutate(s.owner, "pipeline.update", s.a, {
        stages: [
          { id: "screening", label: "Screening", next: ["selected"] },
          { id: "selected", label: "Selected", next: [] },
        ],
      }),
    409,
  );
  assert.equal(
    JSON.parse(
      s.sql.prepare("SELECT stages FROM tenants WHERE id=?").get(s.a).stages,
    )[0].id,
    "applied",
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE action='pipeline.updated'",
      )
      .get().c,
    0,
  );
});
