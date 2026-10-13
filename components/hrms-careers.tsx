"use client";
import { useEffect, useRef, useState } from "react";
type Job = { id: string; title: string; description: string; location: string };
export default function Careers({
  slug,
  name,
  jobs,
}: {
  slug: string;
  name: string;
  jobs: Job[];
}) {
  const application = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (chosen) application.current?.focus();
  }, [chosen]);
  return (
    <main className="workflow-public">
      <h1>{name} · Careers</h1>
      {!jobs.length && <p>No published openings.</p>}
      {jobs.map((j) => (
        <article className="panel section-card" key={j.id}>
          <h2>{j.title}</h2>
          <p>{j.location}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{j.description}</p>
          <button
            className="secondary"
            disabled={busy}
            type="button"
            onClick={() => {
              setChosen(j.id);
              setMessage("");
            }}
          >
            Apply
          </button>
        </article>
      ))}
      {chosen && (
        <section ref={application} tabIndex={-1} className="panel section-card">
          <h2>Apply for {jobs.find((job) => job.id === chosen)?.title}</h2>
          <form
            className="workflow-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setFailed(false);
              setBusy(true);
              setMessage("");
              try {
                const r = await fetch(
                    "/api/careers?" + new URLSearchParams({ slug }),
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        jobId: chosen,
                        name: f.get("name"),
                        email: f.get("email"),
                        mobile: f.get("mobile"),
                        consent: f.has("consent"),
                      }),
                    },
                  ),
                  b = (await r.json()) as {
                    error?: string;
                    reference?: string;
                  };
                if (!r.ok)
                  throw new Error(
                    b.error ??
                      "Application could not be submitted. Please retry.",
                  );
                setMessage("Application received. Reference: " + b.reference);
                setChosen("");
              } catch (e) {
                setFailed(true);
                setMessage(
                  e instanceof Error ? e.message : "Application failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Full name
              <input name="name" autoComplete="name" required maxLength={160} />
            </label>
            <label>
              Email
              <input
                name="email"
                autoComplete="email"
                type="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Mobile
              <input
                name="mobile"
                type="tel"
                autoComplete="tel-national"
                pattern="[6-9][0-9]{9}"
                required
              />
            </label>
            <label>
              <input type="checkbox" name="consent" required />I consent to this
              company processing these contact details for recruitment. Contact
              its HR team for access, correction and retention questions.
            </label>
            <div className="workflow-wide form-actions">
              <button className="primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit application"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setChosen("")}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {message && (
        <p
          className={`alert ${failed ? "error" : "success"}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </main>
  );
}
