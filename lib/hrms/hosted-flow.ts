import { z } from "zod";
import { AppError } from "./domain.ts";
import { scope, first, all, stmt, audit, id, now } from "./access.ts";
import type { Context } from "./access.ts";
import { verificationEmployee } from "./verification-subject.ts";
import { seal, unseal } from "./private-config.ts";
import type { PrivateConfig } from "./private-config.ts";
import { startHostedConsent } from "./hosted-verification.ts";
import type { HostedConfig } from "./hosted-verification.ts";
import { outbox } from "./outbox.ts";
import { tenantUrl } from "./domains.ts";
export async function hostedStart(
  c: Context,
  privateConfig: PrivateConfig,
  provider: HostedConfig,
  tid: string,
  input: unknown,
) {
  await scope(c, tid, "", "employee_verification");
  const d = z
      .object({
        requestId: z.string().uuid(),
        caseId: z.string().uuid().optional(),
        consent: z.literal(true),
      })
      .parse(input),
    e = await verificationEmployee(c, tid, d.caseId, true),
    settings = await first(
      c.db,
      "SELECT * FROM secure_id_platform WHERE id='cashfree'",
    ),
    policy = await first(
      c.db,
      "SELECT * FROM employee_verification_policy WHERE tenant_id=?",
      tid,
    );
  if (
    !settings?.enabled ||
    !settings.digilocker_enabled ||
    !policy?.digilocker_enabled
  )
    throw new AppError(
      503,
      "DigiLocker consent is not enabled by platform/company configuration.",
    );
  const mode = settings.mode as "sandbox" | "production";
  if (
    !(
      mode === "sandbox"
        ? provider.sandboxProducts
        : provider.productionProducts
    )?.includes("digilocker")
  )
    throw new AppError(
      503,
      "Actual DigiLocker product entitlement must be confirmed by the operator.",
    );
  const replay = await first(
    c.db,
    "SELECT id,status FROM hosted_verification_flows WHERE tenant_id=? AND employee_id=? AND request_id=?",
    tid,
    e.id,
    d.requestId,
  );
  if (replay) return { ...replay, replayed: true };
  if (
    await first(
      c.db,
      "SELECT id FROM hosted_verification_flows WHERE tenant_id=? AND employee_id=? AND status IN('pending','needs_reconciliation')",
      tid,
      e.id,
    )
  )
    throw new AppError(
      409,
      "Query the existing consent flow before starting another.",
    );
  const fid = "dgl_" + id().replaceAll("-", ""),
    expires = new Date(Date.now() + 10 * 60000).toISOString();
  await seal(privateConfig, {}, `hosted:${tid}:${fid}`);
  await c.db.batch([
    stmt(
      c.db,
      "INSERT INTO hosted_verification_flows(id,tenant_id,employee_id,user_id,mode,request_id,consent_at,consent_version,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      fid,
      tid,
      e.id,
      c.identity.userId,
      mode,
      d.requestId,
      now(),
      "digilocker-pan-consent-v1",
      expires,
      now(),
      now(),
    ),
    audit(c, tid, "verification.hosted_consented", fid),
  ]);
  try {
    const canonical = new URL(
        await tenantUrl(c.db, tid, "/", c.deploymentVersion),
      ),
      redirect = new URL("/verification/return", canonical).href,
      result = await startHostedConsent(provider, mode, fid, redirect);
    await stmt(
      c.db,
      "UPDATE hosted_verification_flows SET provider_reference=?,url_ciphertext=?,updated_at=? WHERE id=? AND tenant_id=?",
      result.reference,
      await seal(privateConfig, { url: result.url }, `hosted:${tid}:${fid}`),
      now(),
      fid,
      tid,
    ).run();
    return {
      id: fid,
      status: "pending",
      authorizationPath: `/api/verification/hosted?tenant=${encodeURIComponent(tid)}&id=${fid}`,
    };
  } catch {
    await c.db.batch([
      stmt(
        c.db,
        "UPDATE hosted_verification_flows SET status='needs_reconciliation',updated_at=? WHERE id=? AND tenant_id=?",
        now(),
        fid,
        tid,
      ),
      outbox(c.db, tid, "hosted_reconcile", fid, `hosted:${fid}:initial`),
    ]);
    throw new AppError(
      503,
      "Hosted consent outcome is unknown. Status inquiry is queued; do not start another flow.",
    );
  }
}
export async function hostedAuthorization(
  c: Context,
  config: PrivateConfig,
  tid: string,
  fid: string,
) {
  await scope(c, tid, "", "employee_verification");
  const row = await first(
    c.db,
    "SELECT * FROM hosted_verification_flows WHERE id=? AND tenant_id=? AND user_id=? AND status='pending' AND expires_at>?",
    fid,
    tid,
    c.identity.userId,
    now(),
  );
  if (!row || !row.url_ciphertext)
    throw new AppError(410, "Authorization link is unavailable or expired.");
  const owned = await first(
    c.db,
    "SELECT employee_id FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND user_id=? AND revoked_at IS NULL",
    tid,
    row.employee_id,
    c.identity.userId,
  );
  if (!owned) {
    const pending = await first(
      c.db,
      "SELECT o.id FROM onboarding_cases o JOIN invitations i ON i.id=o.invitation_id AND i.tenant_id=o.tenant_id WHERE o.tenant_id=? AND o.employee_id=? AND o.user_id=? AND o.status IN('in_progress','correction_required') AND i.revoked_at IS NULL AND i.expires_at>?",
      tid,
      row.employee_id,
      c.identity.userId,
      now(),
    );
    if (!pending) throw new AppError(410, "Onboarding is closed or expired.");
  }
  const result = await unseal(
    config,
    String(row.url_ciphertext),
    `hosted:${tid}:${fid}`,
  );
  return String(result.url);
}
export async function hostedList(c: Context, tid: string) {
  await scope(c, tid, "", "employee_verification");
  return all(
    c.db,
    "SELECT id,product,status,provider_reference,created_at,updated_at,expires_at,consent_valid_until FROM hosted_verification_flows WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50",
    tid,
    c.identity.userId,
  );
}
export async function queueHostedInquiry(c: Context, tid: string, fid: string) {
  await scope(c, tid, "", "employee_verification");
  const row = await first(
    c.db,
    "SELECT id FROM hosted_verification_flows WHERE id=? AND tenant_id=? AND user_id=?",
    fid,
    tid,
    c.identity.userId,
  );
  if (!row) throw new AppError(404, "Verification not found.");
  await outbox(
    c.db,
    tid,
    "hosted_reconcile",
    fid,
    `hosted:${fid}:${Math.floor(Date.now() / 60000)}`,
  ).run();
  return { queued: true, identityVerified: false };
}
