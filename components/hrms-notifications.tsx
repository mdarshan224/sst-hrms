"use client";
import { useState } from "react";
import { useWorkflow, workflowAction } from "./workflow-client";
import { SectionHeader, Feedback, EmptyState } from "./hrms-ui";
export default function Notifications({ tenant }: { tenant: string }) {
  const { data, error, loading, load } = useWorkflow<{
    rows: {
      id: string;
      kind: string;
      created_at: string;
      read_at: string | null;
    }[];
  }>("notifications", tenant);
  const [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <section className="panel section-card">
      <SectionHeader
        title="Workflow notifications"
        description="Updates from your company’s onboarding workflows."
        actions={
          <button
            className="secondary"
            type="button"
            disabled={loading || !!busy}
            onClick={() => {
              setActionError("");
              setNotice("");
              void load();
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      <Feedback error={error || actionError} notice={notice} />
      {loading && !data && <p role="status">Loading notifications…</p>}
      {data && !data.rows.length && (
        <EmptyState title="You’re up to date">
          No workflow notifications in this workspace.
        </EmptyState>
      )}
      {data?.rows.map((r) => (
        <article className="workflow-task" key={r.id}>
          <div>
            <p>{r.kind.replaceAll(".", " · ")}</p>
            <small>
              {r.created_at} · {r.read_at ? "Read" : "Unread"}
            </small>
          </div>
          {!r.read_at && (
            <button
              type="button"
              className="secondary"
              disabled={!!busy || loading}
              onClick={async () => {
                if (busy) return;
                setBusy(r.id);
                setActionError("");
                setNotice("");
                try {
                  await workflowAction("notification.read", tenant, {
                    id: r.id,
                  });
                  setNotice("Notification marked as read.");
                  await load();
                } catch (e) {
                  setActionError(
                    e instanceof Error
                      ? e.message
                      : "Could not mark this notification as read.",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === r.id ? "Saving…" : "Mark read"}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
