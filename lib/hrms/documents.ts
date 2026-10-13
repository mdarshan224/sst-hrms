import { z } from "zod";
import { AppError } from "./domain.ts";
import {
  scope,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  scopedEmployee,
} from "./access.ts";
import type { Context } from "./access.ts";

import { documentEmployee } from "./document-subject.ts";
import { privacyScope } from "./privacy.ts";
import { outbox, guardedAudit } from "./outbox.ts";
import { verifySecureIdWebhook } from "./cashfree.ts";
export const DOCUMENT_LIMIT = 2 * 1024 * 1024;
export async function bytesDigest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function validateDocument(
  bytes: Uint8Array,
  mime: string,
  filename: string,
) {
  if (!bytes.length || bytes.length > DOCUMENT_LIMIT)
    throw new AppError(413, "Documents must be between 1 byte and 2 MiB.");
  const ext = filename.toLowerCase().split(".").pop(),
    prefix = [...bytes.slice(0, 8)];
  const valid =
    (mime === "application/pdf" &&
      ext === "pdf" &&
      new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") ||
    (mime === "image/png" &&
      ext === "png" &&
      prefix.join(",") === "137,80,78,71,13,10,26,10") ||
    (mime === "image/jpeg" &&
      ["jpg", "jpeg"].includes(ext ?? "") &&
      prefix[0] === 255 &&
      prefix[1] === 216 &&
      prefix[2] === 255);
  if (!valid)
    throw new AppError(
      422,
      "Allowed documents are PDF, PNG or JPEG with matching filename, MIME and file signature. Content remains quarantined for scanning.",
    );
}
export async function uploadDocument(
  c: Context,
  bucket: R2Bucket | undefined,
  tid: string,
  input: unknown,
  bytes: Uint8Array,
) {
  await scope(c, tid, "", "private_documents");
  const e = await documentEmployee(
      c,
      tid,
      (input as { caseId?: string })?.caseId,
      true,
    ),
    d = z
      .object({
        requestId: z.string().uuid(),
        category: z.enum(["resume", "education", "signed_offer", "employment"]),
        mime: z.string(),
        filename: z.string().min(1).max(200),
        caseId: z.string().uuid().optional(),
        replacesId: z.string().uuid().optional(),
      })
      .parse(input);
  if (!bucket)
    throw new AppError(503, "Private document storage is unavailable.");
  validateDocument(bytes, d.mime, d.filename);
  const digest = await bytesDigest(bytes),
    existing = await first(
      c.db,
      "SELECT * FROM private_employee_documents WHERE tenant_id=? AND employee_id=? AND request_id=?",
      tid,
      e.id,
      d.requestId,
    );
  if (
    existing &&
    (existing.digest !== digest ||
      existing.category !== d.category ||
      existing.mime !== d.mime ||
      existing.deleted_at)
  )
    throw new AppError(
      409,
      "Upload retry does not match the original document.",
    );
  const slot = await first(
    c.db,
    "SELECT * FROM document_slots WHERE tenant_id=? AND employee_id=? AND category=?",
    tid,
    e.id,
    d.category,
  );
  if (
    !d.replacesId &&
    slot &&
    (await first(
      c.db,
      "SELECT id FROM private_employee_documents WHERE id=? AND tenant_id=? AND employee_id=? AND deleted_at IS NOT NULL",
      slot.current_id,
      tid,
      e.id,
    ))
  )
    d.replacesId = String(slot.current_id);
  if (!existing && slot && slot.current_id !== d.replacesId)
    throw new AppError(
      409,
      "Choose the current document explicitly before uploading a replacement.",
    );
  if (!existing && d.replacesId && (!slot || slot.current_id !== d.replacesId))
    throw new AppError(
      409,
      "Replacement belongs to another record or is outdated.",
    );
  const did = existing?.id ?? id(),
    key = String(existing?.object_key ?? `quarantine/${id()}/${id()}`),
    at = now(),
    scanRequestId = String(existing?.scan_request_id ?? id());
  if (!existing)
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO private_employee_documents(id,tenant_id,employee_id,user_id,request_id,object_key,digest,mime,size,category,created_at,retain_until,scan_request_id,parent_id,document_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        did,
        tid,
        e.id,
        c.identity.userId,
        d.requestId,
        key,
        digest,
        d.mime,
        bytes.length,
        d.category,
        at,
        new Date(Date.now() + 90 * 86400000).toISOString(),
        scanRequestId,
        d.replacesId ?? null,
        Number(slot?.version ?? 0) + 1,
      ),
      stmt(
        c.db,
        "INSERT INTO document_slots(id,tenant_id,employee_id,category,current_id,version,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,employee_id,category) DO UPDATE SET current_id=excluded.current_id,version=version+1,updated_at=excluded.updated_at WHERE document_slots.current_id=?",
        id(),
        tid,
        e.id,
        d.category,
        did,
        Number(slot?.version ?? 0) + 1,
        at,
        d.replacesId ?? null,
      ),
      audit(c, tid, "document.upload_registered", String(did), {
        category: d.category,
        size: bytes.length,
      }),
    ]);
  if (!existing?.uploaded_at) {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: d.mime, cacheControl: "private, no-store" },
      customMetadata: { documentId: String(did), sha256: digest },
    });
    const stored = await stmt(
      c.db,
      "UPDATE private_employee_documents SET uploaded_at=? WHERE id=? AND tenant_id=? AND deleted_at IS NULL",
      now(),
      did,
      tid,
    ).run();
    if (!stored.meta.changes) {
      await bucket.delete(key);
      throw new AppError(409, "Upload was closed before storage completed.");
    }
    await outbox(
      c.db,
      tid,
      "scan_document",
      String(did),
      `scan:${scanRequestId}`,
    ).run();
  }
  return {
    scanRequestId,
    id: did,
    status: existing?.scan_status ?? "quarantined",
    digest,
  };
}
export async function documentList(
  c: Context,
  tid: string,
  input: { caseId?: string; employeeId?: string } = {},
) {
  await scope(c, tid, "", "private_documents");
  const e = input.employeeId
    ? await scopedEmployee(
        c,
        tid,
        await privacyScope(c, tid, "documents", "private_documents"),
        input.employeeId,
      )
    : await documentEmployee(c, tid, input.caseId);
  return all(
    c.db,
    "SELECT id,category,mime,size,scan_status,created_at,uploaded_at,retain_until,document_version,parent_id,review_status,review_reason,reviewer_id,reviewed_at,(SELECT current_id FROM document_slots s WHERE s.tenant_id=private_employee_documents.tenant_id AND s.employee_id=private_employee_documents.employee_id AND s.category=private_employee_documents.category) current_id FROM private_employee_documents WHERE tenant_id=? AND employee_id=? AND deleted_at IS NULL AND retain_until>? ORDER BY created_at DESC LIMIT 100",
    tid,
    e.id,
    now(),
  );
}
async function authorizedDocument(c: Context, tid: string, did: string) {
  await scope(c, tid, "", "private_documents");
  const d = await first(
    c.db,
    "SELECT * FROM private_employee_documents WHERE id=? AND tenant_id=? AND deleted_at IS NULL AND retain_until>?",
    z.string().uuid().parse(did),
    tid,
    now(),
  );
  if (!d) throw new AppError(404, "Document not found.");
  const own = await first(
    c.db,
    "SELECT employee_id FROM employee_accounts WHERE tenant_id=? AND user_id=? AND revoked_at IS NULL",
    tid,
    c.identity.userId,
  );
  if (own?.employee_id === d.employee_id && d.user_id === c.identity.userId)
    return d;
  const onboarding = await first(
    c.db,
    "SELECT o.id FROM onboarding_cases o JOIN invitations i ON i.id=o.invitation_id WHERE o.tenant_id=? AND o.employee_id=? AND o.user_id=? AND o.status IN('in_progress','submitted','correction_required') AND i.revoked_at IS NULL AND i.expires_at>?",
    tid,
    d.employee_id,
    c.identity.userId,
    now(),
  );
  if (onboarding && d.user_id === c.identity.userId) return d;
  const t = await scope(c, tid, ""),
    grant = await first(
      c.db,
      "SELECT g.can_view_documents FROM verification_role_grants g JOIN memberships m ON m.role_id=g.role_id AND m.tenant_id=g.tenant_id WHERE g.tenant_id=? AND m.user_id=?",
      tid,
      c.identity.userId,
    );
  if (!grant?.can_view_documents)
    throw new AppError(
      403,
      "Explicit private document permission is required.",
    );
  await scopedEmployee(c, tid, t, String(d.employee_id));
  return d;
}
export async function downloadDocument(
  c: Context,
  bucket: R2Bucket | undefined,
  tid: string,
  did: string,
) {
  const d = await authorizedDocument(c, tid, did);
  if (d.scan_status !== "clean" || !d.uploaded_at)
    throw new AppError(
      423,
      "This document is quarantined or unsafe. Scanner clearance is required.",
    );
  if (!bucket) throw new AppError(503, "Private storage unavailable.");
  const object = await bucket.get(String(d.object_key));
  if (!object) throw new AppError(404, "Document object unavailable.");
  if (object.customMetadata?.sha256 !== d.digest)
    throw new AppError(
      423,
      "Stored document integrity does not match scanner evidence.",
    );
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  if (
    bytes.length !== Number(d.size) ||
    (await bytesDigest(bytes)) !== d.digest
  )
    throw new AppError(
      423,
      "Stored document bytes no longer match scanner evidence.",
    );
  await audit(c, tid, "document.download", did).run();
  return { body: bytes, mime: String(d.mime) };
}
export async function deleteDocument(
  c: Context,
  bucket: R2Bucket | undefined,
  tid: string,
  did: string,
) {
  const d = await authorizedDocument(c, tid, did);
  if (d.user_id !== c.identity.userId)
    throw new AppError(
      403,
      "Only the submitting employee may delete this document.",
    );
  const activeCase = await first(
    c.db,
    "SELECT id,status FROM onboarding_cases WHERE tenant_id=? AND employee_id=? AND status IN('submitted','approved') ORDER BY created_at DESC LIMIT 1",
    tid,
    d.employee_id,
  );
  if (activeCase)
    throw new AppError(
      409,
      "Documents under review or supporting completed onboarding require the HR retention workflow.",
    );
  const e = { id: d.employee_id };
  if (d.employee_id !== e.id)
    throw new AppError(
      403,
      "Only the submitting employee can delete through this endpoint.",
    );
  if (!bucket) throw new AppError(503, "Private storage unavailable.");
  await bucket.delete(String(d.object_key));
  await c.db.batch([
    stmt(
      c.db,
      "UPDATE private_employee_documents SET deleted_at=? WHERE id=? AND tenant_id=? AND deleted_at IS NULL",
      now(),
      did,
      tid,
    ),
    audit(c, tid, "document.deleted", did),
  ]);
  return { deleted: true };
}
// Internal scanner callback contract, not a Cashfree endpoint. Production scanner
// must read the PRIVATE bucket with a separate least-privilege credential.
export async function acceptScan(
  c: Pick<Context, "db">,
  secret: string | undefined,
  raw: Uint8Array,
  timestamp: string,
  signature: string,
) {
  if (!secret || secret.length < 32)
    throw new AppError(
      503,
      "Approved scanning infrastructure is not configured.",
    );
  if (!(await verifySecureIdWebhook(raw, timestamp, signature, secret)))
    throw new AppError(403, "Invalid scanner signature or timestamp.");
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new AppError(422, "Invalid scanner receipt.");
  }
  const d = z
      .object({
        documentId: z.string().uuid(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        verdict: z.enum(["clean", "infected", "failed"]),
        requestId: z.string().uuid().optional(),
      })
      .parse(parsed),
    hash = await bytesDigest(raw),
    row = await first(
      c.db,
      "SELECT * FROM private_employee_documents WHERE id=? AND digest=? AND deleted_at IS NULL AND uploaded_at IS NOT NULL AND retain_until>?",
      d.documentId,
      d.sha256,
      now(),
    );
  if (!row)
    throw new AppError(
      404,
      "Scanner receipt does not match an available document.",
    );
  if (row.scan_request_id && row.scan_request_id !== d.requestId)
    throw new AppError(
      409,
      "Scan request does not match the original dispatch.",
    );
  if (row.scan_receipt_hash === hash)
    return { accepted: true, duplicate: true };
  if (row.scan_status !== "quarantined")
    throw new AppError(409, "Scanner decision is already final.");
  const result = await c.db.batch([
    stmt(
      c.db,
      "UPDATE private_employee_documents SET scan_status=?,scan_at=?,scan_receipt_hash=? WHERE id=? AND digest=? AND scan_status='quarantined' AND deleted_at IS NULL",
      d.verdict,
      now(),
      hash,
      d.documentId,
      d.sha256,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,'document-scanner','document.scan_result',?,?,? WHERE changes()=1",
      id(),
      row.tenant_id,
      d.documentId,
      JSON.stringify({ verdict: d.verdict }),
      now(),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Document changed during scanning.");
  return { accepted: true, duplicate: false };
}

export async function reviewDocument(c: Context, tid: string, input: unknown) {
  const t = await privacyScope(c, tid, "documentReview", "private_documents");
  await privacyScope(c, tid, "documents", "private_documents");
  const d = z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "correction_required"]),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(input),
    row = await first(
      c.db,
      "SELECT * FROM private_employee_documents WHERE tenant_id=? AND id=? AND deleted_at IS NULL AND retain_until>?",
      tid,
      d.id,
      now(),
    );
  if (!row) throw new AppError(404, "Document not found.");
  await scopedEmployee(c, tid, t, String(row.employee_id));
  if (row.user_id === c.identity.userId)
    throw new AppError(403, "You cannot review your own document.");
  if (row.scan_status !== "clean")
    throw new AppError(
      423,
      "Document must be scanned clean before HR can review it.",
    );
  const r = await c.db.batch([
    stmt(
      c.db,
      "INSERT OR IGNORE INTO document_slots(id,tenant_id,employee_id,category,current_id,version,updated_at) SELECT ?,tenant_id,employee_id,category,id,document_version,? FROM private_employee_documents d WHERE d.id=? AND d.tenant_id=? AND d.scan_request_id IS NULL AND NOT EXISTS(SELECT 1 FROM private_employee_documents later WHERE later.tenant_id=d.tenant_id AND later.employee_id=d.employee_id AND later.category=d.category AND (later.created_at>d.created_at OR later.created_at=d.created_at AND later.id>d.id))",
      id(),
      now(),
      d.id,
      tid,
    ),
    stmt(
      c.db,
      "UPDATE private_employee_documents SET review_status=?,review_reason=?,reviewer_id=?,reviewed_at=? WHERE id=? AND tenant_id=? AND review_status='pending' AND scan_status='clean' AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM document_slots WHERE tenant_id=? AND employee_id=? AND current_id=?)",
      d.decision,
      d.reason,
      c.identity.userId,
      now(),
      d.id,
      tid,
      tid,
      row.employee_id,
      d.id,
    ),
    guardedAudit(
      c.db,
      tid,
      c.identity.userId,
      "document.reviewed",
      d.id,
      "changes()=1",
      [],
      { decision: d.decision },
    ),
  ]);
  if (!r[1].meta.changes)
    throw new AppError(409, "Document was replaced or already reviewed.");
  return { saved: true };
}
export async function retryScan(c: Context, tid: string, did: string) {
  const t = await privacyScope(c, tid, "documentReview", "private_documents"),
    row = await first(
      c.db,
      "SELECT * FROM private_employee_documents WHERE id=? AND tenant_id=? AND deleted_at IS NULL AND retain_until>?",
      did,
      tid,
      now(),
    );
  if (!row) throw new AppError(404, "Document not found.");
  await scopedEmployee(c, tid, t, String(row.employee_id));
  if (row.scan_status !== "failed")
    throw new AppError(
      409,
      "Only a failed scan may be retried; infected and clean decisions cannot be overwritten.",
    );
  const requestId = id();
  const r = await c.db.batch([
    stmt(
      c.db,
      "UPDATE private_employee_documents SET scan_status='quarantined',scan_request_id=?,scan_receipt_hash=NULL,scan_at=NULL WHERE id=? AND tenant_id=? AND scan_status='failed'",
      requestId,
      did,
      tid,
    ),
    guardedAudit(
      c.db,
      tid,
      c.identity.userId,
      "document.scan_retry",
      did,
      "changes()=1",
    ),
    outbox(c.db, tid, "scan_document", did, `scan:${requestId}`),
  ]);
  if (!r[0].meta.changes) throw new AppError(409, "Scan state changed.");
  return { queued: true };
}
export async function purgeDocuments(
  c: Context,
  bucket: R2Bucket | undefined,
  tid: string,
) {
  const t = await privacyScope(c, tid, "documentReview", "private_documents");
  if (t.access_branch_id || t.access_department_id)
    throw new AppError(403, "Company-wide retention authority is required.");
  if (!bucket) throw new AppError(503, "Private storage unavailable.");
  const rows = await all(
    c.db,
    "SELECT id,object_key FROM private_employee_documents WHERE tenant_id=? AND retain_until<=? AND deleted_at IS NULL LIMIT 20",
    tid,
    now(),
  );
  let removed = 0;
  for (const row of rows) {
    await bucket.delete(String(row.object_key));
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE private_employee_documents SET deleted_at=? WHERE tenant_id=? AND id=? AND retain_until<=? AND deleted_at IS NULL",
        now(),
        tid,
        row.id,
        now(),
      ),
      guardedAudit(
        c.db,
        tid,
        c.identity.userId,
        "document.retention_deleted",
        String(row.id),
        "changes()=1",
      ),
    ]);
    removed++;
  }
  return { removed, hasMore: rows.length === 20 };
}
