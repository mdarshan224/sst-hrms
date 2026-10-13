import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { database } from "./d1-adapter.mjs";
import { mutate, readWorkspace } from "../lib/hrms/service.ts";
import {
  readDashboard,
  teamPage,
  ownEmployee,
  profileQueue,
} from "../lib/hrms/employee-portal.ts";
import {
  validateLogo,
  logoResponse,
  publicBrand,
} from "../lib/hrms/branding.ts";
import { handleRequest } from "../lib/hrms/http.ts";
const at = () => new Date().toISOString();
async function setup() {
  const { db, sql } = database();
  const identity = {
    userId: crypto.randomUUID(),
    mobile: "9000000001",
    email: "owner@example.test",
    displayName: "Synthetic Owner",
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
  const u = sql.prepare("SELECT * FROM users WHERE mobile=?").get("9000000002");
  const beta = {
    ...owner,
    identity: {
      userId: u.id,
      mobile: u.mobile,
      email: "beta@example.test",
      displayName: "Synthetic Beta",
    },
  };
  return { db, sql, owner, beta, a, b };
}
const employee = (i) => ({
  fullName: "Synthetic Employee " + i,
  email: `employee${i}@example.test`,
  designation: "Engineer",
  joiningDate: "2026-10-12",
});
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);
async function account(
  s,
  index = 3,
  employeeId,
  tenant = s.a,
  actor = s.owner,
) {
  const mobile = "90000000" + String(index).padStart(2, "0");
  const uid = crypto.randomUUID();
  s.sql
    .prepare(
      "INSERT INTO users(id,mobile,email,display_name,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      uid,
      mobile,
      `account${index}@example.test`,
      "Synthetic Account " + index,
      at(),
      at(),
    );
  const e =
    employeeId ??
    (await mutate(actor, "employee.create", tenant, employee(index))).id;
  const invitation = await mutate(actor, "employee.invite", tenant, {
    id: e,
    mobile,
  });
  const member = {
    ...s.owner,
    identity: {
      userId: uid,
      mobile,
      email: `account${index}@example.test`,
      displayName: "Synthetic Account " + index,
    },
  };
  await mutate(member, "invite.accept", "", { token: invitation.inviteToken });
  return { context: member, employeeId: e, mobile, invitation };
}
async function managerRole(s, context, branchId = null) {
  const r = await mutate(s.owner, "role.create", s.a, {
    name: "Manager " + crypto.randomUUID(),
    permissions: ["team.view"],
    branchId,
  });
  const membership = s.sql
    .prepare("SELECT id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.a, context.identity.userId);
  await mutate(s.owner, "member.role", s.a, {
    id: membership.id,
    roleId: r.id,
  });
}
function png(width = 1, height = 1) {
  function crc(buf) {
    let c = 0xffffffff;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type),
      n = Buffer.alloc(4),
      c = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([n, t, data, c]);
  }
  const h = Buffer.alloc(13);
  h.writeUInt32BE(width);
  h.writeUInt32BE(height, 4);
  h[8] = 8;
  h[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
test("employee activation links only the verified invited mobile and denies replay or directory escalation", async () => {
  const s = await setup();
  const e = (await mutate(s.owner, "employee.create", s.a, employee(1))).id;
  const invitation = await mutate(s.owner, "employee.invite", s.a, {
    id: e,
    mobile: "9000000003",
  });
  await fail(
    () =>
      mutate(s.beta, "invite.accept", "", { token: invitation.inviteToken }),
    403,
  );
  const linked = await account(s, 3, e);
  assert.equal((await ownEmployee(linked.context, s.a)).id, e);
  assert.deepEqual((await readWorkspace(linked.context, s.a)).dashboardModes, [
    "employee",
  ]);
  await fail(() => readDashboard(linked.context, s.a, "admin"), 403);
  await fail(
    () =>
      mutate(linked.context, "employee.edit", s.a, {
        ...employee(1),
        id: e,
        version: 1,
        reason: "Unauthorized edit",
      }),
    403,
  );
  await fail(
    () =>
      mutate(linked.context, "invite.accept", "", {
        token: linked.invitation.inviteToken,
      }),
    403,
  );
});
test("existing member activation preserves administrative role and never binds by email", async () => {
  const s = await setup();
  const e = (await mutate(s.owner, "employee.create", s.a, employee(4))).id;
  const invite = await mutate(s.owner, "employee.invite", s.a, {
    id: e,
    mobile: s.owner.identity.mobile,
  });
  const before = s.sql
    .prepare("SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.a, s.owner.identity.userId).role_id;
  await mutate(s.owner, "invite.accept", "", { token: invite.inviteToken });
  assert.equal((await ownEmployee(s.owner, s.a)).id, e);
  assert.equal(
    s.sql
      .prepare(
        "SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?",
      )
      .get(s.a, s.owner.identity.userId).role_id,
    before,
  );
  assert.ok(
    (await readWorkspace(s.owner, s.a)).dashboardModes.includes("employee"),
  );
});
test("one active account cannot bind two employees; conflicting activation rolls back invitation consumption", async () => {
  const s = await setup();
  const linked = await account(s);
  const second = (await mutate(s.owner, "employee.create", s.a, employee(4)))
    .id;
  const inv = await mutate(s.owner, "employee.invite", s.a, {
    id: second,
    mobile: linked.mobile,
  });
  await assert.rejects(
    () =>
      mutate(linked.context, "invite.accept", "", { token: inv.inviteToken }),
    /UNIQUE/,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT used_at FROM invitations WHERE id=(SELECT invitation_id FROM employee_activations WHERE employee_id=?)",
      )
      .get(second).used_at,
    null,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) total FROM employee_accounts").get().total,
    1,
  );
});
test("revoked and expired activation, suspended tenant, and archived employee fail closed", async () => {
  const s = await setup();
  const linked = await account(s);
  await mutate(s.owner, "employee.archive", s.a, {
    id: linked.employeeId,
    reason: "Employment ended",
  });
  await fail(() => ownEmployee(linked.context, s.a), 403);
  await mutate(s.owner, "employee.restore", s.a, {
    id: linked.employeeId,
    reason: "Employment restored",
  });
  await mutate(s.owner, "tenant.status", "", { id: s.a, status: "suspended" });
  await fail(() => ownEmployee(linked.context, s.a), 403);
  await mutate(s.owner, "tenant.status", "", { id: s.a, status: "active" });
  await mutate(s.owner, "employee.unlink", s.a, {
    id: linked.employeeId,
    reason: "Link revoked by HR",
  });
  await fail(() => ownEmployee(linked.context, s.a), 403);
  const inv = await mutate(s.owner, "employee.invite", s.a, {
    id: linked.employeeId,
    mobile: linked.mobile,
  });
  s.sql.exec("UPDATE invitations SET expires_at='2000-01-01T00:00:00.000Z'");
  await fail(
    () =>
      mutate(linked.context, "invite.accept", "", { token: inv.inviteToken }),
    403,
  );
});
test("unlink and membership revocation block personal and manager access independently", async () => {
  const s = await setup(),
    a = await account(s);
  await managerRole(s, a.context);
  await mutate(s.owner, "employee.unlink", s.a, {
    id: a.employeeId,
    reason: "Wrong mobile link revoked",
  });
  await fail(() => teamPage(a.context, s.a), 403);
  const inv = await mutate(s.owner, "employee.invite", s.a, {
    id: a.employeeId,
    mobile: a.mobile,
  });
  await mutate(a.context, "invite.accept", "", { token: inv.inviteToken });
  const mid = s.sql
    .prepare("SELECT id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.a, a.context.identity.userId).id;
  await mutate(s.owner, "member.revoke", s.a, {
    id: mid,
    reason: "Revoke company membership",
  });
  await fail(() => ownEmployee(a.context, s.a), 404);
});
test("manager API derives the manager from the bound account, returns direct reports only and excludes confidential fields", async () => {
  const s = await setup(),
    manager = await account(s, 3),
    other = await account(s, 4),
    report = await account(s, 5);
  await managerRole(s, manager.context);
  await managerRole(s, other.context);
  await mutate(s.owner, "employee.manager", s.a, {
    id: report.employeeId,
    managerId: manager.employeeId,
    reason: "Reporting assignment",
  });
  const team = await teamPage(manager.context, s.a, {
    managerId: other.employeeId,
  });
  assert.equal(team.total, 1);
  assert.equal(team.rows[0].id, report.employeeId);
  assert.equal(team.rows[0].email, undefined);
  assert.equal(team.rows[0].user_id, undefined);
  assert.equal((await teamPage(other.context, s.a)).total, 0);
  await fail(() => teamPage(manager.context, s.b), 404);
  await fail(() => ownEmployee(s.beta, s.a), 404);
});
test("manager scope intersects branch restrictions and prevents organizational cycles", async () => {
  const s = await setup(),
    manager = await account(s, 3),
    report = await account(s, 4);
  const branch = (
    await mutate(s.owner, "organization.create", s.a, {
      kind: "branches",
      name: "North",
    })
  ).id;
  await managerRole(s, manager.context, branch);
  await mutate(s.owner, "employee.manager", s.a, {
    id: report.employeeId,
    managerId: manager.employeeId,
    reason: "Reporting assignment",
  });
  assert.equal((await teamPage(manager.context, s.a)).total, 0);
  await fail(
    () =>
      mutate(s.owner, "employee.manager", s.a, {
        id: manager.employeeId,
        managerId: report.employeeId,
        reason: "Create forbidden cycle",
      }),
    409,
  );
  await fail(
    () =>
      mutate(s.owner, "employee.manager", s.a, {
        id: report.employeeId,
        managerId: report.employeeId,
        reason: "Self reporting blocked",
      }),
    422,
  );
  const beta = (await mutate(s.beta, "employee.create", s.b, employee(6))).id;
  await fail(
    () =>
      mutate(s.owner, "employee.manager", s.a, {
        id: report.employeeId,
        managerId: beta,
        reason: "Cross-company manager",
      }),
    404,
  );
});
test("employee profile requests use only the linked identity and prevent overlapping pending requests", async () => {
  const s = await setup(),
    a = await account(s, 3);
  await fail(
    () =>
      mutate(a.context, "profile.request", s.b, {
        fullName: "Changed Name",
        email: "new@example.test",
        reason: "Profile correction",
      }),
    404,
  );
  await assert.rejects(() =>
    mutate(a.context, "profile.request", s.a, {
      employeeId: crypto.randomUUID(),
      fullName: "Changed Name",
      email: "new@example.test",
      reason: "Forged employee ID",
    }),
  );
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Changed Name",
    email: "new@example.test",
    reason: "Profile correction",
  });
  assert.equal(
    (await readDashboard(a.context, s.a, "employee")).requests[0].id,
    req.id,
  );
  await assert.rejects(
    () =>
      mutate(a.context, "profile.request", s.a, {
        fullName: "Another Name",
        email: "new2@example.test",
        reason: "Another correction",
      }),
    /UNIQUE/,
  );
  assert.equal(
    s.sql
      .prepare("SELECT full_name FROM employees WHERE id=?")
      .get(a.employeeId).full_name,
    "Synthetic Employee 3",
  );
});
test("HR approval changes exactly one employee, preserves history and requires a different reviewer", async () => {
  const s = await setup(),
    a = await account(s);
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Reviewed Employee",
    email: "reviewed@example.test",
    reason: "Correct profile name",
  });
  await fail(
    () =>
      mutate(s.beta, "profile.review", s.b, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Wrong tenant review",
      }),
    404,
  );
  await mutate(s.owner, "profile.review", s.a, {
    id: req.id,
    version: 1,
    decision: "approved",
    reason: "Verified employee request",
  });
  assert.equal(
    (await ownEmployee(a.context, s.a)).full_name,
    "Reviewed Employee",
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) total FROM employee_history WHERE employee_id=?",
      )
      .get(a.employeeId).total,
    2,
  );
  await fail(
    () =>
      mutate(s.owner, "profile.review", s.a, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Duplicate decision",
      }),
    409,
  );
  const own = (await mutate(s.owner, "employee.create", s.a, employee(8))).id;
  const inv = await mutate(s.owner, "employee.invite", s.a, {
    id: own,
    mobile: s.owner.identity.mobile,
  });
  await mutate(s.owner, "invite.accept", "", { token: inv.inviteToken });
  const ownReq = await mutate(s.owner, "profile.request", s.a, {
    fullName: "My New Name",
    email: "mynew@example.test",
    reason: "Own profile change",
  });
  await fail(
    () =>
      mutate(s.owner, "profile.review", s.a, {
        id: ownReq.id,
        version: 1,
        decision: "approved",
        reason: "Self approval denied",
      }),
    403,
  );
});
test("profile review rejects stale snapshots and permits reasoned rejection", async () => {
  const s = await setup(),
    a = await account(s);
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Changed Profile",
    email: "change@example.test",
    reason: "Correct profile data",
  });
  await mutate(s.owner, "employee.edit", s.a, {
    ...employee(3),
    designation: "Senior Engineer",
    id: a.employeeId,
    version: 1,
    reason: "Concurrent promotion",
  });
  await fail(
    () =>
      mutate(s.owner, "profile.review", s.a, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Stale approval attempt",
      }),
    409,
  );
  await mutate(s.owner, "profile.review", s.a, {
    id: req.id,
    version: 1,
    decision: "rejected",
    reason: "Resubmit with current details",
  });
  assert.equal(
    (await ownEmployee(a.context, s.a)).full_name,
    "Synthetic Employee 3",
  );
  assert.equal((await profileQueue(s.owner, s.a)).length, 0);
});
test("interleaved profile reviews fail without false decisions or audit", async () => {
  const s = await setup(),
    a = await account(s);
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Changed Profile",
    email: "change@example.test",
    reason: "Correct profile data",
  });
  const batch = s.db.batch;
  s.db.batch = async (commands) => {
    s.db.batch = batch;
    s.sql
      .prepare("UPDATE employees SET version=version+1 WHERE id=?")
      .run(a.employeeId);
    return batch(commands);
  };
  await fail(
    () =>
      mutate(s.owner, "profile.review", s.a, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Concurrent version change",
      }),
    409,
  );
  assert.equal(
    s.sql.prepare("SELECT status FROM profile_requests WHERE id=?").get(req.id)
      .status,
    "pending",
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) total FROM audit_logs WHERE action='profile.approved'",
      )
      .get().total,
    0,
  );
});
test("logo validation rejects non-PNG, checksum corruption, oversized dimensions and payloads", () => {
  assert.ok(validateLogo(png()).length > 0);
  assert.throws(
    () => validateLogo(Buffer.from("<svg onload=alert(1)>").toString("base64")),
    (e) => e.status === 422,
  );
  const bytes = Buffer.from(png(), "base64");
  bytes[50] ^= 1;
  assert.throws(
    () => validateLogo(bytes.toString("base64")),
    (e) => e.status === 422,
  );
  assert.throws(
    () => validateLogo(png(513, 1)),
    (e) => e.status === 422,
  );
  assert.throws(
    () => validateLogo("A".repeat(48001)),
    (e) => e.status === 422,
  );
});
test("tenant branding persists independently with validated logo, reset and locale/currency", async () => {
  const s = await setup(),
    data = {
      name: "Alpha Branded",
      brandColor: "#176B50",
      accentColor: "#D9A441",
      employeePrefix: "ALP",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      currency: "INR",
      logoData: png(),
    };
  await mutate(s.owner, "branding.update", s.a, data);
  const b = await publicBrand(s.db, "alpha-synthetic");
  assert.ok(b.logo_url.startsWith("/api/branding?company=alpha-synthetic"));
  assert.equal((await publicBrand(s.db, "beta-synthetic")).logo_url, null);
  const image = await logoResponse(s.db, "alpha-synthetic");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("Content-Type"), "image/png");
  await fail(() => mutate(s.beta, "branding.update", s.a, data), 404);
  await mutate(s.owner, "branding.update", s.a, { ...data, logoData: null });
  assert.equal((await logoResponse(s.db, "alpha-synthetic")).status, 404);
});
test("API dashboard and employee-picker views deny unauthorized modes and cross-tenant reads", async () => {
  const s = await setup(),
    a = await account(s);
  const req = (view, tenant = s.a) =>
    new Request(
      `https://hrms.example.test/api/hrms?view=${view}&tenant=${tenant}&mode=manager`,
    );
  assert.equal(
    (await handleRequest(req("dashboard"), async () => a.context)).status,
    403,
  );
  assert.equal(
    (await handleRequest(req("employee_picker"), async () => a.context)).status,
    403,
  );
  assert.equal(
    (await handleRequest(req("team", s.b), async () => a.context)).status,
    404,
  );
  const response = await handleRequest(
    req("employee_picker"),
    async () => s.owner,
  );
  assert.equal(response.status, 200);
  const row = (await response.json()).rows[0];
  assert.deepEqual(Object.keys(row).sort(), [
    "employee_code",
    "full_name",
    "id",
  ]);
});
test("database rejects cross-tenant employee-user and reporting-manager associations", async () => {
  const s = await setup(),
    a = await account(s),
    b = await account(s, 4, null, s.b, s.beta);
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO employee_reporting(employee_id,tenant_id,manager_id,updated_at) VALUES(?,?,?,?)",
        )
        .run(a.employeeId, s.a, b.employeeId, at()),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      s.sql
        .prepare("UPDATE employee_accounts SET user_id=? WHERE employee_id=?")
        .run(b.context.identity.userId, a.employeeId),
    /FOREIGN KEY/,
  );
});

test("pending requests cannot be approved after account unlinking and final decisions are immutable", async () => {
  const s = await setup(),
    a = await account(s);
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Changed Profile",
    email: "new@example.test",
    reason: "Profile correction",
  });
  await mutate(s.owner, "employee.unlink", s.a, {
    id: a.employeeId,
    reason: "Verified account revoked",
  });
  await fail(
    () =>
      mutate(s.owner, "profile.review", s.a, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Invalid old account request",
      }),
    409,
  );
  await mutate(s.owner, "profile.review", s.a, {
    id: req.id,
    version: 1,
    decision: "rejected",
    reason: "Account association ended",
  });
  assert.throws(
    () => s.sql.exec("UPDATE profile_requests SET review_reason='tampered'"),
    /immutable/,
  );
  assert.throws(() => s.sql.exec("DELETE FROM profile_requests"), /immutable/);
});
test("activation foreign-invitation tenant mismatch is rejected by the database", async () => {
  const s = await setup();
  const e = (await mutate(s.owner, "employee.create", s.a, employee(1))).id;
  const foreignRole = s.sql
    .prepare("SELECT id FROM roles WHERE tenant_id=? AND name='Employee'")
    .get(s.b).id;
  const inv = await mutate(s.beta, "member.invite", s.b, {
    mobile: "9000000009",
    roleId: foreignRole,
  });
  const invitation = s.sql
    .prepare("SELECT id FROM invitations WHERE tenant_id=?")
    .get(s.b).id;
  assert.ok(inv.inviteToken);
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO employee_activations(invitation_id,tenant_id,employee_id,created_at) VALUES(?,?,?,?)",
        )
        .run(invitation, s.a, e, at()),
    /tenant mismatch/,
  );
});
test("brand validation rejects unreadable primary colours without changing the existing brand", async () => {
  const s = await setup();
  await fail(
    () =>
      mutate(s.owner, "branding.update", s.a, {
        name: "Alpha Synthetic",
        brandColor: "#ffffff",
        employeePrefix: "EMP",
        timezone: "Asia/Kolkata",
      }),
    422,
  );
  assert.equal(
    s.sql.prepare("SELECT brand_color FROM tenants WHERE id=?").get(s.a)
      .brand_color,
    "#176B50",
  );
});

test("employee activation detects tenant suspension between validation and commit without creating a binding", async () => {
  const s = await setup();
  const e = (await mutate(s.owner, "employee.create", s.a, employee(7))).id;
  const inv = await mutate(s.owner, "employee.invite", s.a, {
    id: e,
    mobile: s.owner.identity.mobile,
  });
  const batch = s.db.batch;
  s.db.batch = async (commands) => {
    s.db.batch = batch;
    s.sql.prepare("UPDATE tenants SET status='suspended' WHERE id=?").run(s.a);
    return batch(commands);
  };
  await fail(
    () => mutate(s.owner, "invite.accept", "", { token: inv.inviteToken }),
    409,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) total FROM employee_accounts").get().total,
    0,
  );
});
test("profile submission detects account revocation before commit without an audit or pending request", async () => {
  const s = await setup(),
    a = await account(s);
  const batch = s.db.batch;
  s.db.batch = async (commands) => {
    s.db.batch = batch;
    s.sql
      .prepare("UPDATE employee_accounts SET revoked_at=? WHERE employee_id=?")
      .run(at(), a.employeeId);
    return batch(commands);
  };
  await fail(
    () =>
      mutate(a.context, "profile.request", s.a, {
        fullName: "Changed Name",
        email: "change@example.test",
        reason: "A profile correction",
      }),
    409,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) total FROM profile_requests").get().total,
    0,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) total FROM audit_logs WHERE action='profile.change_requested'",
      )
      .get().total,
    0,
  );
});

test("HR request queues and decisions respect branch scope", async () => {
  const s = await setup(),
    a = await account(s, 3),
    hr = await account(s, 4);
  const branch = (
    await mutate(s.owner, "organization.create", s.a, {
      kind: "branches",
      name: "HR scope",
    })
  ).id;
  const role = await mutate(s.owner, "role.create", s.a, {
    name: "Scoped HR",
    permissions: ["employee.view", "employee.edit"],
    branchId: branch,
  });
  const m = s.sql
    .prepare("SELECT id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.a, hr.context.identity.userId).id;
  await mutate(s.owner, "member.role", s.a, { id: m, roleId: role.id });
  const req = await mutate(a.context, "profile.request", s.a, {
    fullName: "Changed Name",
    email: "changed@example.test",
    reason: "Profile correction",
  });
  assert.equal((await profileQueue(hr.context, s.a)).length, 0);
  await fail(
    () =>
      mutate(hr.context, "profile.review", s.a, {
        id: req.id,
        version: 1,
        decision: "approved",
        reason: "Outside HR branch",
      }),
    404,
  );
});
