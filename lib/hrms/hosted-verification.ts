import { z } from "zod";
import { AppError } from "./domain.ts";
import { apiSignature, credentials } from "./cashfree.ts";
import type { CashfreeConfig, CashfreeMode } from "./cashfree.ts";
export type HostedConfig = CashfreeConfig & {
  sandboxProducts?: string[];
  productionProducts?: string[];
  productionHostedHostname?: string;
};
async function call(
  config: HostedConfig,
  mode: CashfreeMode,
  method: "GET" | "POST",
  input: {
    verification_id: string;
    reference_id?: string;
    redirect_url?: string;
  },
) {
  if (
    !(
      mode === "sandbox" ? config.sandboxProducts : config.productionProducts
    )?.includes("digilocker")
  )
    throw new AppError(
      503,
      "DigiLocker account entitlement has not been validated for this environment.",
    );
  const c = credentials(config, mode),
    headers: Record<string, string> = {
      "x-client-id": c.clientId,
      "x-client-secret": c.clientSecret,
      accept: "application/json",
    };
  if (c.publicKey)
    headers["x-cf-signature"] = await apiSignature(c.clientId, c.publicKey);
  const url = new URL(
    `${mode === "sandbox" ? "https://sandbox.cashfree.com" : "https://api.cashfree.com"}/verification/digilocker`,
  );
  if (method === "GET")
    url.searchParams.set(
      "verification_id",
      z
        .string()
        .regex(/^[A-Za-z0-9._-]{1,50}$/)
        .parse(input.verification_id),
    );
  else headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await (config.fetcher ?? fetch)(url, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      body:
        method === "POST"
          ? JSON.stringify({
              verification_id: input.verification_id,
              document_requested: ["PAN"],
              redirect_url: input.redirect_url,
              user_flow: "signin",
            })
          : undefined,
    });
  } catch {
    throw new AppError(
      503,
      "Provider outcome is unknown. Query the original verification ID before starting another consent flow.",
    );
  }
  if (!response.ok)
    throw new AppError(
      response.status === 429 ? 429 : 502,
      "DigiLocker status is unavailable.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "Provider response is empty.");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 32768)
        throw new AppError(502, "Provider response exceeded the safety limit.");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError(502, "Provider response is malformed.");
  }
  return raw;
}
const base = z.object({
  verification_id: z.string(),
  reference_id: z.number().int().safe().positive(),
  status: z.string(),
  document_requested: z.array(z.string()),
});
export async function startHostedConsent(
  config: HostedConfig,
  mode: CashfreeMode,
  id: string,
  redirect: string,
) {
  const raw = await call(config, mode, "POST", {
      verification_id: id,
      redirect_url: redirect,
    }),
    r = base
      .extend({ url: z.string().url(), redirect_url: z.string() })
      .parse(raw),
    url = new URL(r.url);
  if (
    r.verification_id !== id ||
    r.status !== "PENDING" ||
    r.redirect_url !== redirect ||
    r.document_requested.length !== 1 ||
    r.document_requested[0] !== "PAN" ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname !==
      (mode === "sandbox"
        ? "verification-test.cashfree.com"
        : config.productionHostedHostname)
  )
    throw new AppError(
      502,
      "Hosted authorization response is mismatched or unsafe.",
    );
  return { reference: String(r.reference_id), url: r.url, status: "pending" };
}
export async function inquireHostedConsent(
  config: HostedConfig,
  mode: CashfreeMode,
  id: string,
  reference?: string,
) {
  const raw = await call(config, mode, "GET", { verification_id: id }),
    r = base
      .extend({
        status: z.enum([
          "PENDING",
          "AUTHENTICATED",
          "EXPIRED",
          "CONSENT_DENIED",
        ]),
        document_consent: z.array(z.string()).nullable(),
        document_consent_validity: z.string().datetime().nullable(),
      })
      .parse(raw);
  if (
    r.verification_id !== id ||
    (reference && String(r.reference_id) !== reference) ||
    r.document_requested.length !== 1 ||
    r.document_requested[0] !== "PAN"
  )
    throw new AppError(
      502,
      "Provider reference or requested product does not match.",
    );
  const granted =
    r.status === "AUTHENTICATED" &&
    r.document_consent?.includes("PAN") &&
    r.document_consent_validity &&
    Date.parse(r.document_consent_validity) > Date.now();
  return {
    reference: String(r.reference_id),
    status:
      r.status === "AUTHENTICATED"
        ? granted
          ? "consent_received"
          : "needs_manual_review"
        : r.status === "CONSENT_DENIED"
          ? "rejected"
          : r.status === "EXPIRED"
            ? "expired"
            : "pending",
    consentValidUntil: r.document_consent_validity,
    identityVerified: false,
  };
}
