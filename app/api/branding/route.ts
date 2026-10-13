import { tenantRequest } from "@/lib/hrms/tenant-context";
import { resolveWorkspaceSlug } from "@/lib/hrms/workspace-links";
import { authConfig } from "@/lib/hrms/server-auth";
import { logoResponse } from "@/lib/hrms/branding";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const company = new URL(request.url).searchParams.get("company") ?? "";
    const bound = tenantRequest()?.tenantId;
    if (
      bound &&
      (await resolveWorkspaceSlug(authConfig().db, company))?.id !== bound
    )
      return new Response("Unavailable", { status: 404 });
    return await logoResponse(
      authConfig().db,
      new URL(request.url).searchParams.get("company") ?? "",
    );
  } catch {
    return new Response("Logo unavailable", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
