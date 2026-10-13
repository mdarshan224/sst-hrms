import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LatestRequest } from "../lib/hrms/latest-request.ts";

// Render the actual TSX with the existing compiler; no browser or extra dependency.
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function component(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, mod);
  mod.require = (name) => {
    if (name.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), name);
      for (const extension of [".tsx", ".ts"])
        if (fs.existsSync(base + extension)) return component(base + extension);
    }
    return nativeRequire(name);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const { CashfreeSettings } = component("components/hrms-verification.tsx");
const { Feedback, StatusItem } = component("components/hrms-ui.tsx");
const { default: Operations } = component("components/hrms-operations.tsx");
const { workflowAction } = component("components/workflow-client.ts");
const settings = {
  settings: {
    mode: "sandbox",
    version: 3,
    enabled: 1,
    pan_enabled: 1,
    digilocker_enabled: 0,
    last_test_at: null,
  },
  credentials: {
    sandbox: {
      configured: false,
      publicKeyConfigured: false,
      productionApproved: false,
      clientIdentifier: null,
    },
  },
};
const props = {
  state: settings,
  act: async () => true,
  busy: false,
  operation: "",
  loading: false,
};
const render = (C, p = {}) => renderToStaticMarkup(React.createElement(C, p));

test("Cashfree has independently labelled settings and safe unavailable credentials", () => {
  const html = render(CashfreeSettings, props);
  assert.equal((html.match(/class="settings-row"/g) ?? []).length, 3);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
  assert.match(html, /<legend>Service availability<\/legend>/);
  assert.match(html, /<select name="mode">/);
  assert.match(html, /<option value="sandbox" selected="">/);
  assert.match(html, /disabled="">Test Sandbox PAN Lite/);
  assert.match(html, /Not tested/);
  assert.match(html, /Consent alone does not verify identity/);
  assert.doesNotMatch(html, /Test recorded|Test successful/);
});

test("Cashfree saving and testing states prevent repeated submissions", () => {
  const saving = render(CashfreeSettings, {
    ...props,
    busy: true,
    operation: "platform.save",
  });
  assert.match(saving, /<fieldset disabled=""/);
  assert.match(saving, /disabled="">Saving configuration/);
  const testing = render(CashfreeSettings, {
    ...props,
    busy: true,
    operation: "platform.test",
  });
  assert.match(testing, /Testing sandbox/);
  assert.match(testing, /Waiting for the provider response/);
  assert.doesNotMatch(testing, /Test successful/);
});

test("readiness uses returned configuration, with an independent last test result", () => {
  const state = {
    ...settings,
    credentials: {
      sandbox: {
        configured: true,
        clientIdentifier: "test…client",
        publicKeyConfigured: true,
        productionApproved: false,
      },
    },
  };
  const html = render(CashfreeSettings, { ...props, state });
  assert.match(html, /test…client/);
  assert.match(html, /Not tested/);
  assert.match(
    html,
    /<button type="button" class="secondary">Test Sandbox PAN Lite/,
  );
  assert.match(html, /Configured values do not prove live connectivity/);
});

test("diagnostics are escaped and success/error feedback is announced separately", () => {
  const html = render(Feedback, { error: "<script>forged</script>" });
  assert.match(html, /role="alert"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /role="status"|<script>/);
  assert.match(
    render(Feedback, { notice: "Server confirmed" }),
    /role="status"/,
  );
  assert.match(
    render(StatusItem, {
      label: "Scanner",
      status: "Unavailable",
      tone: "warning",
      children: "Quarantine enforced",
    }),
    /Unavailable/,
  );
});

test("operations initially reports loading, not a false empty queue or configured scanner", () => {
  const html = render(Operations);
  assert.match(html, /Loading workflow operations/);
  assert.match(html, /disabled="">Refreshing/);
  assert.doesNotMatch(
    html,
    /No workflow jobs|Configured · validation required/,
  );
});

test("superseded scope requests cannot publish a stale success or error", async () => {
  const gate = new LatestRequest();
  const companyA = gate.begin();
  const companyB = gate.begin();
  assert.equal(companyA.signal.aborted, true);
  assert.equal(companyA.current(), false);
  assert.equal(companyB.current(), true);
  await Promise.resolve();
  assert.equal(companyA.current(), false);
  gate.cancel();
  assert.equal(companyB.current(), false);
  assert.equal(companyB.signal.aborted, true);
  assert.equal(gate.begin().current(), true);
});

test("workflow client surfaces server denial and transport failures without returning success", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Access denied" }), { status: 403 });
    await assert.rejects(
      workflowAction("notification.read", "synthetic-company", { id: "test" }),
      /Access denied/,
    );
    globalThis.fetch = async () => {
      throw new Error("Network unavailable");
    };
    await assert.rejects(
      workflowAction("notification.read", "synthetic-company", { id: "test" }),
      /Network unavailable/,
    );
    globalThis.fetch = async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.tenant, "synthetic-company");
      return new Response(JSON.stringify({ saved: true }));
    };
    assert.deepEqual(
      await workflowAction("notification.read", "synthetic-company", {
        id: "test",
      }),
      { saved: true },
    );
  } finally {
    globalThis.fetch = original;
  }
});
