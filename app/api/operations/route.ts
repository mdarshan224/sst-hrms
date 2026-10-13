import { env } from "cloudflare:workers";
import { serverContext } from "@/lib/hrms/server-auth";
import {
  platform,
  all,
  first,
  stmt,
  audit,
  now,
  requireFreshSession,
} from "@/lib/hrms/access";
import { AppError, assertOrigin, readJsonBody } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { runDueJobs } from "@/lib/hrms/workflow-jobs";
import { jobConfig } from "@/lib/hrms/workflow-runtime";
export const dynamic = "force-dynamic";
async function matches(actual: string, expected: string | undefined) {
  if (!expected || expected.length < 32 || actual.length > 256) return false;
  const a = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(actual)),
    ),
    b = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode("Bearer " + expected),
      ),
    );
  return a.reduce((v, n, i) => v | (n ^ b[i]), 0) === 0;
}
async function handle(request: Request) {
  try {
    if (!env.DB) throw new AppError(503, "Database unavailable.");
    if (
      request.method === "POST" &&
      (await matches(
        request.headers.get("Authorization") ?? "",
        env.HRMS_JOB_RUNNER_SECRET,
      ))
    )
      return Response.json(await runDueJobs(env.DB, jobConfig()), {
        headers: protectedHeaders(),
      });
    const c = await serverContext();
    platform(c);
    if (request.method === "GET")
      return Response.json(
        {
          jobs: await all(
            c.db,
            "SELECT j.id,t.name company,j.kind,j.status,j.attempts,j.available_at,j.last_error,j.updated_at FROM workflow_jobs j JOIN tenants t ON t.id=j.tenant_id ORDER BY j.updated_at DESC LIMIT 100",
          ),
          webhooks: await all(
            c.db,
            "SELECT id,mode,processing_status,last_error,received_at FROM secure_id_webhook_receipts ORDER BY received_at DESC LIMIT 100",
          ),
          scannerConfigured: Boolean(
            env.DOCUMENT_SCANNER_URL &&
            env.DOCUMENT_SCANNER_TOKEN &&
            env.DOCUMENT_SCAN_CALLBACK_SECRET,
          ),
          dataEncryptionConfigured: Boolean(env.ONBOARDING_DATA_KEY),
        },
        { headers: protectedHeaders() },
      );
    assertOrigin(request);
    await requireFreshSession(c, "retrying workflow jobs");
    const d = await readJsonBody(request, 4096),
      job = await first(
        c.db,
        "SELECT id FROM workflow_jobs WHERE id=?",
        String(d.id),
      );
    if (!job) throw new AppError(404, "Job not found.");
    const result = await c.db.batch([
      stmt(
        c.db,
        "UPDATE workflow_jobs SET status='pending',attempts=0,available_at=?,last_error=NULL,updated_at=? WHERE id=? AND status IN('blocked','dead_letter')",
        now(),
        now(),
        String(d.id),
      ),
      audit(c, null, "workflow.retry_requested", String(d.id)),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "Job is already pending or complete.");
    return Response.json({ queued: true }, { headers: protectedHeaders() });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof AppError ? e.message : "Operations request failed.",
      },
      {
        status: e instanceof AppError ? e.status : 500,
        headers: protectedHeaders(),
      },
    );
  }
}
export const GET = handle;
export const POST = handle;
