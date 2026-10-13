"use client";
import { useId, useState } from "react";
import Verification from "./hrms-verification";
import Documents from "./hrms-documents";
export default function ProfileTabs({
  tenant,
  employee,
  onClose,
  canReviewDocuments,
}: {
  tenant: string;
  employee: {
    id: string;
    full_name: string;
    employee_code: string;
    designation: string;
    email: string;
  };
  onClose: () => void;
  canReviewDocuments: boolean;
}) {
  const [tab, setTab] = useState("summary");
  const id = useId();
  const tabs = ["summary", "verification", "documents"];
  return (
    <section className="panel section-card">
      <div className="panel-head">
        <div>
          <h2>{employee.full_name}</h2>
          <p>{employee.employee_code} · Employee profile</p>
        </div>
        <button onClick={onClose}>Close profile</button>
      </div>
      <div
        className="workflow-tabs"
        role="tablist"
        aria-label="Employee profile sections"
      >
        {tabs.map((t, index) => (
          <button
            key={t}
            type="button"
            id={`${id}-${t}`}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next]);
              document.getElementById(`${id}-${tabs[next]}`)?.focus();
            }}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
      >
        {tab === "summary" && (
          <dl>
            <dt>Designation</dt>
            <dd>{employee.designation}</dd>
            <dt>Email</dt>
            <dd>{employee.email}</dd>
          </dl>
        )}
        {tab === "verification" && (
          <Verification
            view="employee"
            tenant={tenant}
            employeeId={employee.id}
          />
        )}{" "}
        {tab === "documents" && (
          <Documents
            tenant={tenant}
            employeeId={employee.id}
            editable={false}
            reviewable={canReviewDocuments}
          />
        )}
      </div>
    </section>
  );
}
