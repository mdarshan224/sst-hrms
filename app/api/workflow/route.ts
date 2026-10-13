import { serverContext } from "@/lib/hrms/server-auth";
import { privateConfig, jobConfig } from "@/lib/hrms/workflow-runtime";
import {
  onboardingRead,
  onboardingAction,
  claimOnboarding,
} from "@/lib/hrms/onboarding";
import {
  recruitmentRead,
  recruitmentAction,
  submitInterviewFeedback,
} from "@/lib/hrms/recruitment";
import {
  reviewDocument,
  retryScan,
  purgeDocuments,
} from "@/lib/hrms/documents";
import { publishedJobSettings, publishJob } from "@/lib/hrms/careers";
import { scope, all, first, stmt, now } from "@/lib/hrms/access";
import {
  hostedStart,
  hostedList,
  queueHostedInquiry,
} from "@/lib/hrms/hosted-flow";
import { runDueJobs } from "@/lib/hrms/workflow-jobs";
import { cashfreeConfig } from "@/lib/hrms/cashfree-config";
import { env } from "cloudflare:workers";
import { AppError, readJsonBody, assertOrigin } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const c = await serverContext(),
      url = new URL(request.url),
      tid = url.searchParams.get("tenant") ?? "",
      view = url.searchParams.get("view") ?? "";
    if (request.method === "GET") {
      let result: unknown;
      if (view === "mine")
        result = {
          rows: await all(
            c.db,
            "SELECT o.id,o.tenant_id,o.status,e.full_name,t.name company,t.slug FROM onboarding_cases o JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id JOIN tenants t ON t.id=o.tenant_id JOIN memberships m ON m.tenant_id=o.tenant_id AND m.user_id=o.user_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE o.user_id=? AND (? IS NULL OR o.tenant_id=?) AND o.status NOT IN('revoked','rejected') AND t.status='active' AND s.status IN('trial','active') AND s.expires_at>? AND EXISTS(SELECT 1 FROM json_each(p.modules) WHERE value='onboarding') AND NOT EXISTS(SELECT 1 FROM membership_revocations r WHERE r.membership_id=m.id AND r.restored_at IS NULL) ORDER BY o.updated_at DESC LIMIT 100",
            c.identity.userId,
            c.boundTenantId ?? null,
            c.boundTenantId ?? null,
            now(),
          ),
        };
      else if (view === "recruitment") result = await recruitmentRead(c, tid);
      else if (view === "publications")
        result = { rows: await publishedJobSettings(c, tid) };
      else if (view === "hosted")
        result = {
          rows: await hostedList(c, tid),
          available: Boolean(
            (await first(
              c.db,
              "SELECT p.enabled FROM employee_verification_policy p JOIN secure_id_platform g ON g.id='cashfree' WHERE p.tenant_id=? AND p.enabled=1 AND p.digilocker_enabled=1 AND g.enabled=1 AND g.digilocker_enabled=1",
              tid,
            )) &&
            (cashfreeConfig().sandboxProducts?.includes("digilocker") ||
              cashfreeConfig().productionProducts?.includes("digilocker")),
          ),
        };
      else if (view === "notifications") {
        await scope(c, tid, "");
        await runDueJobs(c.db, jobConfig(), 3, tid);
        result = {
          rows: await all(
            c.db,
            "SELECT id,kind,resource_id,read_at,created_at FROM inapp_notifications WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50",
            tid,
            c.identity.userId,
          ),
        };
      } else
        result = await onboardingRead(
          c,
          privateConfig(),
          view,
          tid,
          Object.fromEntries(url.searchParams),
        );
      return Response.json(result, { headers: protectedHeaders() });
    }
    assertOrigin(request);
    const body = await readJsonBody(request, 32768),
      action = String(body.action),
      tenant = String(body.tenant ?? ""),
      data = body.data ?? {},
      minute = Math.floor(Date.now() / 60000),
      rate = await c.db
        .prepare(
          "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
        )
        .bind(`workflow:${c.identity.userId}`, minute)
        .first<{ count: number }>();
    if ((rate?.count ?? 0) > 30)
      throw new AppError(429, "Too many workflow actions.");
    let result: unknown;
    if (action === "claim")
      result = await claimOnboarding(
        c,
        String((data as { token?: string }).token),
      );
    else if (action === "document.review")
      result = await reviewDocument(c, tenant, data);
    else if (action === "document.retry_scan")
      result = await retryScan(c, tenant, String((data as { id?: string }).id));
    else if (action === "document.purge")
      result = await purgeDocuments(c, env.BUCKET, tenant);
    else if (action === "job.publish")
      result = await publishJob(c, tenant, data);
    else if (action.startsWith("interview.") || action.startsWith("offer."))
      result =
        action === "offer.accept"
          ? await onboardingAction(c, privateConfig(), action, tenant, data)
          : action === "interview.feedback"
            ? await submitInterviewFeedback(c, tenant, data)
            : await recruitmentAction(c, tenant, action, data);
    else if (action === "hosted.start")
      result = await hostedStart(
        c,
        privateConfig(),
        cashfreeConfig(),
        tenant,
        data,
      );
    else if (action === "hosted.inquire")
      result = await queueHostedInquiry(
        c,
        tenant,
        String((data as { id?: string }).id),
      );
    else if (action === "notification.read") {
      await scope(c, tenant, "");
      await stmt(
        c.db,
        "UPDATE inapp_notifications SET read_at=? WHERE id=? AND tenant_id=? AND user_id=?",
        now(),
        String((data as { id?: string }).id),
        tenant,
        c.identity.userId,
      ).run();
      result = { saved: true };
    } else
      result = await onboardingAction(c, privateConfig(), action, tenant, data);
    return Response.json(result, { headers: protectedHeaders() });
  } catch (e) {
    const status =
      e instanceof AppError
        ? e.status
        : e instanceof ZodError
          ? 422
          : e instanceof Error &&
              /UNIQUE|onboarding|document version/.test(e.message)
            ? 409
            : 500;
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : status === 422
              ? "Invalid workflow input."
              : status === 409
                ? "Record changed or approval requirements are incomplete."
                : "Workflow operation failed.",
      },
      { status, headers: protectedHeaders() },
    );
  }
}
export const GET = handle;
export const POST = handle;
