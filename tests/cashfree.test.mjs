import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHmac,
  generateKeyPairSync,
  privateDecrypt,
  constants,
} from "node:crypto";
import {
  verifyPan,
  credentialStatus,
  verifySecureIdWebhook,
  panRequest,
} from "../lib/hrms/cashfree.ts";
const input = {
  pan: "ABCPV1234D",
  name: "John Doe",
  dob: "1993-06-30",
  verification_id: "test_approved_sandbox_data",
};
const result = {
  ...input,
  reference_id: 123456,
  name_match: "Y",
  dob_match: "Y",
  pan_status: "E",
  status: "VALID",
};
const config = (fetcher) => ({
  sandbox: { clientId: "synthetic-client", clientSecret: "synthetic-secret" },
  production: {},
  fetcher,
});
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);
test("PAN Lite uses fixed documented sandbox endpoint, exact authentication and minimal results", async () => {
  const out = await verifyPan(
    config(async (url, options) => {
      assert.equal(url, "https://sandbox.cashfree.com/verification/pan-lite");
      assert.equal(options.headers["x-client-id"], "synthetic-client");
      assert.equal(options.headers["x-client-secret"], "synthetic-secret");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body), input);
      return Response.json(result);
    }),
    "sandbox",
    input,
  );
  assert.equal(out.outcome, "verified");
  assert.equal(out.maskedIdentifier, "******234D");
  assert.equal(out.referenceId, "123456");
  assert.equal(out.pan, undefined);
  assert.equal(out.name, undefined);
  assert.equal(out.dob, undefined);
});
for (const [description, changes, status] of [
  ["invalid business result", { status: "INVALID" }, "failed"],
  ["name mismatch", { name_match: "N" }, "needs_manual_review"],
  ["DOB mismatch", { dob_match: "N" }, "needs_manual_review"],
  ["unrecognized name", { name: "Other Name" }, "needs_manual_review"],
  ["deactivated PAN", { pan_status: "X" }, "needs_manual_review"],
])
  test(description + " is not treated as verified", async () =>
    assert.equal(
      (
        await verifyPan(
          config(async () => Response.json({ ...result, ...changes })),
          "sandbox",
          input,
        )
      ).outcome,
      status,
    ),
  );
test("invalid PAN and impossible dates never reach the provider", async () => {
  let calls = 0;
  for (const d of [
    { pan: "bad" },
    { dob: "2026-02-30" },
    { dob: "3000-01-01" },
  ])
    await assert.rejects(() =>
      verifyPan(
        config(async () => {
          calls++;
          return Response.json(result);
        }),
        "sandbox",
        { ...input, ...d },
      ),
    );
  assert.equal(calls, 0);
  assert.equal(
    panRequest.parse({ ...input, pan: "abcpv1234d" }).pan,
    input.pan,
  );
});
test("200 malformed, mismatched request, overlimit responses, throttling and timeouts fail safely without retries", async () => {
  for (const response of [
    Response.json({ status: "VALID" }),
    Response.json({ ...result, verification_id: "foreign" }),
    Response.json({ ...result, pan: "XYZPP4321W" }),
    new Response("x".repeat(16385)),
    new Response("", { status: 429 }),
  ]) {
    let calls = 0;
    await assert.rejects(() =>
      verifyPan(
        config(async () => {
          calls++;
          return response;
        }),
        "sandbox",
        input,
      ),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await fail(
    () =>
      verifyPan(
        config(async () => {
          calls++;
          throw new Error("provider outage");
        }),
        "sandbox",
        input,
      ),
    503,
  );
  assert.equal(calls, 1);
});
test("production and missing mode credentials fail closed; no mode fallback", async () => {
  await fail(
    () =>
      verifyPan(
        config(async () => {
          throw new Error("must not call");
        }),
        "production",
        input,
      ),
    503,
  );
  await fail(
    () => verifyPan({ sandbox: {}, production: {} }, "sandbox", input),
    503,
  );
  assert.equal(
    JSON.stringify(credentialStatus(config(), "sandbox")).includes(
      "synthetic-secret",
    ),
    false,
  );
});
test("registered RSA public key produces OAEP signature for exact client/time payload", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const c = config(async (url, o) => {
    const plain = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(o.headers["x-cf-signature"], "base64"),
    ).toString();
    assert.match(plain, /^synthetic-client\.\d{10}$/);
    return Response.json(result);
  });
  c.sandbox.publicKey = publicKey.export({ format: "pem", type: "spki" });
  await verifyPan(c, "sandbox", input);
});
test("Secure ID webhook verifies exact raw timestamp/body, rejects tampering and stale timestamps", async () => {
  const raw = Buffer.from('{ "synthetic": true }'),
    ts = String(Date.now()),
    secret = "synthetic-secret",
    sig = createHmac("sha256", secret).update(ts).update(raw).digest("base64");
  assert.equal(await verifySecureIdWebhook(raw, ts, sig, secret), true);
  assert.equal(
    await verifySecureIdWebhook(
      Buffer.from('{"synthetic":true}'),
      ts,
      sig,
      secret,
    ),
    false,
  );
  assert.equal(await verifySecureIdWebhook(raw, ts, "forged", secret), false);
  assert.equal(
    await verifySecureIdWebhook(
      raw,
      String(Date.now() - 11 * 60000),
      sig,
      secret,
    ),
    false,
  );
});
