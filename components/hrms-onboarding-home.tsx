"use client";
import { useState } from "react";
import { useWorkflow } from "./workflow-client";
import OnboardingPortal from "./hrms-onboarding-portal";
type Mine = {
  rows: {
    id: string;
    tenant_id: string;
    full_name: string;
    company: string;
    status: string;
  }[];
};
export default function OnboardingHome() {
  const { data, error, loading } = useWorkflow<Mine>("mine"),
    [selected, setSelected] = useState("");
  const row = data?.rows.find((v) => v.id === selected) ?? data?.rows[0];
  return (
    <>
      <div className="workflow-public">
        <h1>My onboarding</h1>
        {error && <p role="alert">{error}</p>}
        {loading && !data && <p>Loading…</p>}
        {data && (
          <label>
            Company and onboarding{" "}
            <select
              value={row?.id ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.rows.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company} · {v.status}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && !data.rows.length && (
          <p>
            No accessible onboarding records. Ask HR for a current invitation.
          </p>
        )}
      </div>
      {row && (
        <OnboardingPortal key={row.id} tenant={row.tenant_id} caseId={row.id} />
      )}
    </>
  );
}
