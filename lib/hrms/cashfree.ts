import { z } from "zod";
import { AppError } from "./domain.ts";
export type CashfreeMode = "sandbox" | "production";
export type CashfreeCredentials = {
  clientId?: string;
  clientSecret?: string;
  publicKey?: string;
};
export type CashfreeConfig = {
  sandbox: CashfreeCredentials;
  production: CashfreeCredentials;
  productionApproved?: boolean;
  sandboxProducts?: string[];
  productionProducts?: string[];
  fetcher?: typeof fetch;
};
export const panRequest = z.object({
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/)),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(Date.parse(v)) &&
        new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v &&
        Date.parse(v) < Date.now(),
    ),
  name: z.string().trim().min(2).max(160),
  verification_id: z.string().regex(/^[A-Za-z0-9._-]{1,50}$/),
});
const panResponse = z.object({
  reference_id: z.number().int().positive().safe(),
  verification_id: z.string(),
  pan: z.string(),
  name: z.string().max(160),
  name_match: z.enum(["Y", "N"]),
  dob_match: z.enum(["Y", "N"]),
  pan_status: z.string().max(3),
  status: z.enum(["VALID", "INVALID"]),
});
export function credentialStatus(config: CashfreeConfig, mode: CashfreeMode) {
  const c = config[mode];
  return {
    configured: Boolean(c.clientId && c.clientSecret),
    clientIdentifier: c.clientId ? `••••${c.clientId.slice(-4)}` : null,
    publicKeyConfigured: Boolean(c.publicKey),
    productionApproved:
      mode === "production" && Boolean(config.productionApproved),
  };
}
export function credentials(config: CashfreeConfig, mode: CashfreeMode) {
  const c = config[mode];
  if (!c.clientId || !c.clientSecret)
    throw new AppError(
      503,
      "Cashfree Secure ID credentials are not configured for this mode.",
    );
  if (mode === "production" && (!config.productionApproved || !c.publicKey))
    throw new AppError(
      503,
      "Production Secure ID requires validated account/products and registered RSA public-key authentication. Workers static egress is not assumed.",
    );
  return c as Required<Pick<CashfreeCredentials, "clientId" | "clientSecret">> &
    CashfreeCredentials;
}
export async function apiSignature(clientId: string, pem: string) {
  try {
    const der = Uint8Array.from(
      atob(
        pem.replace(
          /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
          "",
        ),
      ),
      (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSA-OAEP", hash: "SHA-1" },
      false,
      ["encrypt"],
    );
    const encrypted = await crypto.subtle.encrypt(
      "RSA-OAEP",
      key,
      new TextEncoder().encode(`${clientId}.${Math.floor(Date.now() / 1000)}`),
    );
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  } catch {
    throw new AppError(
      503,
      "Cashfree RSA public key is invalid or unsupported.",
    );
  }
}
export async function verifyPan(
  config: CashfreeConfig,
  mode: CashfreeMode,
  input: unknown,
) {
  const v = panRequest.parse(input),
    c = credentials(config, mode),
    headers: Record<string, string> = {
      "x-client-id": c.clientId,
      "x-client-secret": c.clientSecret,
      "Content-Type": "application/json",
      accept: "application/json",
    };
  if (c.publicKey)
    headers["x-cf-signature"] = await apiSignature(c.clientId, c.publicKey);
  let r: Response;
  try {
    r = await (config.fetcher ?? fetch)(
      `${mode === "sandbox" ? "https://sandbox.cashfree.com" : "https://api.cashfree.com"}/verification/pan-lite`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(v),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new AppError(
      503,
      "Cashfree response is unavailable; this request must be reconciled before resubmission.",
    );
  }
  if (!r.ok)
    throw new AppError(
      r.status === 429 ? 429 : 502,
      "Cashfree did not confirm verification. Do not automatically retry this operation.",
    );
  const reader = r.body?.getReader();
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  if (!reader) throw new AppError(502, "Empty provider response.");
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 16384)
        throw new AppError(502, "Provider response exceeded limit.");
      text += decoder.decode(item.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  let parsed;
  try {
    parsed = panResponse.parse(JSON.parse(text));
  } catch {
    throw new AppError(
      502,
      "Cashfree response was inconclusive or malformed; reconcile before retrying.",
    );
  }
  if (
    parsed.verification_id !== v.verification_id ||
    parsed.pan.toUpperCase() !== v.pan
  )
    throw new AppError(502, "Cashfree response does not match this request.");
  const normalize = (name: string) =>
    name
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const nameMatched =
      parsed.name_match === "Y" && normalize(parsed.name) === normalize(v.name),
    dobMatched = parsed.dob_match === "Y";
  const a = normalize(parsed.name),
    b = normalize(v.name),
    distance = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = distance[0];
    distance[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const before = distance[i];
      distance[i] = Math.min(
        distance[i] + 1,
        distance[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = before;
    }
  }
  const nameScore = Math.round(
    100 * (1 - distance[a.length] / Math.max(1, a.length, b.length)),
  );
  return {
    nameScore,
    referenceId: String(parsed.reference_id),
    verificationId: v.verification_id,
    maskedIdentifier: "******" + v.pan.slice(-4),
    outcome:
      parsed.status === "INVALID"
        ? "failed"
        : parsed.pan_status === "E" && nameMatched && dobMatched
          ? "verified"
          : "needs_manual_review",
    nameMatched,
    dobMatched,
    panStatus: parsed.pan_status,
  };
}
export async function verifySecureIdWebhook(
  raw: Uint8Array,
  timestamp: string,
  signature: string,
  secret: string,
) {
  if (!/^\d{10,13}$/.test(timestamp) || !secret) return false;
  const time = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (Math.abs(Date.now() - time) > 10 * 60000) return false;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    ),
    prefix = new TextEncoder().encode(timestamp),
    input = new Uint8Array(prefix.length + raw.length);
  input.set(prefix);
  input.set(raw, prefix.length);
  return crypto.subtle.verify("HMAC", key, bytes, input);
}
