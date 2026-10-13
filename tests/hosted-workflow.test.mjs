import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setup } from "./verification-fixture.mjs";
import {
  verificationAction,
  receiveSecureIdWebhook,
} from "../lib/hrms/verification.ts";
import { hostedStart, hostedAuthorization } from "../lib/hrms/hosted-flow.ts";
import {
  startHostedConsent,
  inquireHostedConsent,
} from "../lib/hrms/hosted-verification.ts";
import { runDueJobs } from "../lib/hrms/workflow-jobs.ts";
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status),
  key = { dataKey: "34".repeat(32) };
async function fixture(fetcher) {
  const s = await setup(),
    config = { ...s.config, sandboxProducts: ["digilocker"], fetcher };
  await verificationAction(s.c, config, "platform.save", "", {
    enabled: true,
    mode: "sandbox",
    panEnabled: true,
    digilockerEnabled: true,
    version: 1,
  });
  await verificationAction(s.c, config, "policy.save", s.tid, {
    enabled: true,
    panRequired: true,
    digilockerEnabled: true,
    hrReviewRequired: true,
    retentionDays: 90,
    version: 1,
  });
  return { ...s, config };
}
const response = (id, status = "AUTHENTICATED") => ({
  verification_id: id,
  reference_id: 500,
  status,
  document_requested: ["PAN"],
  document_consent: ["PAN"],
  document_consent_validity: new Date(Date.now() + 86400000).toISOString(),
  user_details: { aadhaar: "DO NOT RETAIN", name: "DO NOT RETAIN" },
});
test("documented consent POST and status GET use exact endpoints; AUTHENTICATED never becomes verified identity", async () => {
  const seen = [],
    id = "dgl_" + crypto.randomUUID().replaceAll("-", "");
  const config = {
    sandbox: { clientId: "synthetic", clientSecret: "synthetic" },
    production: {},
    sandboxProducts: ["digilocker"],
    fetcher: async (url, o) => {
      seen.push([String(url), o]);
      return Response.json(
        o.method === "POST"
          ? {
              ...response(id, "PENDING"),
              url: "https://verification-test.cashfree.com/dgl/synthetic",
              redirect_url: "https://hrms.sohansoft.in/verification/return",
            }
          : response(id),
      );
    },
  };
  const started = await startHostedConsent(
    config,
    "sandbox",
    id,
    "https://hrms.sohansoft.in/verification/return",
  );
  assert.equal(started.status, "pending");
  const result = await inquireHostedConsent(config, "sandbox", id, "500");
  assert.equal(result.status, "consent_received");
  assert.equal(result.identityVerified, false);
  assert.equal(
    seen[0][0],
    "https://sandbox.cashfree.com/verification/digilocker",
  );
  assert.deepEqual(JSON.parse(seen[0][1].body).document_requested, ["PAN"]);
  assert.equal(seen[1][1].method, "GET");
  assert.equal(new URL(seen[1][0]).searchParams.get("verification_id"), id);
  assert(!JSON.stringify(result).includes("DO NOT RETAIN"));
  await fail(() => inquireHostedConsent(config, "sandbox", id, "999"), 502);
  await fail(
    () =>
      startHostedConsent(
        { ...config, sandboxProducts: [] },
        "sandbox",
        id,
        "https://hrms.sohansoft.in",
      ),
    503,
  );
});
test("signed webhook only queues correlated authoritative GET; duplicates and mismatched references cannot verify anyone", async () => {
  let fid,
    gets = 0,
    posts = 0;
  const s = await fixture(async (url, o) => {
    if (o.method === "POST") {
      posts++;
      fid = JSON.parse(o.body).verification_id;
      return Response.json({
        ...response(fid, "PENDING"),
        url: "https://verification-test.cashfree.com/dgl/test",
        redirect_url: JSON.parse(o.body).redirect_url,
      });
    }
    gets++;
    return Response.json(
      response(new URL(url).searchParams.get("verification_id")),
    );
  });
  const input = { requestId: crypto.randomUUID(), consent: true },
    started = await hostedStart(s.c, key, s.config, s.tid, input);
  assert.equal(posts, 1);
  await hostedStart(s.c, key, s.config, s.tid, input);
  assert.equal(posts, 1);
  await fail(
    () =>
      hostedAuthorization(
        { ...s.c, boundTenantId: s.other },
        key,
        s.tid,
        started.id,
      ),
    404,
  );
  const signed = (ref = 500) => {
    const raw = Buffer.from(
        JSON.stringify({
          verification_id: fid,
          reference_id: ref,
          status: "VERIFIED",
          secret_data: "SENSITIVE_MARKER_NEVER_STORE",
        }),
      ),
      ts = String(Date.now());
    return {
      raw,
      ts,
      sig: createHmac("sha256", s.config.sandbox.clientSecret)
        .update(ts)
        .update(raw)
        .digest("base64"),
    };
  };
  const v = signed();
  await fail(
    () =>
      receiveSecureIdWebhook(s.c, s.config, "sandbox", v.raw, v.ts, "forged"),
    403,
  );
  assert.equal(
    (await receiveSecureIdWebhook(s.c, s.config, "sandbox", v.raw, v.ts, v.sig))
      .queued,
    true,
  );
  assert.equal(
    (await receiveSecureIdWebhook(s.c, s.config, "sandbox", v.raw, v.ts, v.sig))
      .duplicate,
    true,
  );
  const bad = signed(999);
  assert.equal(
    (
      await receiveSecureIdWebhook(
        s.c,
        s.config,
        "sandbox",
        bad.raw,
        bad.ts,
        bad.sig,
      )
    ).queued,
    false,
  );
  assert.equal(
    s.sql.prepare("SELECT status FROM hosted_verification_flows").get().status,
    "pending",
  );
  await runDueJobs(s.db, { cashfree: s.config }, 3);
  assert.equal(gets, 1);
  assert.equal(
    s.sql.prepare("SELECT status FROM hosted_verification_flows").get().status,
    "consent_received",
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM employee_verification_checks WHERE status='verified'",
      )
      .get().n,
    0,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT processing_status FROM secure_id_webhook_receipts WHERE check_id IS NOT NULL",
      )
      .get().processing_status,
    "processed",
  );
  assert(
    !JSON.stringify(
      s.sql.prepare("SELECT * FROM secure_id_webhook_receipts").all(),
    ).includes("SENSITIVE_MARKER_NEVER_STORE"),
  );
});
test("transport interruption preserves one original hosted request and reconciles GET only", async () => {
  let posts = 0,
    gets = 0;
  const s = await fixture(async (url, o) => {
    if (o.method === "POST") {
      posts++;
      throw new Error("timeout");
    }
    gets++;
    return Response.json(
      response(new URL(url).searchParams.get("verification_id"), "EXPIRED"),
    );
  });
  const input = { requestId: crypto.randomUUID(), consent: true };
  await fail(() => hostedStart(s.c, key, s.config, s.tid, input), 503);
  await hostedStart(s.c, key, s.config, s.tid, input);
  assert.equal(posts, 1);
  await runDueJobs(s.db, { cashfree: s.config }, 3);
  assert.equal(gets, 1);
  assert.equal(
    s.sql.prepare("SELECT status FROM hosted_verification_flows").get().status,
    "expired",
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) n FROM hosted_verification_flows").get().n,
    1,
  );
});
test("unknown or malformed provider states stay unresolved, with bounded durable backoff", async () => {
  const s = await fixture(async (url, o) =>
    o.method === "POST"
      ? (() => {
          throw new Error("timeout");
        })()
      : Response.json({ status: "bogus" }),
  );
  await fail(
    () =>
      hostedStart(s.c, key, s.config, s.tid, {
        requestId: crypto.randomUUID(),
        consent: true,
      }),
    503,
  );
  await runDueJobs(s.db, { cashfree: s.config }, 1);
  const job = s.sql.prepare("SELECT * FROM workflow_jobs").get();
  assert.equal(job.attempts, 1);
  assert.equal(job.status, "retry");
  assert(job.available_at > new Date().toISOString());
  assert.equal(
    s.sql.prepare("SELECT status FROM hosted_verification_flows").get().status,
    "needs_reconciliation",
  );
});
