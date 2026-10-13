import { AppError } from "./domain.ts";
export async function requestBytes(
  request: Pick<Request, "body">,
  limit: number,
) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(422, "Empty request body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > limit) throw new AppError(413, "Request body is too large.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
