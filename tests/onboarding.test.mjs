import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./verification-fixture.mjs";
import { mutate } from "../lib/hrms/service.ts";
import {
  onboardingAction,
  onboardingRead,
  claimOnboarding,
  DEFAULT_TEMPLATE,
} from "../lib/hrms/onboarding.ts";
import { verificationAction } from "../lib/hrms/verification.ts";
import { seal, unseal } from "../lib/hrms/private-config.ts";
import { runDueJobs } from "../lib/hrms/workflow-jobs.ts";
const key = { dataKey: "12".repeat(32) },
  at = () => new Date().toISOString();
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);
async function flow() {
  const s = await setup(),
    role = s.sql
      .prepare(
        "SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?",
      )
      .get(s.tid, s.c.identity.userId).role_id;
  s.sql
    .prepare(
      "UPDATE plans SET modules=json_insert(modules,'$[#]','onboarding')",
    )
    .run();
  await verificationAction(s.c, s.config, "privacy.grant", s.tid, {
    roleId: role,
    canView: true,
    canReview: true,
    canViewDocuments: true,
    canReviewDocuments: true,
    canManageOnboarding: true,
    canApproveOnboarding: true,
  });
  const template = await onboardingAction(s.c, key, "template.save", s.tid, {
    name: "Synthetic joining",
    definition: DEFAULT_TEMPLATE,
  });
  const emp = await mutate(s.c, "employee.create", s.tid, {
    fullName: "John Doe",
    email: "joiner@example.test",
    designation: "Engineer",
    joiningDate: "2026-10-12",
  });
  const created = await onboardingAction(s.c, key, "case.create", s.tid, {
    templateId: template.id,
    employeeId: emp.id,
    mobile: "9000000009",
  });
  const uid = crypto.randomUUID(),
    sid = crypto.randomUUID();
  s.sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,verified_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(uid, "9000000009", "John Doe", at(), at());
  s.sql
    .prepare(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      sid,
      uid,
      "joiner",
      new Date(Date.now() + 3600000).toISOString(),
      at(),
    );
  const user = {
    ...s.c,
    identity: { userId: uid, mobile: "9000000009", displayName: "John Doe" },
    sessionId: sid,
  };
  return {
    ...s,
    key,
    created,
    template,
    emp,
    user,
    token: new URL(created.inviteUrl).pathname.split("/").pop(),
  };
}
const values = {
  address: "Synthetic test address",
  emergency_name: "Synthetic contact",
  emergency_phone: "9000000010",
  education: "Test course",
  previous_employment: "Test experience",
};
async function read(s) {
  return onboardingRead(s.user, key, "case", s.tid, {
    id: s.created.id,
    owner: "1",
  });
}
test("encrypted submissions bind exact tenant/case and fail closed without secrets", async () => {
  const cipher = await seal(key, values, "tenant-a:case-a");
  assert(!cipher.includes("Synthetic"));
  assert.deepEqual(await unseal(key, cipher, "tenant-a:case-a"), values);
  await fail(() => unseal(key, cipher, "tenant-b:case-a"), 503);
  await fail(() => seal({}, values, "x"), 503);
});
test("invitation binds verified mobile and company; rotation, expiry and revocation block access", async () => {
  const s = await flow();
  await fail(() => claimOnboarding(s.c, s.token), 404);
  await fail(
    () => claimOnboarding({ ...s.user, boundTenantId: s.other }, s.token),
    404,
  );
  const rotate = await onboardingAction(s.c, key, "case.rotate", s.tid, {
    id: s.created.id,
  });
  await fail(() => claimOnboarding(s.user, s.token), 404);
  const token = new URL(rotate.inviteUrl).pathname.split("/").pop();
  await claimOnboarding(s.user, token);
  await claimOnboarding(s.user, token);
  assert.equal(
    s.sql
      .prepare("SELECT count(*) n FROM employee_accounts WHERE employee_id=?")
      .get(s.emp.id).n,
    0,
  );
  await fail(
    () =>
      mutate(s.c, "employee.restore", s.tid, {
        id: s.emp.id,
        version: 2,
        reason: "Test bypass attempt",
      }),
    409,
  );
  s.sql
    .prepare(
      "UPDATE invitations SET expires_at=? WHERE id=(SELECT invitation_id FROM onboarding_cases WHERE id=?)",
    )
    .run("2020-01-01T00:00:00.000Z", s.created.id);
  await fail(() => read(s), 410);
  await onboardingAction(s.c, key, "case.revoke", s.tid, {
    id: s.created.id,
    reason: "Synthetic revoked invitation",
  });
  await fail(() => claimOnboarding(s.user, token), 410);
});
test("consented onboarding gates PAN, checklist and independent HR activation; retry cannot duplicate employees", async () => {
  const s = await flow();
  await claimOnboarding(s.user, s.token);
  let r = await read(s);
  await fail(
    () =>
      onboardingAction(s.user, key, "case.submit", s.tid, {
        id: s.created.id,
        version: r.case.version,
        data: values,
        consent: false,
      }),
    422,
  );
  await onboardingAction(s.user, key, "case.submit", s.tid, {
    id: s.created.id,
    version: r.case.version,
    data: values,
    consent: true,
  });
  r = await read(s);
  assert(
    !s.sql
      .prepare("SELECT form_ciphertext FROM onboarding_cases")
      .get()
      .form_ciphertext.includes(values.address),
  );
  const approve = () =>
    onboardingAction(s.c, key, "case.review", s.tid, {
      id: s.created.id,
      version: r.case.version,
      decision: "approved",
      reason: "Independent HR review completed",
    });
  await fail(approve, 409);
  await onboardingAction(s.c, key, "case.review", s.tid, {
    id: s.created.id,
    version: r.case.version,
    decision: "correction_required",
    reason: "Complete identity and joining checklist",
  });
  await verificationAction(s.user, s.config, "pan.start", s.tid, {
    ...s.input,
    caseId: s.created.id,
  });
  const check = s.sql
    .prepare("SELECT * FROM employee_verification_checks WHERE employee_id=?")
    .get(s.emp.id);
  assert.equal(check.status, "verified");
  assert.equal(check.user_id, s.user.identity.userId);
  await verificationAction(s.c, s.config, "review", s.tid, {
    id: check.id,
    decision: "approved",
    reason: "Independent verified identity review",
  });
  await onboardingAction(s.user, key, "task.complete", s.tid, {
    id: s.created.id,
    taskKey: "policy_ack",
  });
  r = await read(s);
  await onboardingAction(s.user, key, "case.submit", s.tid, {
    id: s.created.id,
    version: r.case.version,
    data: values,
    consent: true,
  });
  r = await read(s);
  await approve();
  assert.equal(
    s.sql.prepare("SELECT status FROM employees WHERE id=?").get(s.emp.id)
      .status,
    "active",
  );
  assert.equal(
    s.sql
      .prepare("SELECT user_id FROM employee_accounts WHERE employee_id=?")
      .get(s.emp.id).user_id,
    s.user.identity.userId,
  );
  assert.equal((await approve()).replayed, true);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM employees WHERE email='joiner@example.test'",
      )
      .get().n,
    1,
  );
  await runDueJobs(s.db, { cashfree: s.config }, 10, s.tid);
  assert(
    s.sql
      .prepare("SELECT count(*) n FROM inapp_notifications WHERE user_id=?")
      .get(s.user.identity.userId).n > 0,
  );
  s.sql
    .prepare(
      "UPDATE invitations SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=(SELECT invitation_id FROM onboarding_cases WHERE id=?)",
    )
    .run(s.created.id);
  assert.equal((await read(s)).case.status, "approved");
});
test("cross-company reads and replayed form versions do not disclose or overwrite submissions", async () => {
  const s = await flow();
  await claimOnboarding(s.user, s.token);
  const r = await read(s),
    data = {
      id: s.created.id,
      version: r.case.version,
      data: values,
      consent: true,
    };
  await onboardingAction(s.user, key, "case.save", s.tid, data);
  await fail(
    () => onboardingAction(s.user, key, "case.save", s.tid, data),
    409,
  );
  await fail(
    () => onboardingRead(s.c, key, "case", s.other, { id: s.created.id }),
    403,
  );
  await fail(
    () =>
      onboardingRead(
        { ...s.user, boundTenantId: s.other },
        key,
        "case",
        s.tid,
        { id: s.created.id, owner: "1" },
      ),
    404,
  );
  assert.throws(
    () =>
      s.sql
        .prepare(
          "UPDATE onboarding_cases SET status='approved',reviewer_id=? WHERE id=?",
        )
        .run(s.c.identity.userId, s.created.id),
    /submission required|joining checklist incomplete|mandatory verification incomplete/,
  );
});
test("template updates are versioned and cannot overwrite frozen case requirements", async () => {
  const s = await flow(),
    definition = {
      ...DEFAULT_TEMPLATE,
      privacyNotice:
        DEFAULT_TEMPLATE.privacyNotice + " New operator-approved text.",
    };
  await onboardingAction(s.c, key, "template.save", s.tid, {
    id: s.template.id,
    name: "Revised joining",
    definition,
    version: 1,
  });
  assert.equal(
    s.sql
      .prepare("SELECT version FROM onboarding_templates WHERE id=?")
      .get(s.template.id).version,
    2,
  );
  assert.equal(
    JSON.parse(
      s.sql
        .prepare("SELECT template_snapshot FROM onboarding_cases WHERE id=?")
        .get(s.created.id).template_snapshot,
    ).privacyNotice,
    DEFAULT_TEMPLATE.privacyNotice,
  );
  await fail(
    () =>
      onboardingAction(s.c, key, "template.save", s.tid, {
        id: s.template.id,
        name: "Stale update",
        definition,
        version: 1,
      }),
    409,
  );
});
test("uncertain PAN Lite operation remains unverified and cannot be retried without independent provider-support confirmation", async () => {
  const s = await flow();
  await claimOnboarding(s.user, s.token);
  let calls = 0;
  const config = {
    ...s.config,
    fetcher: async () => {
      calls++;
      throw new Error("timeout");
    },
  };
  const request = { ...s.input, caseId: s.created.id };
  await fail(
    () => verificationAction(s.user, config, "pan.start", s.tid, request),
    503,
  );
  const check = s.sql
    .prepare("SELECT * FROM employee_verification_checks WHERE employee_id=?")
    .get(s.emp.id);
  assert.equal(check.status, "needs_reconciliation");
  await fail(
    () =>
      verificationAction(s.user, config, "pan.start", s.tid, {
        ...request,
        requestId: crypto.randomUUID(),
      }),
    409,
  );
  assert.equal(calls, 1);
  const decision = {
    id: check.id,
    outcome: "cancelled_without_verification",
    reason: "Provider support inspected original reference",
    supportReference: "TEST-123",
  };
  await fail(
    () => verificationAction(s.c, config, "reconcile.manual", s.tid, decision),
    422,
  );
  await verificationAction(s.c, config, "reconcile.manual", s.tid, {
    ...decision,
    confirmedNotProcessed: true,
  });
  assert.equal(
    s.sql
      .prepare("SELECT status FROM employee_verification_checks WHERE id=?")
      .get(check.id).status,
    "cancelled",
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM verification_reconciliations WHERE check_id=?",
      )
      .get(check.id).n,
    1,
  );
  assert.equal(calls, 1);
});
test("reissuing a closed case preserves its employee, recipient and history; stale token stays revoked",async()=>{
 const s=await flow();await claimOnboarding(s.user,s.token);
 await onboardingAction(s.c,key,"case.revoke",s.tid,{id:s.created.id,reason:"Synthetic link revoked"});
 const r=await onboardingAction(s.c,key,"case.reissue",s.tid,{id:s.created.id,reason:"Same recipient invited to correct submission"});
 await fail(()=>claimOnboarding(s.user,s.token),404);
 await claimOnboarding(s.user,new URL(r.inviteUrl).pathname.split("/").pop());
 assert.equal((await read(s)).case.status,"correction_required");
 assert.equal(s.sql.prepare("SELECT employee_id,user_id FROM onboarding_cases WHERE id=?").get(s.created.id).employee_id,s.emp.id);
 assert.equal(s.sql.prepare("SELECT count(*) n FROM employees WHERE id=?").get(s.emp.id).n,1);
});
