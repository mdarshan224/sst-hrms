import { serverContext } from "@/lib/hrms/server-auth";
import { cashfreeConfig } from "@/lib/hrms/cashfree-config";
import { verificationRead, verificationAction } from "@/lib/hrms/verification";
import { AppError, assertOrigin, readJsonBody } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const c = await serverContext(),
      config = cashfreeConfig(),
      url = new URL(request.url);
    if (request.method === "GET")
      return Response.json(
        await verificationRead(
          c,
          config,
          url.searchParams.get("view") ?? "self",
          url.searchParams.get("tenant") ?? "",
          Object.fromEntries(url.searchParams),
        ),
        { headers: protectedHeaders() },
      );
    assertOrigin(request);
    const body = await readJsonBody(request, 8192),
      minute = Math.floor(Date.now() / 60000),
      rate = await c.db
        .prepare(
          "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
        )
        .bind(`verification:${c.identity.userId}`, minute)
        .first<{ count: number }>();
    if ((rate?.count ?? 0) > 10)
      throw new AppError(
        429,
        "Too many verification actions. Retry in a minute.",
      );
    return Response.json(
      await verificationAction(
        c,
        config,
        String(body.action),
        String(body.tenant ?? ""),
        body.data,
      ),
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
            : status === 422
              ? "Invalid verification request."
              : status === 409
                ? "A verification is already in progress."
                : "Verification operation failed.",
      },
      { status, headers: protectedHeaders() },
    );
  }
}
export const GET = handle;
export const POST = handle;
