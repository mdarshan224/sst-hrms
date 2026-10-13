"use client";
import { useState, useEffect } from "react";
import { useWorkflow, workflowAction } from "./workflow-client";
import Verification from "./hrms-verification";
import Documents from "./hrms-documents";
type R = Record<string, string | number | null>;
type Template = {
  id: string;
  name: string;
  definition: string;
  version: number;
};
type Queue = { rows: R[]; page: number };
type Definition = {
  fields: { key: string; label: string; required: boolean }[];
  documents: { category: string; required: boolean }[];
  tasks: { key: string; label: string; owner: string; required: boolean }[];
  privacyNotice: string;
  noticeVersion: string;
};
function SubjectSearch({
  tenant,
  name,
  kind,
}: {
  tenant: string;
  name: string;
  kind: "candidate" | "employee";
}) {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState<{ id: string; full_name: string }[]>([]),
    [chosen, setChosen] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const u = new URLSearchParams({
            view: kind === "candidate" ? "candidates" : "employees",
            tenant,
            q,
            pageSize: "10",
            status: "all",
          }),
          r = await fetch("/api/hrms?" + u, { cache: "no-store" }),
          b = (await r.json()) as {
            rows: { id: string; full_name: string }[];
            error?: string;
          };
        if (!r.ok) throw new Error(b.error ?? "Search unavailable");
        if (active) {
          setRows(b.rows);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Search unavailable");
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, tenant, kind]);
  return (
    <fieldset className="subject-search">
      <legend>
        {kind === "candidate"
          ? "Search selected candidate"
          : "Search employee record"}
      </legend>
      <input
        aria-label={`Search ${kind} by name or email`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or email"
      />
      <select
        aria-label={`Select ${kind}`}
        name={name}
        value={chosen}
        required
        onChange={(e) => setChosen(e.target.value)}
      >
        <option value="">Select a record</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name}
          </option>
        ))}
      </select>
      {error && <small role="alert">{error}</small>}
    </fieldset>
  );
}
export default function WorkflowAdmin({
  tenant,
  settings = false,
  canReviewDocuments = false,
}: {
  tenant: string;
  settings?: boolean;
  canReviewDocuments?: boolean;
}) {
  const templates = useWorkflow<{
      rows: Template[];
      defaultDefinition: Definition;
    }>("templates", tenant),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    queue = useWorkflow<Queue>(
      "queue",
      tenant,
      { status, page: String(page) },
      !settings,
    ),
    [selected, setSelected] = useState(""),
    detail = useWorkflow<{
      case: R;
      employee: R;
      template: Definition;
      form: Record<string, string>;
      offer: R | null;
      tasks: R[];
      history: R[];
    }>("case", tenant, { id: selected }, Boolean(selected)),
    [recordType, setRecordType] = useState<"employee" | "candidate">(
      "employee",
    ),
    [inviteUrl, setInviteUrl] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [templateId, setTemplateId] = useState("");
  async function act(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await workflowAction(action, tenant, data);
      if (result.inviteUrl) setInviteUrl(String(result.inviteUrl));
      setNotice("Saved. External invitation delivery is not configured.");
      await queue.load();
      if (selected) await detail.load();
      if (settings) await templates.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  const template = templates.data?.rows.find((t) => t.id === templateId);
  const definition: Definition | undefined = template
    ? JSON.parse(template.definition)
    : templates.data?.defaultDefinition;
  const fields = templates.data?.defaultDefinition.fields ?? [];
  if (settings)
    return (
      <section className="panel section-card">
        <h2>Onboarding templates</h2>
        <p>
          Templates support approved personal fields, document checklists,
          privacy notices and employee/HR joining tasks. Identity and bank
          values are not general form fields.
        </p>
        {(templates.error || error) && (
          <p role="alert">{templates.error || error}</p>
        )}
        {notice && <p role="status">{notice}</p>}
        <label>
          Template{" "}
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Create a new template</option>
            {templates.data?.rows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.version}
              </option>
            ))}
          </select>
        </label>
        {templates.loading && <p role="status">Loading templates…</p>}
        {templates.data && (
          <form
            className="workflow-form"
            key={templateId}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                void act("template.save", {
                  id: template?.id,
                  name: f.get("name"),
                  definition: {
                    fields: fields
                      .filter((v) => f.has("field_" + v.key))
                      .map((v) => ({
                        ...v,
                        label: String(f.get("label_" + v.key)),
                        required: f.has("required_" + v.key),
                      })),
                    documents: [
                      "resume",
                      "education",
                      "signed_offer",
                      "employment",
                    ]
                      .filter((v) => f.has("doc_" + v))
                      .map((category) => ({
                        category,
                        required: f.has("doc_required_" + category),
                      })),
                    tasks: (definition?.tasks ?? [])
                      .filter((v) => f.has("task_" + v.key))
                      .map((v) => ({
                        ...v,
                        label: String(f.get("task_label_" + v.key)),
                        required: f.has("task_required_" + v.key),
                      })),
                    privacyNotice: String(f.get("privacyNotice")),
                    noticeVersion: String(f.get("noticeVersion")),
                  },
                  version: template?.version ?? 0,
                });
              } catch {
                setError("Template definition must be valid JSON.");
              }
            }}
          >
            <label>
              Template name{" "}
              <input
                name="name"
                required
                minLength={2}
                defaultValue={template?.name ?? "Standard joining"}
              />
            </label>
            <fieldset className="workflow-wide">
              <legend>Personal form fields</legend>
              {fields.map((v) => (
                <div key={v.key}>
                  <label>
                    <input
                      type="checkbox"
                      name={"field_" + v.key}
                      defaultChecked={definition?.fields.some(
                        (x) => x.key === v.key,
                      )}
                    />
                    Collect {v.label}
                  </label>
                  <label>
                    Field label
                    <input
                      name={"label_" + v.key}
                      defaultValue={
                        definition?.fields.find((x) => x.key === v.key)
                          ?.label ?? v.label
                      }
                      maxLength={80}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name={"required_" + v.key}
                      defaultChecked={
                        definition?.fields.find((x) => x.key === v.key)
                          ?.required
                      }
                    />
                    Required
                  </label>
                </div>
              ))}
            </fieldset>
            <fieldset className="workflow-wide">
              <legend>Document checklist</legend>
              {["resume", "education", "signed_offer", "employment"].map(
                (category) => (
                  <div key={category}>
                    <label>
                      <input
                        type="checkbox"
                        name={"doc_" + category}
                        defaultChecked={definition?.documents.some(
                          (x) => x.category === category,
                        )}
                      />
                      {category.replaceAll("_", " ")}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name={"doc_required_" + category}
                        defaultChecked={
                          definition?.documents.find(
                            (x) => x.category === category,
                          )?.required
                        }
                      />
                      Required before activation
                    </label>
                  </div>
                ),
              )}
            </fieldset>
            <fieldset className="workflow-wide">
              <legend>Joining tasks</legend>
              {definition?.tasks.map((v) => (
                <div key={v.key}>
                  <label>
                    <input
                      type="checkbox"
                      name={"task_" + v.key}
                      defaultChecked
                    />
                    Include {v.owner} task
                  </label>
                  <label>
                    Task label
                    <input
                      name={"task_label_" + v.key}
                      defaultValue={v.label}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name={"task_required_" + v.key}
                      defaultChecked={v.required}
                    />
                    Required
                  </label>
                </div>
              ))}
            </fieldset>
            <label className="workflow-wide">
              Privacy notice
              <textarea
                name="privacyNotice"
                required
                minLength={30}
                maxLength={4000}
                defaultValue={definition?.privacyNotice}
              />
            </label>
            <label>
              Notice version
              <input
                name="noticeVersion"
                required
                pattern="[A-Za-z0-9._-]{1,40}"
                defaultValue={definition?.noticeVersion}
              />
            </label>
            <button className="primary" disabled={busy}>
              Save versioned template
            </button>
          </form>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Purge encrypted submissions from closed cases older than 90 days? Metadata and employment history are retained.",
              )
            )
              void act("case.purge_private", {});
          }}
        >
          Purge expired private submissions
        </button>
        {canReviewDocuments && (
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Delete expired private objects under the documented retention policy?",
                )
              )
                void act("document.purge", {});
            }}
          >
            Purge expired documents
          </button>
        )}
      </section>
    );
  return (
    <>
      <section className="panel section-card">
        <div className="panel-head">
          <div>
            <h2>Onboarding invitations</h2>
            <p>
              Draft employee records remain inactive until verified submission
              and authorized approval.
            </p>
          </div>
          <button
            disabled={busy || queue.loading}
            onClick={() => void queue.load()}
          >
            {queue.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {queue.loading && <p role="status">Loading onboarding records…</p>}
        {(queue.error || error) && <p role="alert">{queue.error || error}</p>}
        {notice && <p role="status">{notice}</p>}
        {templates.error && (
          <p className="footnote">
            Template access requires company settings permission. Ask a company
            administrator to configure templates.
          </p>
        )}
        <form
          className="workflow-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("case.create", {
              templateId: f.get("templateId"),
              employeeId:
                recordType === "employee" ? f.get("employeeId") : undefined,
              candidateId:
                recordType === "candidate" ? f.get("candidateId") : undefined,
              offerId:
                recordType === "candidate" ? f.get("offerId") : undefined,
              mobile: f.get("mobile"),
              expiryHours: Number(f.get("expiryHours")),
            });
          }}
        >
          <label>
            Joining template{" "}
            <select name="templateId" required>
              <option value="">Choose configured template</option>
              {templates.data?.rows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Record type{" "}
            <select
              value={recordType}
              onChange={(e) =>
                setRecordType(e.target.value as "employee" | "candidate")
              }
            >
              <option value="employee">Existing employee record</option>
              <option value="candidate">Selected candidate</option>
            </select>
          </label>
          <SubjectSearch
            key={`${tenant}:${recordType}`}
            tenant={tenant}
            name={recordType === "employee" ? "employeeId" : "candidateId"}
            kind={recordType}
          />
          {recordType === "candidate" && (
            <label>
              Approved offer reference{" "}
              <input
                name="offerId"
                required
                placeholder="Copy the approved offer reference from Recruitment"
              />
            </label>
          )}
          <label>
            Intended mobile{" "}
            <input
              name="mobile"
              required
              pattern="[6-9][0-9]{9}"
              maxLength={10}
            />
          </label>
          <label>
            Expiry hours{" "}
            <input
              name="expiryHours"
              type="number"
              min={1}
              max={168}
              defaultValue={48}
              required
            />
          </label>
          <button
            className="primary"
            disabled={busy || !templates.data?.rows.length}
          >
            Generate secure invitation
          </button>
        </form>
        {inviteUrl && (
          <div className="workflow-diagnostics">
            <p>
              This link is shown after creation/rotation. It is not an admin
              credential. Verify the intended mobile before sharing.
            </p>
            <input
              readOnly
              value={inviteUrl}
              aria-label="New secure onboarding invitation"
            />
            <button
              disabled={busy}
              onClick={() =>
                void navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => setNotice("Invitation link copied."))
                  .catch(() =>
                    setError(
                      "Clipboard access denied. Select the displayed link manually.",
                    ),
                  )
              }
            >
              Copy link
            </button>
          </div>
        )}
        <label>
          Status{" "}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {[
              "all",
              "invited",
              "in_progress",
              "submitted",
              "correction_required",
              "approved",
              "rejected",
              "revoked",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Records table, scroll for all columns"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Status</th>
                <th scope="col">Invitation expiry</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {queue.data?.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.full_name} <small>{row.employee_code}</small>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.expires_at}</td>
                  <td>
                    <button onClick={() => setSelected(String(row.id))}>
                      Open onboarding record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {queue.data && !queue.data.rows.length && (
          <p>No onboarding records in this view.</p>
        )}
        <button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>
          Previous
        </button>{" "}
        Page {page}{" "}
        <button
          disabled={(queue.data?.rows.length ?? 0) < 25 || busy}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </section>
      {selected && (
        <section className="panel section-card">
          <h2>Onboarding review</h2>
          {detail.error && <p role="alert">{detail.error}</p>}
          {detail.data && (
            <>
              <h3>{detail.data.employee.full_name}</h3>
              <p>Status: {detail.data.case.status}</p>
              <dl>
                {Object.entries(detail.data.form).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replaceAll("_", " ")}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {detail.data.template.tasks.map((task) => (
                <div className="workflow-task" key={task.key}>
                  <span>
                    {task.label} · {task.owner}
                  </span>
                  {detail.data!.tasks.some((t) => t.task_key === task.key) ? (
                    <b>Completed</b>
                  ) : task.owner === "hr" ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act("task.complete", {
                          id: selected,
                          taskKey: task.key,
                        })
                      }
                    >
                      Complete HR task
                    </button>
                  ) : (
                    <span>Awaiting employee acknowledgement</span>
                  )}
                </div>
              ))}
              {detail.data.case.status === "submitted" && (
                <form
                  className="workflow-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("case.review", {
                      id: selected,
                      version: Number(detail.data!.case.version),
                      decision: f.get("decision"),
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label>
                    HR decision{" "}
                    <select name="decision">
                      <option value="correction_required">
                        Request corrections
                      </option>
                      <option value="rejected">Reject</option>
                      <option value="approved">Approve and activate</option>
                    </select>
                  </label>
                  <label>
                    Reason{" "}
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={500}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Record authorized decision
                  </button>
                </form>
              )}
              {!["approved", "rejected", "revoked"].includes(
                String(detail.data.case.status),
              ) && (
                <div className="workflow-table-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Rotate the invitation link? The prior link will stop working.",
                        )
                      )
                        void act("case.rotate", { id: selected });
                    }}
                  >
                    Rotate link
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for revoking this onboarding invitation",
                      );
                      if (reason)
                        void act("case.revoke", { id: selected, reason });
                    }}
                  >
                    Revoke invitation
                  </button>
                </div>
              )}
              {["revoked", "rejected"].includes(
                String(detail.data.case.status),
              ) && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(
                      "Reason to reissue to the same verified mobile recipient",
                    );
                    if (reason)
                      void act("case.reissue", { id: selected, reason });
                  }}
                >
                  Reissue to same recipient
                </button>
              )}
              <details>
                <summary>Immutable workflow audit</summary>
                <ul>
                  {detail.data.history.map((h, i) => (
                    <li key={i}>
                      {h.created_at} · {h.action}
                    </li>
                  ))}
                </ul>
              </details>
              <Verification
                view="employee"
                tenant={tenant}
                employeeId={String(detail.data.case.employee_id)}
              />
              <Documents
                tenant={tenant}
                employeeId={String(detail.data.case.employee_id)}
                editable={false}
                reviewable={canReviewDocuments}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
export { SubjectSearch };
