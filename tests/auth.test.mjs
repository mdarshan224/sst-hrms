import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1-adapter.mjs";
import {
  handleAuth,
  sessionIdentity,
  mobileSchema,
  safeReturnTo,
} from "../lib/hrms/auth.ts";
import {
  mutate,
  readWorkspace,
  bootstrap,
  isPlatform,
} from "../lib/hrms/service.ts";

const rootMobile = "7676272709";
const request = (
  action,
  body = {},
  cookie = "",
  origin = "https://hrms.example.test",
) =>
  new Request("https://hrms.example.test/api/auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie,
      "cf-connecting-ip": "192.0.2.10",
    },
    body: JSON.stringify({ action, ...body }),
  });
const cookie = (response, prefix) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(prefix + "="))
    ?.split(";")[0] ?? "";
const fixture = (fetcher) => {
  const { db, sql } = database();
  const calls = [];
  return {
    db,
    sql,
    calls,
    config: {
      db,
      apiKey: "test-provider-key",
      otpId: "test-template",
      adminMobile: rootMobile,
      fetcher:
        fetcher ??
        (async (url, options) => {
          calls.push({ url, options });
          return Response.json({
            return: true,
            status_code: 200,
            request_id: "test-request",
          });
        }),
    },
  };
};
async function login(s, mobile = rootMobile) {
  const sent = await handleAuth(request("send", { mobile }), s.config);
  assert.equal(sent.status, 200);
  const challenge = cookie(sent, "__Host-hrms_challenge");
  const verified = await handleAuth(
    request("verify", { mobile, otp: "654321" }, challenge),
    s.config,
  );
  assert.equal(verified.status, 200);
  const sessionCookie = cookie(verified, "__Host-hrms_session");
  const identity = await sessionIdentity(
    new Request("https://hrms.example.test/", {
      headers: { cookie: sessionCookie },
    }),
    s.config,
  );
  return { challenge, verified, sessionCookie, ...identity };
}
const context = (s, login) => ({
  db: s.db,
  identity: login.identity,
  sessionId: login.sessionId,
  adminMobile: rootMobile,
});

test("SmartOTP send calls only the documented provider endpoint and hides credentials", async () => {
  const s = fixture();
  const res = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  assert.equal(res.status, 200);
  assert.equal(s.calls[0].url, "https://www.fast2sms.com/dev/otp/send");
  assert.equal(s.calls[0].options.headers.Authorization, "test-provider-key");
  assert.deepEqual(JSON.parse(s.calls[0].options.body), {
    mobile: rootMobile,
    otp_id: "test-template",
    otp_expiry: 5,
    otp_length: 6,
  });
  assert.ok(!JSON.stringify(await res.json()).includes("test-provider-key"));
  assert.match(
    res.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
});
test("provider failure never claims an OTP was accepted and never creates a session", async () => {
  const s = fixture(async () =>
    Response.json(
      { return: false, status_code: 401, message: "provider detail" },
      { status: 401 },
    ),
  );
  const res = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  assert.equal(res.status, 502);
  assert.ok(!(await res.json()).accepted);
  assert.equal(res.headers.getSetCookie().length, 0);
  assert.equal(s.sql.prepare("SELECT count(*) c FROM sessions").get().c, 0);
  assert.equal(
    s.sql.prepare("SELECT state FROM otp_challenges").get().state,
    "failed",
  );
});
test("malformed provider response fails closed", async () => {
  const s = fixture(async () => new Response("not-json"));
  assert.equal(
    (await handleAuth(request("send", { mobile: rootMobile }), s.config))
      .status,
    502,
  );
});
test("missing provider configuration fails closed", async () => {
  const s = fixture();
  s.config.apiKey = "";
  assert.equal(
    (await handleAuth(request("send", { mobile: rootMobile }), s.config))
      .status,
    503,
  );
  assert.equal(s.calls.length, 0);
});
test("only confirmed OTP verification creates a hashed secure session", async () => {
  const s = fixture();
  const signed = await login(s);
  assert.equal(signed.identity.mobile, rootMobile);
  assert.equal(isPlatform(context(s, signed)), true);
  assert.equal(s.calls[1].url, "https://www.fast2sms.com/dev/otp/verify");
  assert.deepEqual(JSON.parse(s.calls[1].options.body), {
    mobile: rootMobile,
    otp: "654321",
  });
  const rows = s.sql.prepare("SELECT * FROM sessions").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash.length, 64);
  assert.ok(!JSON.stringify(rows).includes(signed.sessionCookie.split("=")[1]));
  assert.ok(
    !JSON.stringify(
      s.sql.prepare("SELECT * FROM otp_challenges").all(),
    ).includes("654321"),
  );
  assert.match(
    signed.verified.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-hrms_session=")),
    /Max-Age=3600/,
  );
});
test("OTP challenge cannot be used without device cookie or for another mobile", async () => {
  const s = fixture();
  const sent = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  const challenge = cookie(sent, "__Host-hrms_challenge");
  assert.equal(
    (
      await handleAuth(
        request("verify", { mobile: rootMobile, otp: "654321" }),
        s.config,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleAuth(
        request("verify", { mobile: "9876543210", otp: "654321" }, challenge),
        s.config,
      )
    ).status,
    403,
  );
  assert.equal(s.calls.length, 1);
});
test("consumed OTP challenge cannot create a second session", async () => {
  const s = fixture();
  const signed = await login(s);
  assert.equal(
    (
      await handleAuth(
        request(
          "verify",
          { mobile: rootMobile, otp: "654321" },
          signed.challenge,
        ),
        s.config,
      )
    ).status,
    403,
  );
  assert.equal(s.sql.prepare("SELECT count(*) c FROM sessions").get().c, 1);
  assert.equal(s.calls.length, 2);
});
test("five invalid OTP attempts lock challenge and block further provider calls", async () => {
  let calls = 0;
  const s = fixture(async (url) => {
    calls++;
    return url.endsWith("/send")
      ? Response.json({ return: true, status_code: 200, request_id: "test" })
      : Response.json({ return: false, status_code: 400 }, { status: 400 });
  });
  const sent = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  const challenge = cookie(sent, "__Host-hrms_challenge");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await handleAuth(
          request("verify", { mobile: rootMobile, otp: "000000" }, challenge),
          s.config,
        )
      ).status,
      422,
    );
  assert.equal(
    (
      await handleAuth(
        request("verify", { mobile: rootMobile, otp: "654321" }, challenge),
        s.config,
      )
    ).status,
    403,
  );
  assert.equal(calls, 6);
  assert.equal(
    s.sql.prepare("SELECT state FROM otp_challenges").get().state,
    "locked",
  );
  assert.equal(s.sql.prepare("SELECT count(*) c FROM sessions").get().c, 0);
});
test("expiry and resend invalidate stale challenges", async () => {
  const s = fixture();
  const sent = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  const old = cookie(sent, "__Host-hrms_challenge");
  assert.equal(
    (await handleAuth(request("send", { mobile: rootMobile }), s.config))
      .status,
    429,
  );
  s.sql.exec(
    "UPDATE otp_challenges SET created_at='2000-01-01T00:00:00Z',expires_at='2000-01-01T00:00:00Z'",
  );
  assert.equal(
    (
      await handleAuth(
        request("verify", { mobile: rootMobile, otp: "654321" }, old),
        s.config,
      )
    ).status,
    403,
  );
  const fresh = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  assert.equal(fresh.status, 200);
  assert.notEqual(cookie(fresh, "__Host-hrms_challenge"), old);
  assert.equal(
    (
      await handleAuth(
        request("verify", { mobile: rootMobile, otp: "654321" }, old),
        s.config,
      )
    ).status,
    403,
  );
});
test("parallel verification cannot invoke provider twice", async () => {
  const s = fixture();
  const sent = await handleAuth(
    request("send", { mobile: rootMobile }),
    s.config,
  );
  const challenge = cookie(sent, "__Host-hrms_challenge");
  let release;
  const pause = new Promise((resolve) => {
    release = resolve;
  });
  const base = s.config.fetcher;
  s.config.fetcher = async (url, options) => {
    if (url.endsWith("/verify")) await pause;
    return base(url, options);
  };
  const first = handleAuth(
    request("verify", { mobile: rootMobile, otp: "654321" }, challenge),
    s.config,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await handleAuth(
    request("verify", { mobile: rootMobile, otp: "654321" }, challenge),
    s.config,
  );
  assert.ok([403, 409].includes(second.status));
  release();
  assert.equal((await first).status, 200);
  assert.equal(s.sql.prepare("SELECT count(*) c FROM sessions").get().c, 1);
});
test("forged, expired, revoked and suspended-user sessions are rejected", async () => {
  const s = fixture();
  const signed = await login(s);
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: "__Host-hrms_session=forged" },
      }),
      s.config,
    ),
    null,
  );
  s.sql.exec("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z'");
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: signed.sessionCookie },
      }),
      s.config,
    ),
    null,
  );
  s.sql.exec(
    "UPDATE sessions SET expires_at='2099-01-01T00:00:00Z'; UPDATE users SET status='suspended'",
  );
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: signed.sessionCookie },
      }),
      s.config,
    ),
    null,
  );
});
test("OTP-verified company administrator sees only their assigned company", async () => {
  const s = fixture();
  const signed = await login(s);
  const owner = context(s, signed);
  await mutate(owner, "tenant.create", "", {
    name: "Alpha Ltd",
    slug: "alpha-ltd",
    adminMobile: "9876543210",
    adminEmail: "admin@alpha.test",
  });
  await mutate(owner, "tenant.create", "", {
    name: "Beta Ltd",
    slug: "beta-ltd",
    adminMobile: "9123456789",
  });
  const company = await login(s, "9876543210");
  const boot = await bootstrap(context(s, company));
  assert.equal(boot.platform, false);
  assert.equal(boot.workspaces.length, 1);
  assert.equal(boot.workspaces[0].slug, "alpha-ltd");
});
test("Super Admin company access requires a reason, is session-bound, expires and is audited", async () => {
  const s = fixture();
  const signed = await login(s);
  const owner = context(s, signed);
  const t = await mutate(owner, "tenant.create", "", {
    name: "Customer Ltd",
    slug: "customer-ltd",
    adminMobile: "9876543210",
  });
  await assert.rejects(
    () => readWorkspace(owner, t.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () => mutate(owner, "support.open", "", { id: t.id, reason: "" }),
    (e) => e.status === 422,
  );
  await mutate(owner, "support.open", "", {
    id: t.id,
    reason: "Review company configuration",
  });
  assert.equal(
    (await readWorkspace(owner, t.id)).tenant.role_name,
    "Platform support",
  );
  assert.equal((await bootstrap(owner)).workspaces.length, 1);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE tenant_id=? AND action='support.access_opened'",
      )
      .get(t.id).c,
    1,
  );
  await assert.rejects(
    () => readWorkspace({ ...owner, sessionId: "other-session" }, t.id),
    (e) => e.status === 404,
  );
  s.sql.exec("UPDATE support_access SET expires_at='2000-01-01T00:00:00Z'");
  await assert.rejects(
    () => readWorkspace(owner, t.id),
    (e) => e.status === 404,
  );
});
test("company users cannot open Super Admin support access", async () => {
  const s = fixture();
  const signed = await login(s);
  const t = await mutate(context(s, signed), "tenant.create", "", {
    name: "Customer Ltd",
    slug: "customer-ltd",
    adminMobile: "9876543210",
  });
  const company = await login(s, "9876543210");
  await assert.rejects(
    () =>
      mutate(context(s, company), "support.open", "", {
        id: t.id,
        reason: "Try admin access",
      }),
    (e) => e.status === 403,
  );
});
test("ending support access removes company scope without deleting company data", async () => {
  const s = fixture();
  const signed = await login(s),
    owner = context(s, signed);
  const t = await mutate(owner, "tenant.create", "", {
    name: "Customer Ltd",
    slug: "customer-ltd",
    adminMobile: "9876543210",
  });
  await mutate(owner, "support.open", "", {
    id: t.id,
    reason: "Review company configuration",
  });
  await mutate(owner, "support.close", t.id, {});
  await assert.rejects(
    () => readWorkspace(owner, t.id),
    (e) => e.status === 404,
  );
  assert.equal(s.sql.prepare("SELECT count(*) c FROM tenants").get().c, 1);
});
test("logout revokes session and every support grant attached to it", async () => {
  const s = fixture();
  const signed = await login(s),
    owner = context(s, signed);
  const t = await mutate(owner, "tenant.create", "", {
    name: "Customer Ltd",
    slug: "customer-ltd",
    adminMobile: "9876543210",
  });
  await mutate(owner, "support.open", "", {
    id: t.id,
    reason: "Review company configuration",
  });
  const res = await handleAuth(
    request("logout", {}, signed.sessionCookie),
    s.config,
  );
  assert.equal(res.status, 200);
  assert.match(
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-hrms_session=")),
    /Max-Age=0/,
  );
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: signed.sessionCookie },
      }),
      s.config,
    ),
    null,
  );
  assert.ok(
    s.sql.prepare("SELECT revoked_at FROM support_access").get().revoked_at,
  );
});
test("company dashboard customization persists independently and validates widget order", async () => {
  const s = fixture();
  const signed = await login(s),
    owner = context(s, signed);
  const a = await mutate(owner, "tenant.create", "", {
    name: "Alpha Ltd",
    slug: "alpha-ltd",
    adminMobile: rootMobile,
  });
  const b = await mutate(owner, "tenant.create", "", {
    name: "Beta Ltd",
    slug: "beta-ltd",
    adminMobile: "9876543210",
  });
  const config = {
    title: "Welcome Alpha",
    subtitle: "Make your next move",
    widgets: ["people", "metrics", "actions"],
    density: "compact",
    hero: "minimal",
  };
  await mutate(owner, "dashboard.update", a.id, config);
  assert.deepEqual(
    JSON.parse((await readWorkspace(owner, a.id)).tenant.dashboard_config),
    config,
  );
  assert.notEqual(
    JSON.parse(
      s.sql.prepare("SELECT dashboard_config FROM tenants WHERE id=?").get(b.id)
        .dashboard_config,
    ).title,
    config.title,
  );
  await assert.rejects(() =>
    mutate(owner, "dashboard.update", a.id, {
      ...config,
      widgets: ["people", "people"],
    }),
  );
  const company = await login(s, "9876543210");
  await assert.rejects(
    () => mutate(context(s, company), "dashboard.update", a.id, config),
    (e) => e.status === 404,
  );
});
test("public auth rejects CSRF origin and invalid mobile/code inputs", async () => {
  const s = fixture();
  assert.equal(
    (
      await handleAuth(
        request("send", { mobile: rootMobile }, "", "https://evil.test"),
        s.config,
      )
    ).status,
    403,
  );
  assert.equal(
    (await handleAuth(request("send", { mobile: "12345" }), s.config)).status,
    422,
  );
  assert.equal(mobileSchema.parse("+91 7676272709"), rootMobile);
});

test("post-login redirects reject protocol-relative and backslash external URLs", () => {
  assert.equal(safeReturnTo("//evil.test"), "/");
  assert.equal(safeReturnTo("/\\evil.test"), "/");
  assert.equal(safeReturnTo("https://evil.test"), "/");
  assert.equal(safeReturnTo("/login?next=/login"), "/");
  assert.equal(
    safeReturnTo("/company/alpha?tab=people"),
    "/company/alpha?tab=people",
  );
});
test("existing platform memberships migrate only after configured root-mobile verification", async () => {
  const s = fixture();
  const prior = {
    db: s.db,
    adminMobile: rootMobile,
    identity: {
      userId: "legacy-chatgpt-owner",
      mobile: rootMobile,
      email: "legacy@example.test",
      displayName: "Old owner",
    },
  };
  s.sql
    .prepare(
      "INSERT INTO users(id,mobile,email,display_name,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      "temporary-user",
      rootMobile,
      "legacy@example.test",
      "Temporary",
      new Date().toISOString(),
    );
  const t = await mutate(prior, "tenant.create", "", {
    name: "Existing Company",
    slug: "existing-company",
    adminMobile: rootMobile,
    adminEmail: "legacy@example.test",
  });
  s.sql
    .prepare("UPDATE memberships SET user_id=? WHERE tenant_id=?")
    .run("legacy-chatgpt-owner", t.id);
  s.sql.prepare("DELETE FROM users WHERE id=?").run("temporary-user");
  s.config.legacyOwnerEmail = "legacy@example.test";
  const nonRoot = await login(s, "9876543210");
  assert.equal((await bootstrap(context(s, nonRoot))).workspaces.length, 0);
  const root = await login(s);
  assert.equal((await bootstrap(context(s, root))).workspaces[0].id, t.id);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) c FROM audit_logs WHERE action='auth.legacy_memberships_migrated'",
      )
      .get().c,
    1,
  );
});

test("public auth bounds streamed payloads and rejects JSON arrays without provider calls", async () => {
  const s = fixture();
  const oversized = new Request("https://hrms.example.test/api/auth", {
    method: "POST",
    headers: {
      origin: "https://hrms.example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "send",
      mobile: rootMobile,
      padding: "x".repeat(5000),
    }),
  });
  assert.equal((await handleAuth(oversized, s.config)).status, 413);
  const array = new Request("https://hrms.example.test/api/auth", {
    method: "POST",
    headers: {
      origin: "https://hrms.example.test",
      "content-type": "application/json",
    },
    body: "[]",
  });
  assert.equal((await handleAuth(array, s.config)).status, 422);
  assert.equal(s.calls.length, 0);
});

test("session inventory is authenticated, own-user scoped and excludes bearer hashes", async () => {
  const s = fixture();
  const root = await login(s),
    other = await login(s, "9876543210");
  const requestFor = (c) =>
    new Request("https://hrms.example.test/api/auth?view=sessions", {
      headers: { cookie: c },
    });
  assert.equal((await handleAuth(requestFor(""), s.config)).status, 401);
  const res = await handleAuth(requestFor(other.sessionCookie), s.config);
  const body = await res.json();
  assert.equal(body.sessions.length, 1);
  assert.equal(body.sessions[0].id, other.sessionId);
  assert.ok(!JSON.stringify(body).includes(root.sessionId));
  assert.ok(!JSON.stringify(body).includes("token_hash"));
});
test("session revocation denies foreign sessions and ends the selected session", async () => {
  const s = fixture();
  const root = await login(s),
    other = await login(s, "9876543210");
  assert.equal(
    (
      await handleAuth(
        request("session.revoke", { id: root.sessionId }, other.sessionCookie),
        s.config,
      )
    ).status,
    404,
  );
  const response = await handleAuth(
    request("session.revoke", { id: other.sessionId }, other.sessionCookie),
    s.config,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).signedOut, true);
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: other.sessionCookie },
      }),
      s.config,
    ),
    null,
  );
  assert.ok(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: root.sessionCookie },
      }),
      s.config,
    ),
  );
});
test("logout-all revokes all own sessions and support grants atomically without affecting other users", async () => {
  const s = fixture(),
    root = await login(s),
    other = await login(s, "9876543210");
  const tenant = await mutate(context(s, root), "tenant.create", "", {
    name: "Support Synthetic",
    slug: "support-synthetic",
    adminMobile: "9876543210",
  });
  await mutate(context(s, root), "support.open", "", {
    id: tenant.id,
    reason: "Investigate support request",
  });
  const response = await handleAuth(
    request("logout_all", {}, root.sessionCookie),
    s.config,
  );
  assert.equal(response.status, 200);
  assert.ok(
    s.sql.prepare("SELECT revoked_at FROM support_access").get().revoked_at,
  );
  assert.equal(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: root.sessionCookie },
      }),
      s.config,
    ),
    null,
  );
  assert.ok(
    await sessionIdentity(
      new Request("https://hrms.example.test/", {
        headers: { cookie: other.sessionCookie },
      }),
      s.config,
    ),
  );
});
test("company support access requires recent OTP verification and does not renew an old session", async () => {
  const s = fixture(),
    root = await login(s);
  const tenant = await mutate(context(s, root), "tenant.create", "", {
    name: "Fresh Synthetic",
    slug: "fresh-synthetic",
    adminMobile: "9876543210",
  });
  s.sql
    .prepare("UPDATE sessions SET created_at=? WHERE id=?")
    .run(new Date(Date.now() - 11 * 60000).toISOString(), root.sessionId);
  await assert.rejects(
    () =>
      mutate(context(s, root), "support.open", "", {
        id: tenant.id,
        reason: "Support investigation",
      }),
    (e) => e.status === 428,
  );
  assert.equal(
    s.sql.prepare("SELECT count(*) total FROM support_access").get().total,
    0,
  );
});
