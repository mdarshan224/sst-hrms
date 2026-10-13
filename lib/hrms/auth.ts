import { protectedHeaders } from "./security.ts";
import { z, ZodError } from "zod";
import { AppError, assertOrigin, tokenHash, readJsonBody } from "./domain.ts";
import type { Identity } from "./service.ts";
export type AuthConfig = {
  db: D1Database;
  apiKey: string;
  otpId: string;
  adminMobile: string;
  fetcher?: typeof fetch;
  legacyOwnerEmail?: string;
  realm?: string;
};
const SESSION_COOKIE = "__Host-hrms_session",
  CHALLENGE_COOKIE = "__Host-hrms_challenge";
export const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[ +()-]/g, "").replace(/^91(?=\d{10}$)/, ""))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
  );
const now = () => new Date().toISOString();
const random = () => crypto.randomUUID() + crypto.randomUUID();
export function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
const cookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
function response(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers(protectedHeaders());
  cookies.forEach((c) => headers.append("Set-Cookie", c));
  return Response.json(body, { status, headers });
}
async function audit(
  config: AuthConfig,
  actor: string,
  action: string,
  resource: string,
) {
  await config.db
    .prepare(
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) VALUES(?,NULL,?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actor, action, resource, "{}", now())
    .run();
}
async function throttle(
  config: AuthConfig,
  key: string,
  seconds: number,
  max: number,
) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const row = await config.db
    .prepare(
      "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    )
    .bind(key, window)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max)
    throw new AppError(429, "Too many attempts. Please try again later.");
}
async function provider(
  config: AuthConfig,
  path: "send" | "verify",
  body: Record<string, unknown>,
) {
  if (!config.apiKey || !config.otpId)
    throw new AppError(503, "OTP service is not configured.");
  let res: Response;
  try {
    res = await (config.fetcher ?? fetch)(
      `https://www.fast2sms.com/dev/otp/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: config.apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new AppError(
      503,
      "OTP provider is unavailable. Please retry shortly.",
    );
  }
  let result: { return?: boolean; status_code?: number; request_id?: string };
  try {
    result = (await res.json()) as typeof result;
  } catch {
    throw new AppError(502, "Unexpected OTP provider response.");
  }
  if (!res.ok || result.return !== true || result.status_code !== 200) {
    if (
      path === "verify" &&
      ([400, 404].includes(res.status) ||
        [400, 404].includes(result.status_code ?? 0))
    )
      throw new AppError(
        422,
        "The code is incorrect, expired or already used.",
      );
    throw new AppError(
      502,
      path === "send"
        ? "The OTP provider did not accept the request. Check the template, account balance and provider configuration."
        : "OTP verification was not confirmed.",
    );
  }
  return result;
}
export async function sessionIdentity(
  request: Request,
  config: AuthConfig,
): Promise<{ identity: Identity; sessionId: string } | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const user = await config.db
    .prepare(
      "SELECT u.id,u.mobile,u.email,u.display_name,s.id session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active' AND u.verified_at IS NOT NULL AND s.realm=?",
    )
    .bind(await tokenHash(token), now(), config.realm ?? "platform")
    .first<{
      id: string;
      mobile: string;
      email: string;
      display_name: string;
      session_id: string;
    }>();
  if (!user) return null;
  return {
    identity: {
      userId: user.id,
      mobile: user.mobile,
      email: user.email,
      displayName: user.display_name,
    },
    sessionId: user.session_id,
  };
}
export async function handleAuth(request: Request, config: AuthConfig) {
  try {
    if (request.method === "GET") {
      const session = await sessionIdentity(request, config);
      if (new URL(request.url).searchParams.get("view") === "sessions") {
        if (!session) throw new AppError(401, "Sign in to continue.");
        const rows = await config.db
          .prepare(
            "SELECT id,created_at,expires_at,revoked_at FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
          )
          .bind(session.identity.userId)
          .all();
        return response({
          sessions: rows.results,
          currentSessionId: session.sessionId,
        });
      }
      return response({
        authenticated: Boolean(session),
        user: session?.identity ?? null,
        configured: Boolean(
          config.apiKey && config.otpId && config.adminMobile,
        ),
      });
    }
    if (request.method !== "POST")
      return response({ error: "Method not allowed." }, 405);
    assertOrigin(request);
    const data = await readJsonBody(request, 4096);
    if (!data || typeof data.action !== "string")
      throw new AppError(422, "Invalid request.");
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const ipHash = await tokenHash(ip);
    if (data.action === "session.revoke" || data.action === "logout_all") {
      const session = await sessionIdentity(request, config);
      if (!session) throw new AppError(401, "Sign in to continue.");
      const revokeId =
        data.action === "session.revoke"
          ? z.string().uuid().parse(data.id)
          : null;
      if (
        revokeId &&
        !(await config.db
          .prepare("SELECT id FROM sessions WHERE user_id=? AND id=?")
          .bind(session.identity.userId, revokeId)
          .first())
      )
        throw new AppError(404, "Session not found.");
      const at = now();
      await config.db.batch([
        config.db
          .prepare(
            `UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL${revokeId ? " AND id=?" : ""}`,
          )
          .bind(at, session.identity.userId, ...(revokeId ? [revokeId] : [])),
        config.db
          .prepare(
            `UPDATE support_access SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL${revokeId ? " AND session_id=?" : ""}`,
          )
          .bind(at, session.identity.userId, ...(revokeId ? [revokeId] : [])),
      ]);
      await audit(
        config,
        session.identity.userId,
        data.action === "logout_all"
          ? "auth.all_sessions_revoked"
          : "auth.session_revoked",
        revokeId ?? session.identity.userId,
      );
      const clears = !revokeId || revokeId === session.sessionId;
      return response(
        { ok: true, signedOut: clears },
        200,
        clears
          ? [cookie(SESSION_COOKIE, "", 0), cookie(CHALLENGE_COOKIE, "", 0)]
          : [],
      );
    }
    if (data.action === "logout") {
      const session = await sessionIdentity(request, config);
      if (session) {
        await config.db.batch([
          config.db
            .prepare("UPDATE sessions SET revoked_at=? WHERE id=?")
            .bind(now(), session.sessionId),
          config.db
            .prepare(
              "UPDATE support_access SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL",
            )
            .bind(now(), session.sessionId),
        ]);
        await audit(
          config,
          session.identity.userId,
          "auth.logout",
          session.sessionId,
        );
      }
      return response({ ok: true }, 200, [
        cookie(SESSION_COOKIE, "", 0),
        cookie(CHALLENGE_COOKIE, "", 0),
      ]);
    }
    if (data.action === "send") {
      const mobile = mobileSchema.parse(data.mobile);
      await throttle(config, "otp-ip:" + ipHash, 3600, 12);
      await throttle(config, "otp-phone:" + (await tokenHash(mobile)), 3600, 6);
      const previous = await config.db
        .prepare("SELECT created_at FROM otp_challenges WHERE mobile=?")
        .bind(mobile)
        .first<{ created_at: string }>();
      if (
        previous &&
        Date.now() - new Date(previous.created_at).getTime() < 60000
      )
        throw new AppError(
          429,
          "Wait 60 seconds before requesting another code.",
        );
      const challenge = random(),
        hash = await tokenHash(challenge),
        at = now(),
        expires = new Date(Date.now() + 5 * 60000).toISOString();
      // The conditional write serializes requests across all Worker instances.
      const result = await config.db
        .prepare(
          "INSERT INTO otp_challenges(id,mobile,token_hash,state,attempts,expires_at,created_at,realm) VALUES(?,?,?,'sending',0,?,?,?) ON CONFLICT(mobile) DO UPDATE SET id=excluded.id,token_hash=excluded.token_hash,state='sending',attempts=0,request_id=NULL,realm=excluded.realm,expires_at=excluded.expires_at,created_at=excluded.created_at WHERE otp_challenges.created_at<?",
        )
        .bind(
          crypto.randomUUID(),
          mobile,
          hash,
          expires,
          at,
          config.realm ?? "platform",
          new Date(Date.now() - 60000).toISOString(),
        )
        .run();
      if (!result.meta.changes)
        throw new AppError(
          429,
          "Wait 60 seconds before requesting another code.",
        );
      let sent;
      try {
        sent = await provider(config, "send", {
          mobile,
          otp_id: config.otpId,
          otp_expiry: 5,
          otp_length: 6,
        });
      } catch (e) {
        await config.db
          .prepare(
            "UPDATE otp_challenges SET state='failed' WHERE token_hash=?",
          )
          .bind(hash)
          .run();
        await audit(
          config,
          "anonymous",
          "auth.otp_send_failed",
          hash.slice(0, 12),
        );
        throw e;
      }
      await config.db
        .prepare(
          "UPDATE otp_challenges SET state='sent',request_id=? WHERE token_hash=? AND state='sending'",
        )
        .bind(sent.request_id ?? null, hash)
        .run();
      await audit(
        config,
        "anonymous",
        "auth.otp_provider_accepted",
        hash.slice(0, 12),
      );
      return response(
        { accepted: true, expiresIn: 300, resendAfter: 60, mobile },
        200,
        [cookie(CHALLENGE_COOKIE, challenge, 300)],
      );
    }
    if (data.action === "verify") {
      await throttle(config, "verify-ip:" + ipHash, 3600, 40);
      const mobile = mobileSchema.parse(data.mobile),
        otp = z
          .string()
          .regex(/^\d{6}$/, "Enter the 6-digit code.")
          .parse(data.otp),
        token = cookieValue(request, CHALLENGE_COOKIE);
      if (!token || token.length > 100)
        throw new AppError(403, "Start a new sign-in request on this device.");
      const hash = await tokenHash(token);
      const challenge = await config.db
        .prepare(
          "SELECT id,attempts FROM otp_challenges WHERE mobile=? AND token_hash=? AND state='sent' AND expires_at>? AND attempts<5 AND realm=?",
        )
        .bind(mobile, hash, now(), config.realm ?? "platform")
        .first<{ id: string; attempts: number }>();
      if (!challenge)
        throw new AppError(
          403,
          "The login request expired or reached its attempt limit.",
        );
      // Lock verification. Parallel requests cannot call the provider for this challenge.
      const lock = await config.db
        .prepare(
          "UPDATE otp_challenges SET state='verifying',attempts=attempts+1 WHERE id=? AND token_hash=? AND state='sent' AND expires_at>? AND attempts<5",
        )
        .bind(challenge.id, hash, now())
        .run();
      if (!lock.meta.changes)
        throw new AppError(409, "This code is already being checked.");
      try {
        await provider(config, "verify", { mobile, otp });
      } catch (e) {
        await config.db
          .prepare(
            "UPDATE otp_challenges SET state=CASE WHEN attempts>=5 THEN 'locked' ELSE 'sent' END WHERE id=? AND state='verifying'",
          )
          .bind(challenge.id)
          .run();
        await audit(
          config,
          "anonymous",
          "auth.otp_verify_failed",
          hash.slice(0, 12),
        );
        throw e;
      }
      const userId = crypto.randomUUID(),
        sessionId = crypto.randomUUID(),
        sessionToken = random(),
        sessionHash = await tokenHash(sessionToken),
        at = now(),
        maxAge = mobile === config.adminMobile ? 3600 : 43200,
        expires = new Date(Date.now() + maxAge * 1000).toISOString();
      const displayName =
        mobile === config.adminMobile
          ? "SohanSoft Super Admin"
          : `Member • ${mobile.slice(-4)}`;
      const results = await config.db.batch([
        config.db
          .prepare(
            "UPDATE otp_challenges SET state='consumed' WHERE id=? AND token_hash=? AND state='verifying' AND expires_at>?",
          )
          .bind(challenge.id, hash, at),
        config.db
          .prepare(
            "INSERT INTO users(id,mobile,display_name,verified_at,created_at) SELECT ?,?,?,?,? WHERE changes()=1 ON CONFLICT(mobile) DO UPDATE SET verified_at=excluded.verified_at",
          )
          .bind(userId, mobile, displayName, at, at),
        config.db
          .prepare(
            "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,realm) SELECT ?,id,?,?,?,? FROM users WHERE mobile=? AND status='active' AND EXISTS(SELECT 1 FROM otp_challenges WHERE id=? AND state='consumed' AND token_hash=?)",
          )
          .bind(
            sessionId,
            sessionHash,
            expires,
            at,
            config.realm ?? "platform",
            mobile,
            challenge.id,
            hash,
          ),
        config.db
          .prepare(
            "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,NULL,user_id,'auth.login',id,'{}',? FROM sessions WHERE id=?",
          )
          .bind(crypto.randomUUID(), at, sessionId),
      ]);
      if (!results[0].meta.changes || !results[2].meta.changes)
        throw new AppError(
          403,
          "Sign-in could not be completed. Request another code.",
        );
      // Explicit one-time migration: only the configured Super Admin mobile can inherit the previous platform owner's memberships.
      if (
        (config.realm ?? "platform") === "platform" &&
        mobile === config.adminMobile &&
        config.legacyOwnerEmail
      ) {
        const migrated = await config.db
          .prepare(
            "UPDATE memberships SET user_id=(SELECT id FROM users WHERE mobile=?) WHERE email=? AND user_id NOT IN(SELECT id FROM users) AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=memberships.tenant_id AND m.user_id=(SELECT id FROM users WHERE mobile=?))",
          )
          .bind(mobile, config.legacyOwnerEmail.toLowerCase(), mobile)
          .run();
        if (migrated.meta.changes) {
          const account = await config.db
            .prepare("SELECT user_id FROM sessions WHERE id=?")
            .bind(sessionId)
            .first<{ user_id: string }>();
          await audit(
            config,
            account?.user_id ?? userId,
            "auth.legacy_memberships_migrated",
            String(migrated.meta.changes),
          );
        }
      }
      return response({ verified: true }, 200, [
        cookie(SESSION_COOKIE, sessionToken, maxAge),
        cookie(CHALLENGE_COOKIE, "", 0),
      ]);
    }
    throw new AppError(404, "Unknown authentication operation.");
  } catch (e) {
    if (e instanceof AppError) return response({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return response({ error: e.issues.map((i) => i.message).join(" ") }, 422);
    console.error(
      "Authentication failed",
      e instanceof Error ? e.name : "UnknownError",
    );
    return response(
      { error: "Authentication is temporarily unavailable." },
      500,
    );
  }
}

export function safeReturnTo(value: string | undefined) {
  try {
    const url = new URL(value ?? "/", "https://hrms.internal");
    if (
      !value?.startsWith("/") ||
      url.origin !== "https://hrms.internal" ||
      url.pathname.startsWith("/login")
    )
      return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
