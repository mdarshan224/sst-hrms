import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieveHosting } from "../lib/hrms/hosting-provider.ts";
import { HRMS_PROJECT_ID } from "../lib/hrms/domains.ts";
const pid = "abcdabcd-abcd-abcd-abcd-abcdabcdabcd",
  host = "people.synthetic.example.com",
  tid = "synthetic-tenant",
  version = "synthetic-version",
  body = {
    success: true,
    result: {
      id: pid,
      hostname: host,
      status: "active",
      ssl: { status: "active" },
      custom_metadata: {
        hrms_project_id: HRMS_PROJECT_ID,
        hrms_tenant_id: tid,
        hrms_deployment_version: version,
      },
    },
  };
const config = (fetcher) => ({
  token: "synthetic-read-only-token",
  zoneId: "a".repeat(32),
  deploymentVersion: version,
  fetcher,
});
const fail = (fn, status) => assert.rejects(fn, (e) => e.status === status);
test("provider retrieval uses authenticated fixed Cloudflare API with exact metadata binding", async () => {
  const r = await retrieveHosting(
    config(async (url, o) => {
      assert.equal(
        url,
        `https://api.cloudflare.com/client/v4/zones/${"a".repeat(32)}/custom_hostnames/${pid}`,
      );
      assert.equal(o.headers.Authorization, "Bearer synthetic-read-only-token");
      assert.equal(o.redirect, "error");
      return Response.json(body);
    }),
    pid,
    host,
    tid,
  );
  assert.equal(r.sslStatus, "active");
  assert.equal(r.deploymentVersion, version);
  assert.ok(Date.now() - Date.parse(r.checkedAt) < 1000);
});
test("missing credentials, Sites IDs, wrong hostname/project/company/deployment and malformed provider evidence fail closed", async () => {
  await fail(() => retrieveHosting({}, pid, host, tid), 503);
  await fail(
    () => retrieveHosting(config(), "appgdom_example", host, tid),
    422,
  );
  for (const changes of [
    { hostname: "evil.example.com" },
    {
      custom_metadata: {
        ...body.result.custom_metadata,
        hrms_project_id: "wrong",
      },
    },
    {
      custom_metadata: {
        ...body.result.custom_metadata,
        hrms_tenant_id: "wrong",
      },
    },
    {
      custom_metadata: {
        ...body.result.custom_metadata,
        hrms_deployment_version: "old",
      },
    },
  ])
    await fail(
      () =>
        retrieveHosting(
          config(async () =>
            Response.json({ ...body, result: { ...body.result, ...changes } }),
          ),
          pid,
          host,
          tid,
        ),
      409,
    );
  await fail(
    () =>
      retrieveHosting(
        config(async () => new Response("invalid")),
        pid,
        host,
        tid,
      ),
    502,
  );
  await fail(
    () =>
      retrieveHosting(
        config(async () => new Response("x".repeat(65537))),
        pid,
        host,
        tid,
      ),
    502,
  );
});
