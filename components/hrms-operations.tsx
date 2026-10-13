"use client";
import { useState } from "react";
import { useJsonResource } from "./use-json-resource";
import { SectionHeader, StatusItem, EmptyState, Feedback } from "./hrms-ui";
type Row = Record<string, string | number | null>;
type Data = {
  jobs: Row[];
  webhooks: Row[];
  scannerConfigured: boolean;
  dataEncryptionConfigured: boolean;
};
export default function Operations() {
  const {
    data,
    error: loadError,
    loading,
    load,
  } = useJsonResource<Data>("/api/operations");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  async function act(id: string) {
    if (
      busy ||
      !window.confirm(
        "Requeue this job after reviewing its configuration and diagnostic?",
      )
    )
      return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Retry unavailable.");
      setNotice(
        "Job requeued. Completion depends on the configured job runner.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry unavailable.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel section-card">
      <SectionHeader
        title="Workflow operations"
        description="Monitor background jobs and signed webhook receipts. Employee forms and identity payloads are excluded."
        actions={
          <button
            type="button"
            className="secondary"
            disabled={!!busy || loading}
            onClick={() => {
              setError("");
              setNotice("");
              void load();
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      <Feedback error={error || loadError} notice={notice} />
      {loading && !data && (
        <p className="loading-state" role="status">
          Loading workflow operations…
        </p>
      )}
      {data && (
        <>
          <div className="status-grid">
            <StatusItem
              label="Encrypted onboarding"
              status={
                data.dataEncryptionConfigured
                  ? "Configured"
                  : "Missing configuration"
              }
              tone={data.dataEncryptionConfigured ? "ready" : "warning"}
            >
              {data.dataEncryptionConfigured
                ? "Encryption key configuration is present. This is not a backup or recovery test."
                : "An operator must configure the onboarding encryption key."}
            </StatusItem>
            <StatusItem
              label="Scanner adapter"
              status={
                data.scannerConfigured
                  ? "Configured · validation required"
                  : "Unavailable"
              }
              tone="warning"
            >
              {data.scannerConfigured
                ? "Validate the live scanner engine before relying on clearance."
                : "Configure an authenticated scanner service and the job runner."}
            </StatusItem>
            <StatusItem
              label="Document quarantine"
              status="Clearance required"
              tone="neutral"
            >
              Files remain quarantined until an authenticated clean scan is
              recorded for the exact stored file.
            </StatusItem>
          </div>
          <section className="settings-section">
            <h3>Workflow jobs</h3>
            <p>
              Retries retain the original job. Review diagnostics and
              configuration before requeueing.
            </p>
            {data.jobs.length ? (
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Workflow jobs, scroll for all columns"
              >
                <table className="operations-table">
                  <caption className="sr-only">
                    Workflow jobs and recovery actions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Company / job</th>
                      <th scope="col">State</th>
                      <th scope="col">Attempts</th>
                      <th scope="col">Diagnostic</th>
                      <th scope="col">Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <b>{j.company}</b>
                          <small>{String(j.kind).replaceAll("_", " ")}</small>
                        </td>
                        <td>
                          <span className="status-badge neutral">
                            {String(j.status).replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="numeric">{j.attempts}</td>
                        <td>{j.last_error ?? "No error recorded"}</td>
                        <td>
                          {["blocked", "dead_letter"].includes(
                            String(j.status),
                          ) ? (
                            <button
                              type="button"
                              className="secondary"
                              disabled={!!busy || loading}
                              onClick={() => void act(String(j.id))}
                            >
                              {busy === j.id
                                ? "Requeueing…"
                                : "Requeue after review"}
                            </button>
                          ) : (
                            <span className="muted-text">
                              No recovery action
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No workflow jobs">
                Jobs will appear when an enabled workflow schedules background
                work.
              </EmptyState>
            )}
          </section>
          <section className="settings-section">
            <h3>Webhook delivery inbox</h3>
            <p>
              Receipt and processing status are separate. A signed receipt alone
              does not verify an employee.
            </p>
            {data.webhooks.length ? (
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Webhook delivery inbox"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Received</th>
                      <th scope="col">Environment</th>
                      <th scope="col">Processing status</th>
                      <th scope="col">Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.webhooks.map((w) => (
                      <tr key={w.id}>
                        <td>{w.received_at}</td>
                        <td>{w.mode}</td>
                        <td>
                          {String(w.processing_status).replaceAll("_", " ")}
                        </td>
                        <td>{w.last_error ?? "No error recorded"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No signed webhook receipts">
                Delivery information appears after the provider sends an
                accepted event.
              </EmptyState>
            )}
          </section>
        </>
      )}
    </section>
  );
}
