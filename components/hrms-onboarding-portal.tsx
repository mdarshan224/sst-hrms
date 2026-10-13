"use client";
import Link from "next/link";
import { useState } from "react";
import { useWorkflow, workflowAction } from "./workflow-client";
import Verification from "./hrms-verification";
import Documents from "./hrms-documents";
import Image from "next/image";
import HostedConsent from "./hrms-hosted-consent";
type Detail = {
  case: {
    id: string;
    employee_id: string;
    status: string;
    version: number;
    reason?: string;
    approved_at?: string;
  };
  employee: { full_name: string; designation: string; joining_date: string };
  template: {
    fields: { key: string; label: string; required: boolean }[];
    documents: { category: string; required: boolean }[];
    tasks: { key: string; label: string; owner: string; required: boolean }[];
    privacyNotice: string;
    noticeVersion: string;
    panRequired: boolean;
  };
  form: Record<string, string>;
  offer: {
    terms: string;
    status: string;
    joining_date: string;
    expires_at: string;
  } | null;
  tasks: { task_key: string; completed_at: string }[];
};
export default function OnboardingPortal({
  tenant,
  caseId,
}: {
  tenant: string;
  caseId: string;
}) {
  const { data, error, loading, load } = useWorkflow<Detail>("case", tenant, {
      id: caseId,
      owner: "1",
    }),
    [notice, setNotice] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string, values: Record<string, unknown>) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await workflowAction(action, tenant, {
        id: caseId,
        version: data?.case.version,
        ...values,
      });
      setNotice(
        action === "case.submit"
          ? "Submitted for HR review. Your account remains inactive until approval."
          : "Saved.",
      );
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const editable =
    data && ["in_progress", "correction_required"].includes(data.case.status);
  return (
    <main className="workflow-public">
      <header>
        <Image
          src="/brand/sohan-soft-tech-logo.png"
          alt="Sohan Soft Tech"
          width={60}
          height={60}
        />
        <div>
          <h1>Employee onboarding</h1>
          <p>Complete your joining details securely.</p>
        </div>
        <Link href="/">Workspace</Link>
      </header>
      {(error || actionError) && (
        <p role="alert" className="form-error">
          {error || actionError}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && !data && <p>Loading onboarding…</p>}
      {data && (
        <>
          <section className="panel section-card">
            <h2>{data.employee.full_name}</h2>
            <p>
              {data.employee.designation} · Joining {data.employee.joining_date}
            </p>
            <p>
              Status: <b>{data.case.status.replaceAll("_", " ")}</b>
            </p>
            {data.case.reason && <p>HR decision: {data.case.reason}</p>}
            {data.case.status === "approved" && (
              <p>
                Onboarding approved {data.case.approved_at}. Your verified
                account is now linked to the employee portal.{" "}
                <Link href="/">Open workspace</Link>
              </p>
            )}
          </section>
          {data.offer && (
            <section className="panel section-card">
              <h2>Your employment offer</h2>
              <p>
                Offer status: {data.offer.status} · Expires{" "}
                {data.offer.expires_at}
              </p>
              <pre className="offer-text">{data.offer.terms}</pre>
              {editable && data.offer.status === "approved" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Accept the displayed offer terms?"))
                      void act("offer.accept", { consent: true });
                  }}
                >
                  Accept this offer
                </button>
              )}
            </section>
          )}
          <section className="panel section-card">
            <h2>Joining details</h2>
            <p>{data.template.privacyNotice}</p>
            <form
              className="workflow-form"
              key={caseId}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  fd = new FormData(form),
                  values = Object.fromEntries(
                    data.template.fields.map((f) => [
                      f.key,
                      String(fd.get(f.key) ?? ""),
                    ]),
                  ) as Record<string, string>,
                  submit =
                    (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                      "value",
                    ) === "submit";
                void act(submit ? "case.submit" : "case.save", {
                  data: values,
                  consent: fd.has("consent"),
                });
              }}
            >
              {data.template.fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                  <textarea
                    name={field.key}
                    maxLength={2000}
                    defaultValue={data.form[field.key] ?? ""}
                    disabled={!editable}
                    required={field.required}
                  />
                </label>
              ))}
              <label className="workflow-wide">
                <input type="checkbox" name="consent" disabled={!editable} /> I
                consent to this employment onboarding purpose and confirm the
                details are correct. Notice {data.template.noticeVersion}.
              </label>
              <p className="workflow-wide footnote">
                Do not enter PAN, Aadhaar, banking credentials or OTPs in these
                fields. Verification is completed separately.
              </p>
              {editable && (
                <div className="workflow-wide">
                  <button
                    className="secondary"
                    name="action"
                    value="save"
                    formNoValidate
                    disabled={busy}
                  >
                    Save progress
                  </button>{" "}
                  <button
                    className="primary"
                    name="action"
                    value="submit"
                    disabled={busy}
                  >
                    Submit to HR
                  </button>
                </div>
              )}
            </form>
          </section>
          {editable && (
            <Verification
              tenant={tenant}
              view="self"
              caseId={caseId}
              onChanged={() => void load()}
            />
          )}
          {(editable || data.case.status === "submitted") && (
            <>
              {editable && <HostedConsent tenant={tenant} caseId={caseId} />}
              <Documents
                tenant={tenant}
                caseId={caseId}
                editable={Boolean(editable)}
              />
            </>
          )}
          <section className="panel section-card">
            <h2>Required documents</h2>
            {data.template.documents.length ? (
              <ul>
                {data.template.documents.map((d) => (
                  <li key={d.category}>
                    {d.category.replaceAll("_", " ")} ·{" "}
                    {d.required ? "required" : "optional"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>This template does not require documents.</p>
            )}
            <p>
              Uploads, scanner clearance and HR approval are distinct steps.
            </p>
          </section>
          <section className="panel section-card">
            <h2>Joining checklist</h2>
            {data.template.tasks.map((task) => {
              const complete = data.tasks.some((t) => t.task_key === task.key);
              return (
                <div className="workflow-task" key={task.key}>
                  <span>
                    {task.label} · {task.owner}
                    {task.required ? " · required" : ""}
                  </span>
                  {complete ? (
                    <b>Completed</b>
                  ) : task.owner === "employee" && editable ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act("task.complete", { taskKey: task.key })
                      }
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span>Pending</span>
                  )}
                </div>
              );
            })}
          </section>
          <button
            className="secondary"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh authoritative status
          </button>
        </>
      )}
    </main>
  );
}
