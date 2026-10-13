import { serverContext } from "@/lib/hrms/server-auth";
import { privateConfig } from "@/lib/hrms/workflow-runtime";
import { hostedAuthorization } from "@/lib/hrms/hosted-flow";
import { AppError } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const c = await serverContext(),
      url = new URL(request.url),
      destination = await hostedAuthorization(
        c,
        privateConfig(),
        url.searchParams.get("tenant") ?? "",
        url.searchParams.get("id") ?? "",
      );
    return new Response(null, {
      status: 303,
      headers: { ...protectedHeaders(), Location: destination },
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof AppError ? e.message : "Authorization unavailable.",
      },
      {
        status: e instanceof AppError ? e.status : 500,
        headers: protectedHeaders(),
      },
    );
  }
}
