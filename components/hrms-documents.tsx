"use client";
import { workflowAction } from "./workflow-client";
import { useState } from "react";
import { useJsonResource } from "./use-json-resource";
type Doc = {
  id: string;
  category: string;
  scan_status: string;
  size: number;
  created_at: string;
  review_status: string;
  review_reason?: string;
  document_version: number;
  current_id?: string;
};
export default function Documents({
  tenant,
  caseId,
  employeeId,
  editable = true,
  reviewable = false,
}: {
  tenant: string;
  caseId?: string;
  employeeId?: string;
  editable?: boolean;
  reviewable?: boolean;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState("");
  const {
    data,
    error: loadError,
    loading,
    load,
  } = useJsonResource<{ rows: Doc[] }>(
    "/api/documents?" +
      new URLSearchParams({
        tenant,
        caseId: caseId ?? "",
        employeeId: employeeId ?? "",
      }),
  );
  const rows = data?.rows ?? [];
  async function remove(id: string) {
    if (!window.confirm("Delete this private document?")) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
          `/api/documents?tenant=${encodeURIComponent(tenant)}&id=${id}`,
          { method: "DELETE" },
        ),
        b = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? "Delete failed.");
      setNotice("Document deleted.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-card">
      <div className="panel-head">
        <div>
          <h2>Private documents</h2>
          <p>
            PDF, PNG or JPEG · 2 MiB maximum. No Aadhaar or identity images in
            this release.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            setNotice("");
            void load();
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {(error || loadError) && (
        <p className="alert error" role="alert">
          {error || loadError}
        </p>
      )}
      {loading && !data && <p role="status">Loading private documents…</p>}
      {notice && <p role="status">{notice}</p>}
      {editable && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form),
              rid = requestId || crypto.randomUUID();
            setRequestId(rid);
            data.set("tenant", tenant);
            data.set("requestId", rid);
            if (caseId) data.set("caseId", caseId);
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const r = await fetch("/api/documents", {
                  method: "POST",
                  body: data,
                }),
                b = (await r.json()) as { error?: string; status: string };
              if (!r.ok) throw new Error(b.error ?? "Upload failed.");
              setNotice(`Document stored privately. Scan status: ${b.status}.`);
              form.reset();
              setRequestId("");
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Document category{" "}
            <select name="category">
              <option value="resume">Resume</option>
              <option value="education">Education</option>
              <option value="signed_offer">Signed offer</option>
              <option value="employment">Employment document</option>
            </select>
          </label>
          <label>
            Replace current document (optional){" "}
            <select name="replacesId">
              <option value="">New document</option>
              {rows
                .filter((d) => d.current_id === d.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.category} · version {d.document_version}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Document file{" "}
            <input
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              required
              onChange={() => setRequestId(crypto.randomUUID())}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Working…" : "Upload to private quarantine"}
          </button>
        </form>
      )}
      <p className="footnote">
        An approved scanner must inspect the exact stored file. Until configured
        and cleared, files remain quarantined and cannot be downloaded. Scanning
        does not prove document authenticity or verify identity.
      </p>
      {data &&
        (rows.length ? (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Records table, scroll for all columns"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Scan status</th>
                  <th scope="col">Uploaded</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.category}</td>
                    <td>
                      {d.scan_status} · HR {d.review_status} · v
                      {d.document_version}
                      <small>{d.review_reason}</small>
                    </td>
                    <td>{d.created_at}</td>
                    <td>
                      {d.scan_status === "clean" ? (
                        <a
                          href={`/api/documents?tenant=${encodeURIComponent(tenant)}&id=${d.id}`}
                        >
                          Download private document
                        </a>
                      ) : (
                        <span>Download locked</span>
                      )}{" "}
                      {editable && (
                        <button
                          disabled={busy}
                          onClick={() => void remove(d.id)}
                        >
                          Delete
                        </button>
                      )}
                      {reviewable &&
                        d.scan_status === "clean" &&
                        (!d.current_id || d.current_id === d.id) &&
                        d.review_status === "pending" && (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              setBusy(true);
                              setError("");
                              try {
                                await workflowAction(
                                  "document.review",
                                  tenant,
                                  {
                                    id: d.id,
                                    decision: f.get("decision"),
                                    reason: f.get("reason"),
                                  },
                                );
                                await load();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Review failed.",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <label>
                              Review decision
                              <select name="decision">
                                <option value="approved">Approve</option>
                                <option value="rejected">Reject</option>
                              </select>
                            </label>
                            <label>
                              Reason
                              <input
                                name="reason"
                                required
                                minLength={10}
                                maxLength={1000}
                              />
                            </label>
                            <button disabled={busy}>
                              Record independent HR review
                            </button>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No private documents uploaded.</p>
        ))}
    </section>
  );
}
