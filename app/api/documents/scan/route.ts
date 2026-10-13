import { env } from "cloudflare:workers";
import { requestBytes } from "@/lib/hrms/request-bytes";
import { acceptScan } from "@/lib/hrms/documents";
import { AppError } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!env.DB) throw new AppError(503, "Database unavailable.");
    const raw = await requestBytes(request, 4096);
    return Response.json(
      await acceptScan(
        { db: env.DB },
        env.DOCUMENT_SCAN_CALLBACK_SECRET,
        raw,
        request.headers.get("x-scan-timestamp") ?? "",
        request.headers.get("x-scan-signature") ?? "",
      ),
      { headers: protectedHeaders() },
    );
  } catch (e) {
    return Response.json(
      {
        error: e instanceof AppError ? e.message : "Scanner receipt rejected.",
      },
      {
        status:
          e instanceof AppError ? e.status : e instanceof ZodError ? 422 : 500,
        headers: protectedHeaders(),
      },
    );
  }
}
