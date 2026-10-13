import { env } from "cloudflare:workers";
import { serverContext } from "@/lib/hrms/server-auth";
import { AppError, assertOrigin } from "@/lib/hrms/domain";
import { protectedHeaders } from "@/lib/hrms/security";
import { requestBytes } from "@/lib/hrms/request-bytes";
import {
  documentList,
  uploadDocument,
  downloadDocument,
  deleteDocument,
  DOCUMENT_LIMIT,
} from "@/lib/hrms/documents";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const c = await serverContext(),
      url = new URL(request.url),
      tid = url.searchParams.get("tenant") ?? "",
      did = url.searchParams.get("id") ?? "";
    if (request.method === "GET") {
      if (!did)
        return Response.json(
          {
            rows: await documentList(c, tid, {
              caseId: url.searchParams.get("caseId") ?? undefined,
              employeeId: url.searchParams.get("employeeId") ?? undefined,
            }),
          },
          { headers: protectedHeaders() },
        );
      const file = await downloadDocument(c, env.BUCKET, tid, did);
      return new Response(file.body, {
        headers: {
          ...protectedHeaders(),
          "Content-Type": file.mime,
          "Content-Disposition": 'attachment; filename="employee-document"',
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    assertOrigin(request);
    const minute = Math.floor(Date.now() / 60000),
      rate = await c.db
        .prepare(
          "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
        )
        .bind(`documents:${c.identity.userId}`, minute)
        .first<{ count: number }>();
    if ((rate?.count ?? 0) > 10)
      throw new AppError(429, "Too many document operations.");
    if (request.method === "DELETE")
      return Response.json(await deleteDocument(c, env.BUCKET, tid, did), {
        headers: protectedHeaders(),
      });
    const bytes = await requestBytes(request, DOCUMENT_LIMIT + 65536),
      form = await new Request("https://form.internal/", {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
        body: bytes,
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File))
      throw new AppError(422, "Choose a document file.");
    return Response.json(
      await uploadDocument(
        c,
        env.BUCKET,
        String(form.get("tenant") ?? ""),
        {
          requestId: form.get("requestId"),
          category: form.get("category"),
          filename: file.name,
          mime: file.type,
          caseId: form.get("caseId") || undefined,
          replacesId: form.get("replacesId") || undefined,
        },
        new Uint8Array(await file.arrayBuffer()),
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
              ? "Invalid document request."
              : status === 409
                ? "Upload is already in progress."
                : "Document operation failed.",
      },
      { status, headers: protectedHeaders() },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
