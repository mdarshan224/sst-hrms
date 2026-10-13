import { tenantRequest } from "./tenant-context";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "./domain";
import { sessionIdentity } from "./auth";
import type { AuthConfig } from "./auth";
export function authConfig(): AuthConfig {
  if (!env.DB) throw new AppError(503, "Database is not configured.");
  return {
    db: env.DB,
    apiKey: env.FAST2SMS_API_KEY ?? "",
    otpId: env.FAST2SMS_OTP_ID ?? "",
    adminMobile: env.PLATFORM_ADMIN_MOBILE ?? "",
    realm: tenantRequest()?.realm ?? "platform",
    legacyOwnerEmail: env.PLATFORM_OWNER_EMAIL ?? "",
  };
}
export async function currentSession() {
  const h = await headers();
  return sessionIdentity(
    new Request("https://hrms.internal/", {
      headers: { cookie: h.get("cookie") ?? "" },
    }),
    authConfig(),
  );
}
export async function requireSession(next = "/") {
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

export async function serverContext() {
  const session = await currentSession();
  if (!session) throw new AppError(401, "Sign in to continue.");
  const config = authConfig();
  return {
    db: config.db,
    identity: session.identity,
    sessionId: session.sessionId,
    adminMobile: config.adminMobile,
    boundTenantId: tenantRequest()?.tenantId,
    deploymentVersion: env.HRMS_DEPLOYMENT_VERSION,
  };
}
