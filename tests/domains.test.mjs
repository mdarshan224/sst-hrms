import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1-adapter.mjs";
import { mutate, bootstrap, scope, isPlatform } from "../lib/hrms/service.ts";
import {
  domainAction,
  listDomains,
  resolveTenantRequest,
  hostname,
  customerHostname,
  domainMac,
  routingProof,
  tenantUrl,
  HRMS_PROJECT_ID,
  MANAGED_CNAME,
} from "../lib/hrms/domains.ts";
import {
  withTenantRequest,
  tenantRequest,
} from "../lib/hrms/tenant-context.ts";
import { handleAuth, sessionIdentity } from "../lib/hrms/auth.ts";
import { handleRequest } from "../lib/hrms/http.ts";
import { workspacePath } from "../lib/hrms/workspace-links.ts";
const key = "synthetic-domain-sync-secret-for-unit-tests-only";
async function setup() {
  const { db, sql } = database(),
    at = new Date().toISOString(),
    uid = crypto.randomUUID(),
    sid = crypto.randomUUID();
  sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,verified_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(uid, "9876543210", "Synthetic Owner", at, at);
  sql
    .prepare(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      sid,
      uid,
      "test-hash",
      new Date(Date.now() + 3600000).toISOString(),
      at,
    );
  const c = {
    db,
    identity: {
      userId: uid,
      mobile: "9876543210",
      email: "owner@example.test",
      displayName: "Synthetic Owner",
    },
    adminMobile: "9876543210",
    sessionId: sid,
  };
  const a = await mutate(c, "tenant.create", "", {
    name: "Alpha Synthetic",
    adminMobile: c.identity.mobile,
  });
  const b = await mutate(c, "tenant.create", "", {
    name: "Beta Synthetic",
    adminMobile: c.identity.mobile,
  });
  const d = await domainAction(c, {}, "register", {
    tenantId: a.id,
    hostname: "people.alpha.example.com",
  });
  const row = () =>
    sql.prepare("SELECT * FROM tenant_domains WHERE id=?").get(d.id);
  return { db, sql, c, a, b, d, row };
}
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);
function fetcher(
  s,
  { txt = true, cname = true, proof = true, redirect = false } = {},
) {
  return async (url, options) => {
    const u = new URL(url);
    if (u.hostname === "cloudflare-dns.com") {
      const type = u.searchParams.get("type"),
        name = u.searchParams.get("name");
      return Response.json({
        Status: 0,
        Answer:
          type === "TXT"
            ? txt
              ? [
                  {
                    name,
                    type: 16,
                    data: JSON.stringify(
                      `sohansoft-hrms-verification=${s.row().challenge}`,
                    ),
                  },
                ]
              : []
            : cname
              ? [{ name, type: 5, data: MANAGED_CNAME + "." }]
              : [],
      });
    }
    assert.equal(u.origin, "https://people.alpha.example.com");
    assert.equal(options.redirect, "error");
    if (redirect) throw new Error("redirect blocked");
    if (!proof) return Response.json({ proof: "0".repeat(64) });
    return routingProof(new Request(url), s.db, {
      syncSecret: key,
      deploymentVersion: "test-deployment",
    });
  };
}
async function sync(s, changes = {}, providerChanges = {}) {
  const row = s.row(),
    payload = JSON.stringify({
      domainId: s.d.id,
      version: row.version,
      hostname: row.hostname,
      projectId: HRMS_PROJECT_ID,
      providerDomainId: "appgdom_synthetic",
      status: "active",
      providerStatus: "active",
      sslStatus: "active",
      cnameTarget: MANAGED_CNAME + ".",
      validationRecords: [],
      checkedAt: new Date().toISOString(),
      ...changes,
    });
  return domainAction(
    s.c,
    {
      syncSecret: key,
      deploymentVersion: "test-deployment",
      retrieveProvider: async () => ({
        providerDomainId: "appgdom_synthetic",
        deploymentVersion: "test-deployment",
        checkedAt: new Date().toISOString(),
        status: "active",
        providerStatus: "active",
        sslStatus: changes.sslStatus ?? "active",
        ...providerChanges,
      }),
    },
    "sync",
    {
      id: s.d.id,
      payload,
      signature: await domainMac(key, payload),
    },
  );
}
async function active(s) {
  await domainAction(s.c, { fetcher: fetcher(s) }, "verify", { id: s.d.id });
  await sync(s);
  await domainAction(
    s.c,
    {
      syncSecret: key,
      deploymentVersion: "test-deployment",
      fetcher: fetcher(s),
    },
    "activate",
    { id: s.d.id },
  );
}
test("host normalization rejects injection, credentials, ports, local addresses and ERP domains", () => {
  assert.equal(hostname("People.Example.COM."), "people.example.com");
  for (const h of [
    "https://evil.com",
    "evil.com:443",
    "user@evil.com",
    "evil.com/path",
    "127.0.0.1",
    "evil.com\r\nx-header:1",
    "*.example.com",
    "localhost",
    "host.internal",
  ])
    assert.throws(() => hostname(h));
  for (const h of [
    "hrms.sohansoft.in",
    "erp.sohansoft.in",
    "other.sohansoft.in",
    "sohansoft.in",
  ])
    assert.throws(() => customerHostname(h));
});
test("domain registration is unique, pending, tenant-bound and requires recent privileged verification", async () => {
  const s = await setup();
  assert.equal(s.row().status, "pending");
  assert.equal(s.row().tls_status, "unknown");
  await assert.rejects(() =>
    domainAction(s.c, {}, "register", {
      tenantId: s.b.id,
      hostname: s.row().hostname,
    }),
  );
  assert.throws(
    () =>
      s.sql
        .prepare("UPDATE tenant_domains SET tenant_id=? WHERE id=?")
        .run(s.b.id, s.d.id),
    /reassigned/,
  );
  await fail(
    () =>
      domainAction({ ...s.c, sessionId: undefined }, {}, "register", {
        tenantId: s.a.id,
        hostname: "another.example.com",
      }),
    401,
  );
});
test("company admins cannot list or manage domain mappings", async () => {
  const s = await setup(),
    company = { ...s.c, adminMobile: "9123456789" };
  await fail(() => listDomains(company, {}), 403);
  await fail(() => domainAction(company, {}, "disable", { id: s.d.id }), 403);
});
test("real DNS ownership checks record missing/matched TXT without activating hosting", async () => {
  const s = await setup();
  await domainAction(s.c, { fetcher: fetcher(s, { txt: false }) }, "verify", {
    id: s.d.id,
  });
  assert.equal(s.row().ownership_status, "pending");
  assert.match(s.row().last_error, /TXT/);
  await domainAction(s.c, { fetcher: fetcher(s) }, "verify", { id: s.d.id });
  assert.equal(s.row().ownership_status, "verified");
  assert.equal(s.row().status, "pending");
  await fail(() => domainAction(s.c, {}, "activate", { id: s.d.id }), 503);
});
test("unsigned, stale, mismatched provider receipts fail closed", async () => {
  const s = await setup();
  await fail(
    () =>
      domainAction(s.c, { syncSecret: key }, "sync", {
        id: s.d.id,
        payload: "{}",
        signature: "0".repeat(64),
      }),
    403,
  );
  await fail(() => sync(s, { hostname: "other.example.com" }), 409);
  await fail(
    () =>
      sync(s, { checkedAt: new Date(Date.now() - 20 * 60000).toISOString() }),
    409,
  );
  await fail(() => sync(s, { version: 99 }), 409);
  await assert.rejects(() => sync(s, { projectId: "erp-project" }));
  assert.equal(s.row().tls_status, "unknown");
});
test("TLS and routing are separate gates; redirects and forged proofs cannot activate", async () => {
  const s = await setup();
  await domainAction(s.c, { fetcher: fetcher(s) }, "verify", { id: s.d.id });
  await sync(s, { sslStatus: "pending_validation" });
  await fail(
    () =>
      domainAction(
        s.c,
        {
          syncSecret: key,
          deploymentVersion: "test-deployment",
          fetcher: fetcher(s),
        },
        "activate",
        {
          id: s.d.id,
        },
      ),
    409,
  );
  await sync(s);
  for (const opts of [{ cname: false }, { proof: false }, { redirect: true }])
    await fail(
      () =>
        domainAction(
          s.c,
          {
            syncSecret: key,
            deploymentVersion: "test-deployment",
            fetcher: fetcher(s, opts),
          },
          "activate",
          { id: s.d.id },
        ),
      opts.cname === false ? 409 : 502,
    );
  assert.equal(s.row().status, "pending");
  await active(s);
  assert.equal(s.row().status, "active");
});
test("database rejects activating incomplete mappings", async () => {
  const s = await setup();
  assert.throws(
    () =>
      s.sql
        .prepare("UPDATE tenant_domains SET status='active' WHERE id=?")
        .run(s.d.id),
    /incomplete/,
  );
});
test("trusted resolver rejects unknown, pending, disabled, removed and expired mappings", async () => {
  const s = await setup(),
    req = new Request("https://people.alpha.example.com/hr");
  await fail(
    () =>
      resolveTenantRequest(s.db, new Request("https://unknown.example.com/")),
    404,
  );
  await fail(() => resolveTenantRequest(s.db, req), 404);
  await active(s);
  const context = await resolveTenantRequest(s.db, req);
  assert.equal(context.tenantId, s.a.id);
  assert.match(context.realm, /^domain:/);
  s.sql
    .prepare("UPDATE tenant_domains SET verified_until=? WHERE id=?")
    .run(new Date(Date.now() - 1000).toISOString(), s.d.id);
  await fail(() => resolveTenantRequest(s.db, req), 404);
  await domainAction(s.c, {}, "disable", { id: s.d.id });
  await fail(() => resolveTenantRequest(s.db, req), 404);
  await domainAction(s.c, {}, "remove", { id: s.d.id });
  await fail(() => resolveTenantRequest(s.db, req), 404);
  await fail(() => domainAction(s.c, {}, "rotate", { id: s.d.id }), 409);
  assert.throws(() => s.sql.exec("DELETE FROM tenant_domains"), /Retain/);
});
test("Host header mismatches and HTTP fail; forwarded identity headers confer no authority", async () => {
  const s = await setup();
  await fail(
    () =>
      resolveTenantRequest(
        s.db,
        new Request("https://hrms.sohansoft.in/", {
          headers: { host: "evil.example.com" },
        }),
      ),
    400,
  );
  await fail(
    () => resolveTenantRequest(s.db, new Request("http://hrms.sohansoft.in/")),
    403,
  );
  const c = await resolveTenantRequest(
    s.db,
    new Request("https://hrms.sohansoft.in/", {
      headers: {
        "x-forwarded-host": s.row().hostname,
        "x-sohan-proxy-host": s.row().hostname,
        "x-hrms-tenant": s.a.id,
      },
    }),
  );
  assert.equal(c.realm, "platform");
  assert.equal(c.tenantId, undefined);
});
test("mapped hostname locks bootstrap, reads, writes, exports and platform authority", async () => {
  const s = await setup(),
    bound = { ...s.c, boundTenantId: s.a.id };
  assert.equal(isPlatform(bound), false);
  assert.equal((await bootstrap(bound)).workspaces.length, 1);
  await fail(() => scope(bound, s.b.id, ""), 404);
  for (const view of ["workspace", "employees", "export", "dashboard"]) {
    const r = await handleRequest(
      new Request(
        `https://people.alpha.example.com/api/hrms?view=${view}&tenant=${s.b.id}&mode=admin`,
      ),
      async () => bound,
    );
    assert.equal(r.status, 404);
  }
  const write = await handleRequest(
    new Request("https://people.alpha.example.com/api/hrms", {
      method: "POST",
      headers: {
        origin: "https://people.alpha.example.com",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "employee.create",
        tenant: s.b.id,
        data: {
          fullName: "Synthetic Employee",
          email: "employee@example.test",
          designation: "Engineer",
          joiningDate: "2026-10-12",
        },
      }),
    }),
    async () => bound,
  );
  assert.equal(write.status, 404);
  await fail(() => domainAction(bound, {}, "disable", { id: s.d.id }), 403);
});
test("suspended tenants and expired subscriptions reject hostname routing", async () => {
  const s = await setup();
  await active(s);
  s.sql.prepare("UPDATE tenants SET status='suspended' WHERE id=?").run(s.a.id);
  await fail(
    () =>
      resolveTenantRequest(
        s.db,
        new Request("https://people.alpha.example.com/"),
      ),
    404,
  );
  s.sql.prepare("UPDATE tenants SET status='active' WHERE id=?").run(s.a.id);
  s.sql
    .prepare("UPDATE subscriptions SET expires_at='bad' WHERE tenant_id=?")
    .run(s.a.id);
  await fail(
    () =>
      resolveTenantRequest(
        s.db,
        new Request("https://people.alpha.example.com/"),
      ),
    404,
  );
});
test("canonical generated links select only fresh active primary registry entries", async () => {
  const s = await setup();
  assert.equal(
    await tenantUrl(s.db, s.a.id, "/hr"),
    "https://hrms.sohansoft.in/alpha-synthetic/hr",
  );
  await fail(() => tenantUrl(s.db, s.a.id, "//evil.example.com"), 422);
  await active(s);
  await domainAction(s.c, {}, "primary", { id: s.d.id });
  assert.equal(
    await tenantUrl(s.db, s.a.id, "/hr"),
    "https://people.alpha.example.com/hr",
  );
  await domainAction(s.c, {}, "disable", { id: s.d.id });
  assert.equal(
    await tenantUrl(s.db, s.a.id, "/hr"),
    "https://hrms.sohansoft.in/alpha-synthetic/hr",
  );
  assert.equal(workspacePath("alpha-synthetic", "hr"), "/alpha-synthetic/hr");
  assert.equal(workspacePath("alpha-synthetic", "hr", true), "/hr");
});
test("request-local tenant state stays isolated during overlapping asynchronous rendering", async () => {
  const result = await Promise.all(
    ["a", "b"].map((tenantId) =>
      withTenantRequest(
        { tenantId, realm: tenantId, hostname: tenantId, publicPath: "/" },
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return tenantRequest().tenantId;
        },
      ),
    ),
  );
  assert.deepEqual(result, ["a", "b"]);
  assert.equal(tenantRequest(), undefined);
});
test("OTP challenges and sessions cannot be replayed into another domain realm; cookies remain host-only", async () => {
  const s = await setup(),
    base = {
      db: s.db,
      apiKey: "synthetic-key",
      otpId: "synthetic-template",
      adminMobile: s.c.adminMobile,
      fetcher: async () => Response.json({ return: true, status_code: 200 }),
      realm: "domain:A:1",
    };
  const req = (
    action,
    data,
    cookie = "",
    origin = "https://people.alpha.example.com",
  ) =>
    new Request("https://people.alpha.example.com/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({ action, ...data }),
    });
  const sent = await handleAuth(req("send", { mobile: "9123456789" }), base),
    challenge = sent.headers.getSetCookie()[0].split(";")[0];
  assert.equal(sent.status, 200);
  assert.equal(
    (
      await handleAuth(
        req("verify", { mobile: "9123456789", otp: "654321" }, challenge),
        { ...base, realm: "domain:B:1" },
      )
    ).status,
    403,
  );
  const verified = await handleAuth(
    req("verify", { mobile: "9123456789", otp: "654321" }, challenge),
    base,
  );
  assert.equal(verified.status, 200);
  for (const cookie of verified.headers.getSetCookie()) {
    assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict/);
    assert.doesNotMatch(cookie, /Domain=/i);
  }
  const sessionCookie = verified.headers.getSetCookie()[0].split(";")[0],
    get = new Request("https://people.alpha.example.com/", {
      headers: { cookie: sessionCookie },
    });
  assert.ok(await sessionIdentity(get, base));
  assert.equal(
    await sessionIdentity(get, { ...base, realm: "platform" }),
    null,
  );
  assert.equal(
    await sessionIdentity(get, { ...base, realm: "domain:B:1" }),
    null,
  );
  assert.equal(
    await sessionIdentity(get, { ...base, realm: "domain:A:2" }),
    null,
  );
  assert.equal(
    (
      await handleAuth(
        req("logout", {}, sessionCookie, "https://evil.example.com"),
        base,
      )
    ).status,
    403,
  );
  await handleAuth(req("logout", {}, sessionCookie), base);
  assert.equal(await sessionIdentity(get, base), null);
});
test("stale asynchronous DNS checks cannot overwrite a concurrent disable or append a false success audit", async () => {
  const s = await setup();
  let injected = false;
  const config = {
    fetcher: async (...args) => {
      if (!injected) {
        injected = true;
        await domainAction(s.c, {}, "disable", { id: s.d.id });
      }
      return fetcher(s)(...args);
    },
  };
  await fail(() => domainAction(s.c, config, "verify", { id: s.d.id }), 409);
  assert.equal(s.row().status, "disabled");
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE action='domain.ownership_checked'",
      )
      .get().n,
    0,
  );
});
test("successful verification renewal does not revoke an existing domain session realm", async () => {
  const s = await setup();
  await active(s);
  const before = s.row().session_epoch;
  await sync(s);
  await domainAction(s.c, { fetcher: fetcher(s) }, "verify", { id: s.d.id });
  assert.equal(s.row().status, "active");
  assert.equal(s.row().session_epoch, before);
});

test("legacy custom-domain routes redirect within the verified origin without loops or tenant crossover", async () => {
  const { tenantRouteRedirect } = await import("../lib/hrms/domains.ts");
  const s = await setup();
  await active(s);
  const context = await resolveTenantRequest(
    s.db,
    new Request("https://people.alpha.example.com/"),
  );
  const r = await tenantRouteRedirect(
    s.db,
    context,
    new Request(
      "https://people.alpha.example.com/company/alpha-synthetic/hr?tab=team",
      { headers: { "x-forwarded-host": "evil.example.com" } },
    ),
  );
  assert.equal(r, "https://people.alpha.example.com/hr?tab=team");
  assert.equal(await tenantRouteRedirect(s.db, context, new Request(r)), null);
  await fail(
    () =>
      tenantRouteRedirect(
        s.db,
        context,
        new Request(
          "https://people.alpha.example.com/company/beta-synthetic/hr",
        ),
      ),
    404,
  );
  await fail(
    () =>
      tenantRouteRedirect(
        s.db,
        context,
        new Request("https://people.alpha.example.com/super-admin"),
      ),
    404,
  );
  await fail(
    () =>
      tenantRouteRedirect(
        s.db,
        context,
        new Request("https://people.alpha.example.com/api/domains"),
      ),
    404,
  );
  const req = new Request(
    "https://people.alpha.example.com/api/hrms?view=employees",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"synthetic":true}',
    },
  );
  assert.equal(await tenantRouteRedirect(s.db, context, req), null);
  assert.equal(await req.text(), '{"synthetic":true}');
});
test("generated links reject normalized path escapes and expired company entitlements", async () => {
  const s = await setup();
  for (const path of [
    "/../evil",
    "/%2e%2e/evil",
    "/hr\\evil",
    "//evil.example.com",
    "/hr\nfoo",
  ])
    await fail(() => tenantUrl(s.db, s.a.id, path), 422);
  s.sql
    .prepare("UPDATE subscriptions SET expires_at=? WHERE tenant_id=?")
    .run(new Date(Date.now() - 1000).toISOString(), s.a.id);
  await fail(() => tenantUrl(s.db, s.a.id, "/hr"), 402);
});

test("an upgrade preserves pre-domain tenants, aliases and existing session realms", async () => {
  const { DatabaseSync } = await import("node:sqlite"),
    { readdirSync, readFileSync } = await import("node:fs");
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  const migrations = readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort();
  for (const name of migrations.filter((x) => x < "0007_"))
    sql.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  const at = new Date().toISOString();
  sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,created_at) VALUES('old-user','9123456789','Synthetic Legacy',?)",
    )
    .run(at);
  sql
    .prepare(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES('old-session','old-user','old-hash',?,?)",
    )
    .run(new Date(Date.now() + 60000).toISOString(), at);
  sql
    .prepare(
      "INSERT INTO tenants(id,name,slug,stages,created_at) VALUES('old-tenant','Synthetic Legacy','old-workspace','[]',?)",
    )
    .run(at);
  sql
    .prepare(
      "INSERT INTO tenant_slug_aliases(slug,tenant_id,created_at) VALUES('older-workspace','old-tenant',?)",
    )
    .run(at);
  for (const name of migrations.filter((x) => x >= "0007_"))
    sql.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  assert.equal(
    sql.prepare("SELECT realm FROM sessions WHERE id='old-session'").get()
      .realm,
    "platform",
  );
  assert.equal(
    sql
      .prepare(
        "SELECT tenant_id FROM tenant_slug_aliases WHERE slug='older-workspace'",
      )
      .get().tenant_id,
    "old-tenant",
  );
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    sql.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  sql.close();
});

test("signed offline receipt alone cannot establish fresh hosting", async () => {
  const s = await setup(),
    payload = JSON.stringify({
      domainId: s.d.id,
      version: s.row().version,
      hostname: s.row().hostname,
      projectId: HRMS_PROJECT_ID,
      providerDomainId: "appgdom_synthetic",
      status: "active",
      providerStatus: "active",
      sslStatus: "active",
      cnameTarget: MANAGED_CNAME,
      validationRecords: [],
      checkedAt: new Date().toISOString(),
    });
  await fail(
    async () =>
      domainAction(s.c, { syncSecret: key }, "sync", {
        id: s.d.id,
        payload,
        signature: await domainMac(key, payload),
      }),
    503,
  );
});
test("activation requires provider evidence from current deployment, not an earlier version", async () => {
  const s = await setup();
  await domainAction(s.c, { fetcher: fetcher(s) }, "verify", { id: s.d.id });
  await sync(s);
  await fail(
    () =>
      domainAction(
        s.c,
        {
          syncSecret: key,
          deploymentVersion: "different-deployment",
          fetcher: fetcher(s),
        },
        "activate",
        { id: s.d.id },
      ),
    409,
  );
});
test("signed active claims cannot override independently fetched pending TLS and stale fetches fail closed", async () => {
  const s = await setup();
  await sync(s, {}, { sslStatus: "pending" });
  assert.equal(s.row().tls_status, "pending");
  await fail(
    () =>
      sync(s, {}, { checkedAt: new Date(Date.now() - 120000).toISOString() }),
    409,
  );
  await fail(() => sync(s, {}, { deploymentVersion: "old-deployment" }), 409);
});
test("custom hostname evidence must match the current deployment; primary host stays independent", async () => {
  const s = await setup();
  await active(s);
  const request = new Request(
    "https://" + s.row().hostname + "/employee/login",
  );
  await resolveTenantRequest(s.db, request, false, "test-deployment");
  await fail(
    () =>
      resolveTenantRequest(s.db, request, false, "new-unattested-deployment"),
    404,
  );
  assert.equal(
    (
      await resolveTenantRequest(
        s.db,
        new Request("https://hrms.sohansoft.in/"),
        false,
        "new-unattested-deployment",
      )
    ).realm,
    "platform",
  );
});
