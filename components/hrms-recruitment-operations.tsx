"use client";
import { useState } from "react";
import { useWorkflow, workflowAction } from "./workflow-client";
import { SubjectSearch } from "./hrms-workflow-admin";
type R = Record<string, string | number | null>;
export default function RecruitmentOperations({ tenant }: { tenant: string }) {
  const flow = useWorkflow<{ offers: R[]; interviews: R[] }>(
      "recruitment",
      tenant,
    ),
    publications = useWorkflow<{ rows: R[] }>("publications", tenant),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workflowAction(action, tenant, data);
      setNotice("Saved to the company recruitment records.");
      await flow.load();
      await publications.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-card">
      <h2>Interviews, offers and careers publishing</h2>
      {(error || flow.error) && <p role="alert">{error || flow.error}</p>}
      {flow.loading && <p role="status">Loading recruitment records…</p>}
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>Schedule an internal interview</summary>
        <form
          className="workflow-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              void act("interview.schedule", {
                candidateId: f.get("candidateId"),
                scheduledAt: new Date(String(f.get("time"))).toISOString(),
                durationMinutes: Number(f.get("duration")),
                panel: String(f.get("panel"))
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              });
            } catch {
              setError("Enter a valid future interview time.");
            }
          }}
        >
          <SubjectSearch kind="candidate" name="candidateId" tenant={tenant} />
          <label>
            Interview time (your device timezone){" "}
            <input type="datetime-local" name="time" required />
          </label>
          <label>
            Duration minutes{" "}
            <input
              name="duration"
              type="number"
              min={15}
              max={240}
              defaultValue={60}
              required
            />
          </label>
          <label>
            Company interviewer user references (comma-separated){" "}
            <input name="panel" required />
          </label>
          <button className="primary" disabled={busy}>
            Schedule interview
          </button>
        </form>
        <p className="footnote">
          Internal scheduling is persistent. External calendar invitations and
          messaging delivery are not configured.
        </p>
      </details>
      <details>
        <summary>Prepare an employment offer</summary>
        <form
          className="workflow-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              void act("offer.create", {
                candidateId: f.get("candidateId"),
                terms: f.get("terms"),
                joiningDate: f.get("joining"),
                expiresAt: new Date(String(f.get("expiry"))).toISOString(),
              });
            } catch {
              setError("Enter a valid offer expiry.");
            }
          }}
        >
          <SubjectSearch kind="candidate" name="candidateId" tenant={tenant} />
          <label>
            Joining date <input name="joining" type="date" required />
          </label>
          <label>
            Offer expiry (your device timezone){" "}
            <input name="expiry" type="datetime-local" required />
          </label>
          <label className="workflow-wide">
            Offer terms{" "}
            <textarea name="terms" minLength={50} maxLength={10000} required />
          </label>
          <button className="primary" disabled={busy}>
            Create draft offer
          </button>
        </form>
      </details>
      <h3>Offer approval queue</h3>
      {flow.data?.offers.length ? (
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Records table, scroll for all columns"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Status</th>
                <th scope="col">Joining / expiry</th>
                <th scope="col">Offer</th>
              </tr>
            </thead>
            <tbody>
              {flow.data.offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.full_name}</td>
                  <td>{o.status}</td>
                  <td>
                    {o.joining_date} · {o.expires_at}
                  </td>
                  <td>
                    <details>
                      <summary>Read offer and reference</summary>
                      <pre className="offer-text">{o.terms}</pre>
                      <code>{o.id}</code>
                    </details>
                    {o.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act("offer.approve", {
                            id: o.id,
                            version: Number(o.version),
                          })
                        }
                      >
                        Approve as independent checker
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : flow.data ? (
        <p>
          No offers yet. Approval requires a checker with explicit workflow
          authority.
        </p>
      ) : null}
      <h3>Scheduled interviews</h3>
      <ul>
        {flow.data?.interviews.map((i) => (
          <li key={i.id}>
            {i.full_name} · {i.scheduled_at} · {i.duration_minutes} minutes ·{" "}
            {i.status}
          </li>
        ))}
      </ul>
      {flow.data && !flow.data.interviews.length && (
        <p>No internal interviews scheduled.</p>
      )}
      <h3>Public careers visibility</h3>
      <p>
        Existing internal vacancies stay private until explicitly published.
      </p>
      {publications.error && <p>{publications.error}</p>}
      {publications.data?.rows.map((j) => (
        <div className="workflow-task" key={j.id}>
          <span>
            {j.title} · {j.enabled ? "publicly listed" : "private"} · {j.status}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void act("job.publish", { id: j.id, enabled: !j.enabled })
            }
          >
            {j.enabled ? "Unpublish" : "Publish to careers"}
          </button>
        </div>
      ))}
    </section>
  );
}
