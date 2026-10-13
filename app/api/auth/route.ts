import { handleAuth } from "@/lib/hrms/auth";
import { authConfig } from "@/lib/hrms/server-auth";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return handleAuth(request, authConfig());
  } catch {
    return Response.json(
      { error: "Authentication service is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
