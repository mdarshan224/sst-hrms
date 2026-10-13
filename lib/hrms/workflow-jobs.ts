import { requestBytes } from "./request-bytes.ts";
import { AppError, assertEntitlement } from "./domain.ts";
import { first, all, stmt, now, id } from "./access.ts";
import { guardedAudit } from "./outbox.ts";
import { bytesDigest, acceptScan } from "./documents.ts";
import { inquireHostedConsent } from "./hosted-verification.ts";
import type { HostedConfig } from "./hosted-verification.ts";
export type JobConfig = {
  bucket?: R2Bucket;
  scannerUrl?: string;
  scannerToken?: string;
  scanSecret?: string;
  cashfree: HostedConfig;
  fetcher?: typeof fetch;
};
export async function scanRequestMac(
  secret: string,
  timestamp: string,
  docId: string,
  requestId: string,
  digest: string,
  bytes: Uint8Array,
) {
  const prefix = new TextEncoder().encode(
      `${timestamp}\n${docId}\n${requestId}\n${digest}\n`,
    ),
    input = new Uint8Array(prefix.length + bytes.length);
  input.set(prefix);
  input.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.sign("HMAC", key, input)),
    ),
  );
}
async function tenantEnabled(db: D1Database, tid: string, module: string) {
  const t = await first(
    db,
    "SELECT t.status,s.status subscription_status,s.expires_at,p.modules FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE t.id=?",
    tid,
  );
  if (!t || t.status !== "active")
    throw new AppError(403, "Company is inactive.");
  assertEntitlement(
    String(t.subscription_status),
    String(t.expires_at),
    JSON.parse(String(t.modules)),
    module,
  );
}
export async function runDueJobs(
  db: D1Database,
  config: JobConfig,
  limit = 3,
  onlyInappTenant?: string,
) {
  const rows = await all(
    db,
    `SELECT * FROM workflow_jobs WHERE available_at<=? AND (status IN('pending','retry') OR status='processing' AND lease_until<?) ${onlyInappTenant ? "AND tenant_id=? AND kind='onboarding_notice'" : ""} ORDER BY available_at,id LIMIT ?`,
    now(),
    now(),
    ...(onlyInappTenant ? [onlyInappTenant] : []),
    Math.min(10, Math.max(1, limit)),
  );
  let completed = 0;
  for (const row of rows) {
    const lease = id(),
      claimed = await stmt(
        db,
        "UPDATE workflow_jobs SET status='processing',lease_id=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND (status IN('pending','retry') OR status='processing' AND lease_until<?)",
        lease,
        new Date(Date.now() + 60000).toISOString(),
        now(),
        row.id,
        now(),
      ).run();
    if (!claimed.meta.changes) continue;
    try {
      if (row.kind === "onboarding_notice") {
        await tenantEnabled(db, String(row.tenant_id), "onboarding");
        const c = await first(
          db,
          "SELECT id,user_id,creator_id,status FROM onboarding_cases WHERE id=? AND tenant_id=?",
          row.resource_id,
          row.tenant_id,
        );
        if (!c)
          throw new AppError(404, "Onboarding resource no longer exists.");
        const users = new Set([c.user_id, c.creator_id].filter(Boolean));
        await db.batch(
          [...users].map((uid) =>
            stmt(
              db,
              "INSERT OR IGNORE INTO inapp_notifications(id,tenant_id,user_id,event_key,kind,resource_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=? AND m.user_id=? AND NOT EXISTS(SELECT 1 FROM membership_revocations r WHERE r.membership_id=m.id AND r.restored_at IS NULL))",
              id(),
              row.tenant_id,
              uid,
              row.dedupe_key,
              `onboarding.${c.status}`,
              c.id,
              now(),
              row.tenant_id,
              uid,
            ),
          ),
        );
      } else if (row.kind === "scan_document") {
        await tenantEnabled(db, String(row.tenant_id), "private_documents");
        const d = await first(
          db,
          "SELECT * FROM private_employee_documents WHERE id=? AND tenant_id=? AND scan_status='quarantined' AND uploaded_at IS NOT NULL AND deleted_at IS NULL AND retain_until>?",
          row.resource_id,
          row.tenant_id,
          now(),
        );
        if (!d) {
          await stmt(
            db,
            "UPDATE workflow_jobs SET status='completed',lease_id=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_id=?",
            now(),
            row.id,
            lease,
          ).run();
          continue;
        }
        if (
          !config.bucket ||
          !config.scannerUrl ||
          !config.scannerToken ||
          !config.scanSecret
        )
          throw new AppError(
            503,
            "Approved scanner service is not configured; document remains quarantined.",
          );
        const target = new URL(config.scannerUrl);
        if (
          target.protocol !== "https:" ||
          target.username ||
          target.password ||
          target.search ||
          target.hash ||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(target.hostname)
        )
          throw new AppError(
            503,
            "Scanner must use an operator-approved HTTPS endpoint.",
          );
        const object = await config.bucket.get(String(d.object_key));
        if (!object) throw new AppError(502, "Private object is unavailable.");
        const bytes = new Uint8Array(
          await new Response(object.body).arrayBuffer(),
        );
        if (
          bytes.length !== Number(d.size) ||
          (await bytesDigest(bytes)) !== d.digest
        )
          throw new AppError(423, "Object digest changed before scanning.");
        const ts = String(Date.now()),
          signature = await scanRequestMac(
            config.scanSecret,
            ts,
            String(d.id),
            String(d.scan_request_id),
            String(d.digest),
            bytes,
          ),
          r = await (config.fetcher ?? fetch)(target, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.scannerToken}`,
              "Content-Type": "application/octet-stream",
              "x-scan-timestamp": ts,
              "x-scan-document": String(d.id),
              "x-scan-request-id": String(d.scan_request_id),
              "x-scan-digest": String(d.digest),
              "x-scan-signature": signature,
            },
            body: bytes,
            redirect: "error",
            signal: AbortSignal.timeout(35000),
          });
        if (!r.ok)
          throw new AppError(502, "Scanner could not confirm the scan.");
        const raw = await requestBytes(r, 4096);
        if (raw.length > 4096)
          throw new AppError(502, "Scanner receipt exceeds limit.");
        await acceptScan(
          { db },
          config.scanSecret,
          raw,
          r.headers.get("x-scan-timestamp") ?? "",
          r.headers.get("x-scan-signature") ?? "",
        );
      } else if (row.kind === "hosted_reconcile") {
        await tenantEnabled(db, String(row.tenant_id), "employee_verification");
        const f = await first(
          db,
          "SELECT * FROM hosted_verification_flows WHERE id=? AND tenant_id=?",
          row.resource_id,
          row.tenant_id,
        );
        if (!f) throw new AppError(404, "Verification flow unavailable.");
        if (
          !(await first(
            db,
            "SELECT m.id FROM memberships m WHERE tenant_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM membership_revocations r WHERE r.membership_id=m.id AND r.restored_at IS NULL)",
            row.tenant_id,
            f.user_id,
          ))
        )
          throw new AppError(403, "Recipient company access was revoked.");
        const outcome = await inquireHostedConsent(
          config.cashfree,
          f.mode as "sandbox" | "production",
          String(f.id),
          f.provider_reference ? String(f.provider_reference) : undefined,
        );
        if (
          !["pending", "needs_reconciliation", outcome.status].includes(
            String(f.status),
          )
        )
          throw new AppError(
            409,
            "Provider result conflicts with a recorded final state.",
          );
        await db.batch([
          stmt(
            db,
            "UPDATE hosted_verification_flows SET provider_reference=?,status=?,consent_valid_until=?,updated_at=? WHERE id=? AND tenant_id=? AND status=?",
            outcome.reference,
            outcome.status,
            outcome.consentValidUntil,
            now(),
            f.id,
            row.tenant_id,
            f.status,
          ),
          guardedAudit(
            db,
            String(row.tenant_id),
            "workflow-runner",
            "verification.hosted_inquiry",
            String(f.id),
            "changes()=1",
            [],
            { status: outcome.status, identityVerified: false },
          ),
          stmt(
            db,
            "UPDATE secure_id_webhook_receipts SET processing_status='processed',last_error=NULL WHERE check_id=? AND processing_status='queued'",
            f.id,
          ),
        ]);
        if (outcome.status === "pending")
          throw new AppError(
            425,
            "Hosted consent is still pending; retry status inquiry with backoff.",
          );
      } else throw new AppError(422, "Unsupported workflow job.");
      await stmt(
        db,
        "UPDATE workflow_jobs SET status='completed',lease_id=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND lease_id=?",
        now(),
        row.id,
        lease,
      ).run();
      completed++;
    } catch (error) {
      const attempts = Number(row.attempts) + 1,
        blocked =
          error instanceof AppError && [503, 403, 402].includes(error.status),
        status = blocked ? "blocked" : attempts >= 5 ? "dead_letter" : "retry",
        message =
          error instanceof AppError
            ? error.message
            : "Temporary workflow operation failed.";
      await stmt(
        db,
        "UPDATE workflow_jobs SET status=?,available_at=?,last_error=?,lease_id=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_id=?",
        status,
        new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** attempts),
        ).toISOString(),
        message,
        now(),
        row.id,
        lease,
      ).run();
      if (row.kind === "hosted_reconcile")
        await stmt(
          db,
          "UPDATE secure_id_webhook_receipts SET processing_status=?,last_error=? WHERE check_id=? AND processing_status='queued'",
          status === "dead_letter" ? "failed" : "queued",
          message,
          row.resource_id,
        ).run();
    }
  }
  return { considered: rows.length, completed };
}
