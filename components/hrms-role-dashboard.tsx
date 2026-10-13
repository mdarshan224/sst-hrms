"use client";
import { useEffect, useState } from "react";
import {
  Users,
  ClipboardCheck,
  BriefcaseBusiness,
  UserRound,
  ArrowRight,
} from "lucide-react";
type Row = Record<string, string | number | null>;
type Page = { rows: Row[]; total: number; page: number; totalPages: number };
type Snapshot = {
  employee?: Row;
  requests?: Row[];
  team?: Page;
  queue?: Row[];
  candidates?: Page | null;
  jobs?: Page | null;
  stats?: {
    employeeActive: number | null;
    candidateActive: number | null;
    openJobs: number | null;
  };
};
export const modeLabels: Record<string, string> = {
  admin: "Company administration",
  hr: "HR operations",
  recruiter: "Recruitment",
  manager: "My team",
  employee: "My workspace",
  workspace: "Workspace overview",
};
export default function RoleDashboard({
  tenant,
  mode,
  revision,
  onAction,
  onNavigate,
}: {
  tenant: string;
  mode: string;
  revision: number;
  onAction: (action: string, values: Record<string, unknown>) => Promise<void>;
  onNavigate: (view: string) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<Row | null>(null),
    [decision, setDecision] = useState("approved");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        view: "dashboard",
        tenant,
        mode,
        page: String(page),
        q: search,
      });
      fetch("/api/hrms?" + params)
        .then(async (r) => {
          const d = (await r.json()) as Snapshot & { error?: string };
          if (!r.ok)
            throw new Error(d.error ?? "Could not load your dashboard.");
          if (active) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setData(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tenant, mode, revision, page, search, retry]);
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    action: string,
  ) {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const values: Record<string, unknown> = {};
      fd.forEach((v, k) => (values[k] = String(v)));
      if (action === "profile.review") {
        values.id = review?.id;
        values.version = review?.version;
        values.decision = decision;
      }
      await onAction(action, values);
      setReview(null);
      setRetry((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data)
    return (
      <section className="panel role-loading" role="status">
        Loading {modeLabels[mode]?.toLowerCase()}…
      </section>
    );
  if (error && !data)
    return (
      <section className="panel role-loading">
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
          Retry
        </button>
      </section>
    );
  if (!data) return null;
  const e = data.employee;
  return (
    <div className="persona-board" aria-busy={loading || busy}>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {loading && <p role="status">Updating dashboard…</p>}
      <section className="persona-welcome">
        <span className="eyebrow">{modeLabels[mode]}</span>
        <h2>
          {mode === "employee"
            ? `Hello, ${e?.full_name}.`
            : mode === "manager"
              ? `Your team, ${e?.full_name}.`
              : mode === "hr"
                ? "Keep your people moving forward."
                : "Build your next great team."}
        </h2>
        <p>
          {mode === "employee"
            ? "Your employment information and profile requests in one place."
            : mode === "manager"
              ? "A focused view of your active direct reports."
              : mode === "hr"
                ? "Review profile changes and manage employee records."
                : "Open vacancies and the candidates moving through your pipeline."}
        </p>
      </section>
      {mode === "employee" && e && (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  <UserRound size={19} />
                  My employment profile
                </h2>
                <p>
                  {e.employee_code} · {e.designation}
                </p>
              </div>
            </div>
            <div className="settings-grid">
              {[
                ["Full name", e.full_name],
                ["Email", e.email],
                ["Department", e.department ?? "Unassigned"],
                ["Branch", e.branch ?? "Unassigned"],
                ["Reporting manager", e.manager ?? "Unassigned"],
                ["Joining date", e.joining_date],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Request a profile update</h2>
                <p>
                  HR reviews changes to your name and email. Your login mobile
                  is unaffected.
                </p>
              </div>
            </div>
            <form
              className="profile-request-form"
              onSubmit={(event) => submit(event, "profile.request")}
            >
              <label className="form-field">
                Full name
                <input
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={String(e.full_name)}
                />
              </label>
              <label className="form-field">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  defaultValue={String(e.email)}
                />
              </label>
              <label className="form-field">
                Reason
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <button
                className="primary"
                disabled={
                  busy ||
                  (data.requests ?? []).some((r) => r.status === "pending")
                }
              >
                {busy ? "Submitting…" : "Submit for HR review"}
              </button>
              {(data.requests ?? []).some((r) => r.status === "pending") && (
                <p>A request is already awaiting review.</p>
              )}
            </form>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>My request history</h2>
            </div>
            {data.requests?.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Records table, scroll for all columns"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Requested name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Review note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.map((r) => (
                      <tr key={r.id}>
                        <td>{r.full_name}</td>
                        <td>{r.email}</td>
                        <td>
                          <span className="badge">{r.status}</span>
                        </td>
                        <td>{r.review_reason ?? "Awaiting review"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="role-empty">No profile requests yet.</p>
            )}
          </section>
        </>
      )}
      {mode === "manager" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>
                <Users size={19} />
                Direct reports
              </h2>
              <p>
                {data.team?.total ?? 0} active employees reporting directly to
                you.
              </p>
            </div>
            <div className="search">
              <input
                aria-label="Search direct reports"
                placeholder="Search your team"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {data.team?.rows.length ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Records table, scroll for all columns"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">ID</th>
                    <th scope="col">Designation</th>
                    <th scope="col">Department</th>
                    <th scope="col">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.full_name}</td>
                      <td>{r.employee_code}</td>
                      <td>{r.designation}</td>
                      <td>{r.department ?? "Unassigned"}</td>
                      <td>{r.branch ?? "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="role-empty">No direct reports match this view.</p>
          )}
          <div className="pagination">
            <span>
              Page {page} of {data.team?.totalPages ?? 1}
            </span>
            <div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button
                disabled={page >= (data.team?.totalPages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      {mode === "hr" && (
        <>
          <div className="metrics">
            <article className="metric">
              <span>Active employees</span>
              <strong>{data.stats?.employeeActive ?? "—"}</strong>
            </article>
            <article className="metric">
              <span>Profile requests</span>
              <strong>{data.queue?.length ?? 0}</strong>
              <small>Up to 100 pending requests in your scope</small>
            </article>
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  <ClipboardCheck size={19} />
                  Profile approval queue
                </h2>
                <p>
                  Review employee-submitted changes with an auditable decision.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => onNavigate("people")}
              >
                Employee directory <ArrowRight size={15} />
              </button>
            </div>
            {data.queue?.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Records table, scroll for all columns"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Employee</th>
                      <th scope="col">Requested name / email</th>
                      <th scope="col">Reason</th>
                      <th scope="col">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queue.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.current_name}
                          <small>{r.employee_code}</small>
                        </td>
                        <td>
                          {r.full_name}
                          <small>{r.email}</small>
                        </td>
                        <td>{r.reason}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setReview(r);
                              setDecision("approved");
                            }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="role-empty">No profile requests awaiting review.</p>
            )}
          </section>
          {review && (
            <section className="panel">
              <div className="panel-head">
                <h2>Review {review.current_name}</h2>
                <button className="secondary" onClick={() => setReview(null)}>
                  Close
                </button>
              </div>
              <form
                className="profile-request-form"
                onSubmit={(event) => submit(event, "profile.review")}
              >
                <p>
                  Current: {review.current_name} · {review.current_email}
                  <br />
                  Requested: {review.full_name} · {review.email}
                </p>
                <label className="form-field">
                  Decision
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label className="form-field">
                  Review reason
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Record decision"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {mode === "recruiter" && (
        <>
          <div className="metrics">
            <article className="metric">
              <span>Open vacancies</span>
              <strong>{data.stats?.openJobs ?? "—"}</strong>
            </article>
            <article className="metric">
              <span>Active candidates</span>
              <strong>{data.stats?.candidateActive ?? "—"}</strong>
            </article>
          </div>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  <BriefcaseBusiness size={19} />
                  Recent candidates
                </h2>
                <p>Latest ten candidates in your permitted scope.</p>
              </div>
              <button
                className="primary"
                onClick={() => onNavigate("recruitment")}
              >
                Open hiring workspace <ArrowRight size={15} />
              </button>
            </div>
            {data.candidates?.rows.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Records table, scroll for all columns"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Vacancy</th>
                      <th scope="col">Stage</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidates.rows.map((c) => (
                      <tr key={c.id}>
                        <td>{c.full_name}</td>
                        <td>{c.job_title}</td>
                        <td>
                          <span className="badge">{c.stage}</span>
                        </td>
                        <td>{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="role-empty">No candidates to review.</p>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Open vacancies</h2>
            </div>
            {data.jobs?.rows.length ? (
              <div className="item-list">
                {data.jobs.rows.map((j) => (
                  <div key={j.id}>
                    <b>{j.title}</b>
                    <span>{j.location}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="role-empty">No open vacancies in your scope.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
