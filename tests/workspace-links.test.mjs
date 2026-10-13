import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1-adapter.mjs";
import { mutate } from "../lib/hrms/service.ts";
import {
  slugFromName,
  slugCandidate,
  workspaceSlug,
  roleDestination,
  workspaceLinks,
  resolveWorkspaceSlug,
} from "../lib/hrms/workspace-links.ts";
async function setup() {
  const { db, sql } = database();
  const c = {
    db,
    identity: {
      userId: "platform-test",
      mobile: "9876543210",
      email: "owner@example.test",
      displayName: "Synthetic Owner",
    },
    adminMobile: "9876543210",
  };
  await db
    .prepare(
      "INSERT INTO users(id,mobile,email,display_name,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(
      c.identity.userId,
      c.identity.mobile,
      c.identity.email,
      c.identity.displayName,
      new Date().toISOString(),
    )
    .run();
  const create = (data = {}) =>
    mutate(c, "tenant.create", "", {
      name: "Acme Industries",
      adminMobile: c.identity.mobile,
      ...data,
    });
  return { c, db, sql, create };
}
test("generated slugs handle accents, numeric names, reserved roots and length", () => {
  assert.equal(slugFromName("Acme Industries"), "acme-industries");
  assert.equal(slugFromName("Élan & Sons"), "elan-sons");
  assert.equal(slugFromName("123 Ltd"), "company-123-ltd");
  assert.equal(slugFromName("Login"), "company-login");
  for (const name of ["公司", "A", "X".repeat(160)]) {
    assert.ok(workspaceSlug.safeParse(slugFromName(name)).success);
    assert.ok(
      workspaceSlug.safeParse(slugCandidate(slugFromName(name), 99)).success,
    );
  }
  for (const slug of [
    "api",
    "login",
    "super-admin",
    "../evil",
    "evil.test",
    "//evil",
  ])
    assert.equal(workspaceSlug.safeParse(slug).success, false);
});
test("duplicate company names automatically allocate deterministic unique slugs", async () => {
  const s = await setup();
  assert.equal((await s.create()).slug, "acme-industries");
  assert.equal((await s.create({ slug: "" })).slug, "acme-industries-2");
  assert.equal((await s.create()).slug, "acme-industries-3");
  assert.equal(s.sql.prepare("SELECT count(*) n FROM memberships").get().n, 3);
});
test("manual duplicate and reserved slugs do not leave provisioning rows", async () => {
  const s = await setup();
  await s.create({ slug: "explicit-workspace" });
  await assert.rejects(
    () => s.create({ slug: "explicit-workspace" }),
    (e) => e.status === 409,
  );
  await assert.rejects(() => s.create({ slug: "login" }));
  assert.equal(s.sql.prepare("SELECT count(*) n FROM tenants").get().n, 1);
  assert.equal(
    s.sql.prepare("SELECT count(*) n FROM subscriptions").get().n,
    1,
  );
});
test("slug rename preserves immutable tenant ID and resolves all prior links", async () => {
  const s = await setup(),
    t = await s.create();
  await mutate(s.c, "tenant.slug", "", { id: t.id, slug: "acme-new" });
  await mutate(s.c, "tenant.slug", "", { id: t.id, slug: "acme-final" });
  for (const slug of ["acme-industries", "acme-new", "acme-final"]) {
    const r = await resolveWorkspaceSlug(s.db, slug);
    assert.equal(r.id, t.id);
    assert.equal(r.slug, "acme-final");
  }
  assert.equal((await s.create()).slug, "acme-industries-2");
  await assert.rejects(
    () => s.create({ slug: "acme-industries" }),
    (e) => e.status === 409,
  );
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE action='tenant.slug_changed'",
      )
      .get().n,
    2,
  );
  assert.deepEqual(s.sql.prepare("PRAGMA foreign_key_check").all(), []);
});
test("database guards prevent stealing current or historical links and altering redirects", async () => {
  const s = await setup(),
    a = await s.create(),
    b = await s.create();
  await mutate(s.c, "tenant.slug", "", { id: a.id, slug: "acme-renamed" });
  assert.throws(
    () =>
      s.sql
        .prepare("UPDATE tenants SET slug=? WHERE id=?")
        .run("acme-industries", b.id),
    /UNIQUE/,
  );
  assert.throws(
    () =>
      s.sql
        .prepare("INSERT INTO tenant_slug_aliases VALUES(?,?,?)")
        .run(b.slug, a.id, new Date().toISOString()),
    /UNIQUE/,
  );
  assert.throws(
    () => s.sql.exec("DELETE FROM tenant_slug_aliases"),
    /immutable/,
  );
  assert.throws(
    () => s.sql.exec("UPDATE tenant_slug_aliases SET slug='stolen-link'"),
    /immutable/,
  );
  await assert.rejects(() =>
    mutate(s.c, "tenant.slug", "", { id: a.id, slug: b.slug }),
  );
  assert.equal((await resolveWorkspaceSlug(s.db, "acme-renamed")).id, a.id);
});
test("company administrator cannot rename any tenant and failed lookup is private", async () => {
  const s = await setup(),
    t = await s.create();
  const admin = { ...s.c, adminMobile: "9123456789" };
  await assert.rejects(
    () =>
      mutate(admin, "tenant.slug", "", { id: t.id, slug: "illegal-change" }),
    (e) => e.status === 403,
  );
  assert.equal(await resolveWorkspaceSlug(s.db, "unknown-workspace"), null);
  assert.equal(await resolveWorkspaceSlug(s.db, "//evil.example"), null);
});
test("role links use fixed canonical origin and do not pretend payroll is available", () => {
  const links = workspaceLinks("acme-industries");
  assert.equal(links.workspace, "https://hrms.sohansoft.in/acme-industries");
  assert.equal(
    roleDestination("acme-industries", "employee"),
    "/acme-industries/employee",
  );
  assert.equal(
    roleDestination("acme-industries", "admin"),
    "/acme-industries/admin",
  );
  assert.equal(roleDestination("acme-industries", "payroll"), null);
  assert.equal(links.roles.find((r) => r.role === "payroll").url, null);
  assert.throws(
    () => roleDestination("acme-industries", "owner"),
    (e) => e.status === 404,
  );
  assert.throws(() => workspaceLinks("//evil.example"));
});

test("an interleaved automatic slug collision retries an atomic batch without orphan rows", async () => {
  const s = await setup();
  let injected = false;
  const racing = {
    ...s.c,
    db: {
      ...s.db,
      batch: async (commands) => {
        if (!injected) {
          injected = true;
          await s.create();
        }
        return s.db.batch(commands);
      },
    },
  };
  const t = await mutate(racing, "tenant.create", "", {
    name: "Acme Industries",
    adminMobile: s.c.identity.mobile,
  });
  assert.equal(t.slug, "acme-industries-2");
  for (const table of ["tenants", "subscriptions", "memberships"])
    assert.equal(s.sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, 2);
  assert.equal(
    s.sql
      .prepare(
        "SELECT count(*) n FROM audit_logs WHERE action='tenant.created'",
      )
      .get().n,
    2,
  );
  assert.deepEqual(s.sql.prepare("PRAGMA foreign_key_check").all(), []);
});

test("legacy reserved slugs keep their original canonical company routes", async () => {
  const s = await setup(),
    t = await s.create();
  s.sql.prepare("UPDATE tenants SET slug='login' WHERE id=?").run(t.id);
  assert.equal((await resolveWorkspaceSlug(s.db, "login")).id, t.id);
  assert.equal(
    workspaceLinks("login").workspace,
    "https://hrms.sohansoft.in/company/login",
  );
  assert.equal(roleDestination("login", "employee"), "/company/login/employee");
  assert.ok(
    workspaceLinks("login")
      .roles.find((r) => r.role === "employee")
      .url.startsWith("https://hrms.sohansoft.in/login?company=login&next="),
  );
});
