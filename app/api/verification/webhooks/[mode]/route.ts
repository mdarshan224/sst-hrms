import { env } from "cloudflare:workers";
import { cashfreeConfig } from "@/lib/hrms/cashfree-config";
import { receiveSecureIdWebhook } from "@/lib/hrms/verification";
import { AppError } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ mode: string }> },
) {
  try {
    const { mode } = await params;
    if (mode !== "sandbox" && mode !== "production")
      throw new AppError(404, "Webhook mode not found.");
    if (!env.DB) throw new AppError(503, "Database unavailable.");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError(422, "Empty webhook body.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.length;
        if (total > 65536) throw new AppError(413, "Webhook body too large.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const raw = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    return Response.json(
      await receiveSecureIdWebhook(
        { db: env.DB },
        cashfreeConfig(),
        mode,
        raw,
        request.headers.get("x-webhook-timestamp") ?? "",
        request.headers.get("x-webhook-signature") ?? "",
      ),
      { headers: protectedHeaders() },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "Webhook rejected." },
      {
        status: e instanceof AppError ? e.status : 500,
        headers: protectedHeaders(),
      },
    );
  }
}
