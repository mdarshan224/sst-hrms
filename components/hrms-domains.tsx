"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
type Domain = {
  id: string;
  hostname: string;
  tenant_name: string;
  status: string;
  ownership_status: string;
  tls_status: string;
  provider_status: string;
  routing_status: string;
  verified_until: string | null;
  last_error: string | null;
  version: number;
  is_primary: number;
  instructions: {
    ownership: { type: string; name: string; value: string };
    cname: { type: string; name: string; value: string; mode: string } | null;
    providerRecords: { record_type: string; name: string; value: string }[];
    note: string;
  };
};
export default function DomainSettings({
  tenants,
}: {
  tenants: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Domain[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [configured, setConfigured] = useState(false),
    [syncId, setSyncId] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/domains", { cache: "no-store" }),
        body = (await r.json()) as {
          error?: string;
          rows: Domain[];
          configured: boolean;
        };
      if (!r.ok) throw new Error(body.error ?? "Unable to load domains.");
      setRows(body.rows);
      setConfigured(body.configured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load domains.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  async function act(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/domains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        }),
        body = (await r.json()) as {
          error?: string;
          rows: Domain[];
          configured: boolean;
        };
      if (!r.ok) throw new Error(body.error ?? "Operation failed.");
      setNotice(
        action === "verify"
          ? "DNS check recorded. Review ownership status below."
          : "Domain operation saved.",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-card">
      <div className="panel-head">
        <div>
          <h2>Customer domains</h2>
          <p>
            Tenant mappings, ownership, hosting and certificates are checked
            separately. Latest 100 registrations.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
        >
          Refresh
        </button>
      </div>
      <p>
        <Link href="/login?reauth=1&next=/super-admin">
          Verify mobile again
        </Link>{" "}
        before changing domain configuration if your sign-in is more than ten
        minutes old.
      </p>
      {!loading && !error && !configured && (
        <p className="form-error">
          Hosting sync is unavailable. Register and verify DNS ownership here;
          an operator must attach the hostname to this HRMS Site and configure
          its independent sync secret, authenticated provider access and
          deployment binding before TLS/routing activation.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act("register", {
            hostname: f.get("hostname"),
            tenantId: f.get("tenantId"),
          });
        }}
      >
        <label className="form-field">
          <span>Customer hostname</span>
          <input
            name="hostname"
            required
            maxLength={253}
            placeholder="people.customer.com"
            autoComplete="off"
          />
        </label>
        <label className="form-field">
          <span>Company</span>
          <select name="tenantId" required>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !tenants.length}>
          {busy ? "Saving…" : "Register mapping"}
        </button>
      </form>
      {loading ? (
        <p role="status">Loading domain registry…</p>
      ) : !rows.length ? (
        <p>No customer domains registered.</p>
      ) : (
        rows.map((d) => (
          <article key={d.id} className="domain-card">
            <div className="panel-head">
              <div>
                <h3>{d.hostname}</h3>
                <p>
                  {d.tenant_name} · {d.status}
                  {d.is_primary ? " · Primary" : ""}
                </p>
              </div>
            </div>
            <dl className="domain-states">
              <div>
                <dt>Ownership</dt>
                <dd>{d.ownership_status}</dd>
              </div>
              <div>
                <dt>Hosting</dt>
                <dd>{d.provider_status}</dd>
              </div>
              <div>
                <dt>Certificate</dt>
                <dd>{d.tls_status}</dd>
              </div>
              <div>
                <dt>Routing</dt>
                <dd>{d.routing_status}</dd>
              </div>
            </dl>
            {d.verified_until && (
              <p>
                Verification lease expires{" "}
                {new Date(d.verified_until).toLocaleString()}. Repeat current
                checks before expiry.
              </p>
            )}
            {d.last_error && <p className="form-error">{d.last_error}</p>}
            <details>
              <summary>DNS instructions & diagnostics</summary>
              <p>{d.instructions.note}</p>
              <p>
                <b>Ownership TXT:</b>{" "}
                <code>{d.instructions.ownership.name}</code>
              </p>
              <p>
                <code>{d.instructions.ownership.value}</code>
              </p>
              {d.instructions.cname ? (
                <p>
                  <b>CNAME:</b> {d.instructions.cname.name} →{" "}
                  {d.instructions.cname.value} · {d.instructions.cname.mode}
                </p>
              ) : (
                <p>
                  CNAME/certificate instructions are unavailable until the
                  operator imports the actual hosting result.
                </p>
              )}
              {d.instructions.providerRecords.map((r, i) => (
                <p key={i}>
                  <b>{r.record_type}:</b> {r.name} → {r.value}
                </p>
              ))}
              <p>
                Registry ID: <code>{d.id}</code> · version {d.version}. Keep ERP
                Workers, DNS, secrets and fallback origins unchanged. Removal
                disables this mapping; the operator must separately detach
                hosting and remove DNS.
              </p>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      JSON.stringify(d.instructions, null, 2),
                    );
                    setNotice("DNS instructions copied.");
                  } catch {
                    setError(
                      "Copy failed. Select and copy the displayed records.",
                    );
                  }
                }}
              >
                Copy instructions
              </button>
            </details>
            {d.status !== "removed" && (
              <div className="table-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void act("verify", { id: d.id })}
                >
                  Check ownership
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rotate the DNS challenge and disable existing access until verification succeeds?",
                      )
                    )
                      void act("rotate", { id: d.id });
                  }}
                >
                  Rotate / reopen
                </button>
                <button
                  className="secondary"
                  disabled={busy || !configured}
                  onClick={() => setSyncId(d.id)}
                >
                  Import hosting receipt
                </button>
                <button
                  className="primary"
                  disabled={busy || !configured}
                  onClick={() => void act("activate", { id: d.id })}
                >
                  Check routing & activate
                </button>
                <button
                  className="secondary"
                  disabled={busy || d.status !== "active"}
                  onClick={() => void act("primary", { id: d.id })}
                >
                  Set primary
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disable customer-domain access immediately?",
                      )
                    )
                      void act("disable", { id: d.id });
                  }}
                >
                  Disable
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this mapping permanently? The hostname remains reserved and cannot be reassigned.",
                      )
                    )
                      void act("remove", { id: d.id });
                  }}
                >
                  Remove mapping
                </button>
              </div>
            )}
          </article>
        ))
      )}
      {syncId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("sync", {
              id: syncId,
              payload: f.get("payload"),
              signature: f.get("signature"),
            });
          }}
        >
          <h3>Signed provider-selection request</h3>
          <p>
            Use scripts/attest-managed-domain.mjs with an actual Cloudflare
            Custom Hostname UUID. The server must retrieve authenticated
            provider status. An offline Sites domain listing cannot prove
            freshness. A company administrator cannot set certificate status
            manually. No hosting secret belongs in this form.
          </p>
          <label className="form-field">
            <span>Receipt payload</span>
            <textarea name="payload" required maxLength={24000} rows={7} />
          </label>
          <label className="form-field">
            <span>Receipt signature</span>
            <input name="signature" required pattern="[a-f0-9]{64}" />
          </label>
          <button className="primary" disabled={busy}>
            Retrieve and import provider status
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setSyncId("")}
          >
            Close
          </button>
        </form>
      )}
    </section>
  );
}
