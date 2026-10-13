import { retrieveHosting } from "@/lib/hrms/hosting-provider";
import { env } from "cloudflare:workers";
import { serverContext } from "@/lib/hrms/server-auth";
import { domainAction, listDomains, dnsInstructions } from "@/lib/hrms/domains";
import { assertOrigin, readJsonBody, AppError } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const c = await serverContext(),
      config = {
        syncSecret: env.HRMS_DOMAIN_SYNC_SECRET,
        deploymentVersion: env.HRMS_DEPLOYMENT_VERSION,
        retrieveProvider:
          env.HRMS_DOMAIN_CF_READ_TOKEN &&
          env.HRMS_DOMAIN_CF_ZONE_ID &&
          env.HRMS_DEPLOYMENT_VERSION
            ? (id: string, host: string, tenant: string) =>
                retrieveHosting(
                  {
                    token: env.HRMS_DOMAIN_CF_READ_TOKEN,
                    zoneId: env.HRMS_DOMAIN_CF_ZONE_ID,
                    deploymentVersion: env.HRMS_DEPLOYMENT_VERSION,
                  },
                  id,
                  host,
                  tenant,
                )
            : undefined,
      };
    if (request.method === "GET") {
      const result = await listDomains(c, config);
      return Response.json(
        {
          ...result,
          rows: result.rows.map((r) => ({
            ...r,
            instructions: dnsInstructions(r),
          })),
        },
        { headers: protectedHeaders() },
      );
    }
    assertOrigin(request);
    const data = await readJsonBody(request, 32768);
    const minute = Math.floor(Date.now() / 60000);
    const rate = await c.db
      .prepare(
        "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
      )
      .bind(`domains:${c.identity.userId}`, minute)
      .first<{ count: number }>();
    if ((rate?.count ?? 0) > 20)
      throw new AppError(429, "Too many domain operations. Retry in a minute.");
    return Response.json(
      await domainAction(c, config, String(data.action), data),
      { headers: protectedHeaders() },
    );
  } catch (e) {
    const status =
      e instanceof AppError
        ? e.status
        : e instanceof ZodError
          ? 422
          : e instanceof Error && /UNIQUE/.test(e.message)
            ? 409
            : 500;
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : status === 409
              ? "Hostname is already reserved."
              : status === 422
                ? "Invalid domain request."
                : "Domain operation failed. Retry later.",
      },
      { status, headers: protectedHeaders() },
    );
  }
}
export const GET = handle;
export const POST = handle;
