"use client";
import { useState } from "react";
import { useWorkflow, workflowAction } from "./workflow-client";
type Row = {
  id: string;
  status: string;
  expires_at: string;
  provider_reference?: string;
};
export default function HostedConsent({
  tenant,
  caseId,
}: {
  tenant: string;
  caseId?: string;
}) {
  const { data, error, loading, load } = useWorkflow<{
      rows: Row[];
      available: boolean;
    }>("hosted", tenant),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [request, setRequest] = useState("");
  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const requestId = request || crypto.randomUUID();
    setRequest(requestId);
    try {
      const r = await workflowAction("hosted.start", tenant, {
        caseId,
        requestId,
        consent: true,
      });
      setMessage(String(r.status));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Consent unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-card">
      <h2>Optional DigiLocker consent</h2>
      <p>
        Available only when enabled by your company and validated for the
        Cashfree account. This release requests PAN sharing consent through
        Cashfree. It does not retrieve documents or mark your identity verified.
        Never share a DigiLocker password or OTP with HR.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading && !data ? (
        <p role="status">Checking hosted consent availability…</p>
      ) : data?.available ? (
        <form onSubmit={start}>
          <label>
            <input type="checkbox" required />I authorize initiating a hosted
            DigiLocker PAN-sharing consent request for employment onboarding.
          </label>
          <button className="primary" disabled={busy || loading}>
            {busy ? "Starting…" : "Start hosted consent"}
          </button>
        </form>
      ) : (
        !error && (
          <p className="alert warning">
            Hosted consent is not enabled or configured for this company.
          </p>
        )
      )}
      {data?.rows.map((r) => (
        <article key={r.id}>
          <p>
            {r.status} · Reference {r.provider_reference ?? "pending"} ·{" "}
            {r.expires_at}
          </p>
          {r.status === "pending" && new Date(r.expires_at) > new Date() && (
            <a
              href={
                "/api/verification/hosted?" +
                new URLSearchParams({ tenant, id: r.id })
              }
            >
              Continue at Cashfree
            </a>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await workflowAction("hosted.inquire", tenant, { id: r.id });
                setMessage(
                  "Status inquiry queued. Refresh after the configured job runner processes it.",
                );
                await load();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Inquiry failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Query original status
          </button>
        </article>
      ))}
    </section>
  );
}
