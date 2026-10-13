import { env } from "cloudflare:workers";
import { tenantRequest } from "@/lib/hrms/tenant-context";
import { publicJobs, publicApplication } from "@/lib/hrms/careers";
import { AppError, assertOrigin, readJsonBody } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { digestText } from "@/lib/hrms/private-config";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    if (!env.DB) throw new AppError(503, "Database unavailable.");
    const slug = new URL(request.url).searchParams.get("slug") ?? "",
      bound = tenantRequest()?.tenantId;
    if (request.method === "GET")
      return Response.json(await publicJobs(env.DB, slug, bound), {
        headers: protectedHeaders(),
      });
    assertOrigin(request);
    const data = await readJsonBody(request, 4096),
      window = Math.floor(Date.now() / 60000),
      key =
        "careers:" +
        (await digestText(
          request.headers.get("cf-connecting-ip") ?? "unavailable",
        )),
      r = await env.DB.prepare(
        "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
      )
        .bind(key, window)
        .first<{ count: number }>();
    if ((r?.count ?? 0) > 5)
      throw new AppError(429, "Too many applications. Retry later.");
    return Response.json(await publicApplication(env.DB, slug, bound, data), {
      headers: protectedHeaders(),
    });
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
              ? "An application already exists for this opening."
              : status === 422
                ? "Invalid application."
                : "Careers request failed.",
      },
      { status, headers: protectedHeaders() },
    );
  }
}
export const GET = handle;
export const POST = handle;
