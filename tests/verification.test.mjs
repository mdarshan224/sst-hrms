import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setup } from "./verification-fixture.mjs";
import {
  verificationRead,
  verificationAction,
  receiveSecureIdWebhook,
  CONSENT_VERSION,
} from "../lib/hrms/verification.ts";
const at = () => new Date().toISOString();
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);

test("consent, persistent minimal fields, and retry idempotency prevent duplicate provider calls", async () => {
  const s = await setup();
  await assert.rejects(() =>
    verificationAction(s.c, s.config, "pan.start", s.tid, {
      ...s.input,
      consent: false,
    }),
  );
  assert.equal(s.calls(), 0);
  const r = await verificationAction(
    s.c,
    s.config,
    "pan.start",
    s.tid,
    s.input,
  );
  assert.equal(r.status, "verified");
  const retry = await verificationAction(
    s.c,
    s.config,
    "pan.start",
    s.tid,
    s.input,
  );
  assert.equal(retry.replayed, true);
  assert.equal(s.calls(), 1);
  await fail(
    () =>
      verificationAction(s.c, s.config, "pan.start", s.tid, {
        ...s.input,
        pan: "XYZPP4321W",
      }),
    409,
  );
  const row = s.sql.prepare("SELECT * FROM employee_verification_checks").get();
  assert.equal(row.masked_identifier, "******234D");
  assert.equal(row.consent_version, CONSENT_VERSION);
  assert.equal(row.review_status, "pending");
  assert.equal(JSON.stringify(row).includes("ABCPV1234D"), false);
  assert.equal(JSON.stringify(row).includes("1993-06-30"), false);
});
test("uncertain provider outcome is recorded and blocks blind retry/new in-flight requests", async () => {
  let calls = 0;
  const s = await setup(async () => {
    calls++;
    throw new Error("timeout");
  });
  await fail(
    () => verificationAction(s.c, s.config, "pan.start", s.tid, s.input),
    503,
  );
  const r = await verificationAction(
    s.c,
    s.config,
    "pan.start",
    s.tid,
    s.input,
  );
  assert.equal(r.status, "needs_reconciliation");
  await assert.rejects(() =>
    verificationAction(s.c, s.config, "pan.start", s.tid, {
      ...s.input,
      requestId: crypto.randomUUID(),
    }),
  );
  assert.equal(calls, 1);
});
test("company owner and platform support do not implicitly receive verification reads; explicit grants are scoped", async () => {
  const s = await setup();
  await fail(() => verificationRead(s.c, s.config, "queue", s.tid), 403);
  const role = s.sql
    .prepare("SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.tid, s.c.identity.userId).role_id;
  await verificationAction(s.c, s.config, "privacy.grant", s.tid, {
    roleId: role,
    canView: true,
    canReview: true,
  });
  assert.deepEqual(
    (await verificationRead(s.c, s.config, "queue", s.tid)).rows,
    [],
  );
  await fail(
    () =>
      verificationAction(s.c, s.config, "privacy.grant", s.other, {
        roleId: role,
        canView: true,
        canReview: true,
      }),
    404,
  );
  await fail(
    () =>
      verificationRead(
        { ...s.c, boundTenantId: s.other },
        s.config,
        "self",
        s.tid,
      ),
    404,
  );
  await fail(() => verificationRead(s.c, s.config, "self", s.other), 403);
});
test("provider verified check still requires independent HR review; self review is forbidden", async () => {
  const s = await setup();
  const result = await verificationAction(
    s.c,
    s.config,
    "pan.start",
    s.tid,
    s.input,
  );
  const role = s.sql
    .prepare("SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.tid, s.c.identity.userId).role_id;
  await verificationAction(s.c, s.config, "privacy.grant", s.tid, {
    roleId: role,
    canView: true,
    canReview: true,
  });
  await fail(
    () =>
      verificationAction(s.c, s.config, "review", s.tid, {
        id: result.id,
        decision: "approved",
        reason: "Synthetic review",
      }),
    403,
  );
  assert.equal(
    s.sql
      .prepare("SELECT review_status FROM employee_verification_checks")
      .get().review_status,
    "pending",
  );
});
test("policy version conflict, disabled service and unapproved production do not call provider", async () => {
  const s = await setup();
  await fail(
    () =>
      verificationAction(s.c, s.config, "policy.save", s.tid, {
        enabled: true,
        panRequired: true,
        hrReviewRequired: true,
        retentionDays: 90,
        version: 0,
      }),
    409,
  );
  await fail(
    () =>
      verificationAction(s.c, s.config, "platform.save", "", {
        enabled: true,
        mode: "production",
        panEnabled: true,
        version: 1,
      }),
    503,
  );
  s.sql.prepare("UPDATE secure_id_platform SET enabled=0").run();
  await fail(
    () => verificationAction(s.c, s.config, "pan.start", s.tid, s.input),
    503,
  );
  assert.equal(s.calls(), 0);
});
test("signed duplicate webhooks store hashes only and cannot alter synchronous verification state", async () => {
  const s = await setup();
  const raw = Buffer.from('{"event":"synthetic"}'),
    ts = String(Date.now()),
    sig = createHmac("sha256", "synthetic-secret")
      .update(ts)
      .update(raw)
      .digest("base64");
  const first = await receiveSecureIdWebhook(
    s.c,
    s.config,
    "sandbox",
    raw,
    ts,
    sig,
  );
  assert.equal(first.applied, false);
  assert.equal(first.duplicate, false);
  assert.equal(
    (await receiveSecureIdWebhook(s.c, s.config, "sandbox", raw, ts, sig))
      .duplicate,
    true,
  );
  await fail(
    () => receiveSecureIdWebhook(s.c, s.config, "sandbox", raw, ts, "bad"),
    403,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) n FROM secure_id_webhook_receipts").get().n,
    1,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) n FROM employee_verification_checks").get()
      .n,
    0,
  );
});
test("migrations enforce employee/company association and privacy grant role/company association", async () => {
  const s = await setup();
  assert.throws(
    () =>
      s.sql
        .prepare(
          "INSERT INTO verification_role_grants(role_id,tenant_id,updated_at) VALUES(?,?,?)",
        )
        .run(
          s.sql
            .prepare("SELECT id FROM roles WHERE tenant_id=? LIMIT 1")
            .get(s.tid).id,
          s.other,
          at(),
        ),
    /FOREIGN KEY/,
  );
  assert.deepEqual(s.sql.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    s.sql.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
});
test("an explicitly authorized independent HR reviewer can approve once; company mismatch remains forbidden", async () => {
  const s = await setup(),
    uid = crypto.randomUUID(),
    rid = crypto.randomUUID(),
    time = new Date().toISOString();
  s.sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,created_at) VALUES(?,?,?,?)",
    )
    .run(uid, "9000000003", "Synthetic Reviewer", time);
  s.sql
    .prepare(
      "INSERT INTO roles(id,tenant_id,name,permissions,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      rid,
      s.tid,
      "Synthetic Verification Reviewer",
      '["employee.view"]',
      time,
    );
  s.sql
    .prepare(
      "INSERT INTO memberships(id,tenant_id,user_id,email,role_id,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(crypto.randomUUID(), s.tid, uid, "reviewer@example.test", rid, time);
  await verificationAction(s.c, s.config, "privacy.grant", s.tid, {
    roleId: rid,
    canView: true,
    canReview: true,
  });
  const hr = {
      ...s.c,
      identity: { ...s.c.identity, userId: uid, mobile: "9000000003" },
    },
    r = await verificationAction(s.c, s.config, "pan.start", s.tid, s.input);
  await fail(
    () =>
      verificationAction(hr, s.config, "review", s.other, {
        id: r.id,
        decision: "approved",
        reason: "Synthetic independent review",
      }),
    404,
  );
  await verificationAction(hr, s.config, "review", s.tid, {
    id: r.id,
    decision: "approved",
    reason: "Synthetic independent review",
  });
  await fail(
    () =>
      verificationAction(hr, s.config, "review", s.tid, {
        id: r.id,
        decision: "approved",
        reason: "Duplicate review",
      }),
    409,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT review_status,reviewer_id FROM employee_verification_checks WHERE id=?",
      )
      .get(r.id).reviewer_id,
    uid,
  );
});
test("module entitlements are checked on verification and private-document paths, not only navigation", async () => {
  const s = await setup();
  s.sql.prepare("UPDATE plans SET modules=?").run('["core","recruitment"]');
  await fail(() => verificationRead(s.c, s.config, "self", s.tid), 403);
  await fail(
    () => verificationAction(s.c, s.config, "pan.start", s.tid, s.input),
    403,
  );
  const { documentList } = await import("../lib/hrms/documents.ts");
  await fail(() => documentList(s.c, s.tid), 403);
  assert.equal(s.calls(), 0);
});
