import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setup } from "./verification-fixture.mjs";
import {
  uploadDocument,
  downloadDocument,
  deleteDocument,
  acceptScan,
  validateDocument,
  documentList,
} from "../lib/hrms/documents.ts";
import { verificationAction } from "../lib/hrms/verification.ts";
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status),
  bytes = Buffer.from(
    "%PDF-1.7\nsynthetic unit fixture; not a genuine document",
  );
function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, metadata) {
      objects.set(key, { bytes: value, ...metadata });
    },
    async get(key) {
      const v = objects.get(key);
      return v
        ? {
            body: new ReadableStream({
              start(c) {
                c.enqueue(v.bytes);
                c.close();
              },
            }),
            customMetadata: v.customMetadata,
          }
        : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
const input = () => ({
  requestId: crypto.randomUUID(),
  category: "resume",
  mime: "application/pdf",
  filename: "synthetic.pdf",
});
function signed(
  row,
  verdict = "clean",
  secret = "synthetic-scanner-secret-at-least-32-bytes",
) {
  const raw = Buffer.from(
      JSON.stringify({
        documentId: row.id,
        sha256: row.digest,
        verdict,
        requestId: row.scanRequestId,
      }),
    ),
    ts = String(Date.now());
  return {
    raw,
    ts,
    secret,
    sig: createHmac("sha256", secret).update(ts).update(raw).digest("base64"),
  };
}
test("private upload uses unpredictable keys and remains inaccessible before actual scanner receipt", async () => {
  const s = await setup(),
    b = bucket(),
    v = input(),
    r = await uploadDocument(s.c, b, s.tid, v, bytes);
  assert.equal(r.status, "quarantined");
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 423);
  const row = s.sql.prepare("SELECT * FROM private_employee_documents").get();
  assert.equal(row.object_key.includes(s.tid), false);
  assert.equal(row.object_key.includes("John"), false);
  assert.equal(row.original_filename, undefined);
  await uploadDocument(s.c, b, s.tid, v, bytes);
  assert.equal(b.objects.size, 1);
  await fail(
    () => uploadDocument(s.c, b, s.tid, v, Buffer.from("%PDF-1.7 different")),
    409,
  );
  assert.equal((await documentList(s.c, s.tid)).length, 1);
});
test("file type, MIME, signature, category and size validation fail before storing objects", async () => {
  for (const args of [
    [bytes, "image/png", "x.png"],
    [bytes, "application/pdf", "x.exe"],
    [Buffer.from("bad"), "application/pdf", "x.pdf"],
    [Buffer.alloc(2 * 1024 * 1024 + 1), "application/pdf", "x.pdf"],
  ])
    assert.throws(() => validateDocument(...args));
  const s = await setup(),
    b = bucket();
  await assert.rejects(() =>
    uploadDocument(s.c, b, s.tid, { ...input(), category: "aadhaar" }, bytes),
  );
  await fail(() => uploadDocument(s.c, undefined, s.tid, input(), bytes), 503);
  assert.equal(b.objects.size, 0);
});
test("scanner signatures bind exact digest and permit one final result; forged and missing scanners fail closed", async () => {
  const s = await setup(),
    b = bucket(),
    r = await uploadDocument(s.c, b, s.tid, input(), bytes),
    v = signed(r);
  await fail(() => acceptScan(s.c, undefined, v.raw, v.ts, v.sig), 503);
  await fail(() => acceptScan(s.c, v.secret, v.raw, v.ts, "forged"), 403);
  const mismatch = signed({ ...r, digest: "0".repeat(64) });
  await fail(
    () =>
      acceptScan(s.c, mismatch.secret, mismatch.raw, mismatch.ts, mismatch.sig),
    404,
  );
  assert.equal(
    (await acceptScan(s.c, v.secret, v.raw, v.ts, v.sig)).duplicate,
    false,
  );
  assert.equal(
    (await acceptScan(s.c, v.secret, v.raw, v.ts, v.sig)).duplicate,
    true,
  );
  const other = signed(r, "infected");
  await fail(
    () => acceptScan(s.c, other.secret, other.raw, other.ts, other.sig),
    409,
  );
  const file = await downloadDocument(s.c, b, s.tid, r.id);
  assert.equal(file.mime, "application/pdf");
  assert.deepEqual(
    Buffer.from(await new Response(file.body).arrayBuffer()),
    bytes,
  );
});
test("infected, expired, cross-company and revoked employee documents cannot be downloaded", async () => {
  const s = await setup(),
    b = bucket(),
    r = await uploadDocument(s.c, b, s.tid, input(), bytes),
    v = signed(r, "infected");
  await acceptScan(s.c, v.secret, v.raw, v.ts, v.sig);
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 423);
  await fail(() => downloadDocument(s.c, b, s.other, r.id), 404);
  await fail(
    () => downloadDocument({ ...s.c, boundTenantId: s.other }, b, s.tid, r.id),
    404,
  );
  s.sql
    .prepare("UPDATE private_employee_documents SET retain_until=? WHERE id=?")
    .run(new Date(Date.now() - 1000).toISOString(), r.id);
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 404);
  s.sql
    .prepare("UPDATE private_employee_documents SET retain_until=? WHERE id=?")
    .run(new Date(Date.now() + 60000).toISOString(), r.id);
  await deleteDocument(s.c, b, s.tid, r.id);
  assert.equal(b.objects.size, 0);
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 404);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE action='document.deleted'",
      )
      .get().n,
    1,
  );
});
test("document access is not implicit for owner/support; explicit grant honors employee organization scope", async () => {
  const s = await setup(),
    b = bucket(),
    r = await uploadDocument(s.c, b, s.tid, input(), bytes),
    v = signed(r);
  await acceptScan(s.c, v.secret, v.raw, v.ts, v.sig);
  s.sql
    .prepare("UPDATE employee_accounts SET revoked_at=?")
    .run(new Date().toISOString());
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 403);
  const role = s.sql
    .prepare("SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?")
    .get(s.tid, s.c.identity.userId).role_id;
  await verificationAction(s.c, s.config, "privacy.grant", s.tid, {
    roleId: role,
    canView: false,
    canReview: false,
    canViewDocuments: true,
  });
  assert.equal(
    (await downloadDocument(s.c, b, s.tid, r.id)).mime,
    "application/pdf",
  );
});
test("document versions require current parent, retain history, and queue scans without bypassing quarantine", async () => {
  const s = await setup(),
    b = bucket(),
    r = await uploadDocument(s.c, b, s.tid, input(), bytes);
  await fail(() => uploadDocument(s.c, b, s.tid, input(), bytes), 409);
  const replacement = await uploadDocument(
    s.c,
    b,
    s.tid,
    { ...input(), replacesId: r.id },
    bytes,
  );
  assert.equal(
    s.sql
      .prepare("SELECT parent_id FROM private_employee_documents WHERE id=?")
      .get(replacement.id).parent_id,
    r.id,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT document_version FROM private_employee_documents WHERE id=?",
      )
      .get(replacement.id).document_version,
    2,
  );
  await fail(
    () =>
      uploadDocument(s.c, b, s.tid, { ...input(), replacesId: r.id }, bytes),
    409,
  );
  const { runDueJobs } = await import("../lib/hrms/workflow-jobs.ts");
  await runDueJobs(s.db, { cashfree: s.config, bucket: b }, 3);
  assert.equal(
    s.sql.prepare("SELECT status FROM workflow_jobs LIMIT 1").get().status,
    "blocked",
  );
  await fail(() => downloadDocument(s.c, b, s.tid, replacement.id), 423);
  const signedWrong = signed({
    ...replacement,
    scanRequestId: crypto.randomUUID(),
  });
  await fail(
    () =>
      acceptScan(
        s.c,
        signedWrong.secret,
        signedWrong.raw,
        signedWrong.ts,
        signedWrong.sig,
      ),
    409,
  );
});
test("actual file digest is rechecked before download even if object metadata is forged", async () => {
  const s = await setup(),
    b = bucket(),
    r = await uploadDocument(s.c, b, s.tid, input(), bytes),
    v = signed(r);
  await acceptScan(s.c, v.secret, v.raw, v.ts, v.sig);
  const row = s.sql
    .prepare("SELECT object_key FROM private_employee_documents WHERE id=?")
    .get(r.id);
  b.objects.get(row.object_key).bytes = Buffer.from("%PDF-1.7 tampered");
  await fail(() => downloadDocument(s.c, b, s.tid, r.id), 423);
});
