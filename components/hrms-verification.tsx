"use client";
import { useState } from "react";
import { useJsonResource } from "./use-json-resource";
import { SectionHeader, StatusItem, Feedback } from "./hrms-ui";
type Row = Record<string, string | number | null>;
type State = {
  settings?: Row;
  policy?: Row;
  credentials?: Record<
    string,
    {
      configured: boolean;
      clientIdentifier: string | null;
      publicKeyConfigured: boolean;
      productionApproved: boolean;
    }
  >;
  roles?: Row[];
  rows?: Row[];
  consentNotice?: string;
  consentVersion?: string;
  employeeName?: string;
};
export function CashfreeSettings({
  state,
  act,
  busy,
  operation,
  loading,
}: {
  state: State;
  act: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  operation: string;
  loading: boolean;
}) {
  if (!state.settings) return null;
  return (
    <>
      <form
        className="settings-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act("platform.save", {
            enabled: f.has("enabled"),
            panEnabled: f.has("panEnabled"),
            digilockerEnabled: f.has("digilockerEnabled"),
            mode: f.get("mode"),
            version: Number(state.settings?.version),
          });
        }}
        key={String(state.settings.version)}
      >
        <fieldset disabled={busy} className="settings-options">
          <legend>Service availability</legend>
          <label className="settings-row">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={Boolean(state.settings.enabled)}
            />
            <span>
              <strong>Enable Secure ID globally</strong>
              <small>
                Make configured products available to entitled companies. Each
                company controls its own verification policy.
              </small>
            </span>
          </label>
          <label className="settings-row">
            <input
              type="checkbox"
              name="panEnabled"
              defaultChecked={Boolean(state.settings.pan_enabled)}
            />
            <span>
              <strong>Permit PAN Lite</strong>
              <small>
                Allow consent-based PAN checks through the configured Cashfree
                account. Product access and credentials are required.
              </small>
            </span>
          </label>
          <label className="settings-row">
            <input
              type="checkbox"
              name="digilockerEnabled"
              defaultChecked={Boolean(state.settings.digilocker_enabled)}
            />
            <span>
              <strong>Permit DigiLocker consent</strong>
              <small>
                Offer the account-validated hosted PAN consent journey. Consent
                alone does not verify identity.
              </small>
            </span>
          </label>
          <label className="form-field environment-field">
            Environment
            <select name="mode" defaultValue={String(state.settings.mode)}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
            <small>
              Sandbox and production use separate server-side credentials.
            </small>
          </label>
        </fieldset>
        <div className="form-actions">
          <button className="primary" disabled={busy || loading}>
            {operation === "platform.save"
              ? "Saving configuration…"
              : "Save configuration"}
          </button>
        </div>
      </form>
      <section
        className="settings-section"
        aria-labelledby="cashfree-credentials"
      >
        <h3 id="cashfree-credentials">Credential readiness</h3>
        <p>
          Operators configure secrets on the server. Configured values do not
          prove live connectivity or product approval.
        </p>
        <div className="status-grid">
          {["sandbox", "production"].map((mode) => {
            const c = state.credentials?.[mode];
            return (
              <StatusItem
                key={mode}
                label={`${mode === "sandbox" ? "Sandbox" : "Production"} credentials`}
                status={c?.configured ? "Configured" : "Missing"}
                tone={c?.configured ? "ready" : "warning"}
              >
                {c?.configured
                  ? `Masked client: ${c.clientIdentifier ?? "Not supplied"}.`
                  : `Ask an operator to configure ${mode} credentials.`}
              </StatusItem>
            );
          })}
          {["sandbox", "production"].map((mode) => (
            <StatusItem
              key={mode}
              label={`${mode === "sandbox" ? "Sandbox" : "Production"} RSA configuration`}
              status={
                state.credentials?.[mode]?.publicKeyConfigured
                  ? "Configured"
                  : "Not configured"
              }
              tone={
                state.credentials?.[mode]?.publicKeyConfigured
                  ? "ready"
                  : "warning"
              }
            >
              Register the appropriate key or validate an approved egress
              configuration with the provider.
            </StatusItem>
          ))}
          <StatusItem
            label="Production approval"
            status={
              state.credentials?.production?.productionApproved
                ? "Configured"
                : "Required"
            }
            tone={
              state.credentials?.production?.productionApproved
                ? "ready"
                : "warning"
            }
          >
            An operator must confirm account and product entitlements before
            production use.
          </StatusItem>
          <StatusItem
            label="Last successful sandbox test"
            status={
              state.settings.last_test_at ? "Test recorded" : "Not tested"
            }
            tone={state.settings.last_test_at ? "ready" : "neutral"}
          >
            {state.settings.last_test_at
              ? String(state.settings.last_test_at)
              : "Run the controlled PAN Lite sandbox test after credentials are configured."}
          </StatusItem>
        </div>
      </section>
      <section className="testing-area" aria-labelledby="cashfree-testing">
        <div>
          <h3 id="cashfree-testing">Sandbox testing</h3>
          <p>
            {operation === "platform.test"
              ? "Waiting for the provider response…"
              : !state.credentials?.sandbox?.configured
                ? "Unavailable until sandbox credentials are configured."
                : "Uses the server’s controlled sandbox check. A failure is reported above; production readiness is not implied."}
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || loading || !state.credentials?.sandbox?.configured}
          onClick={() => void act("platform.test", {})}
        >
          {operation === "platform.test"
            ? "Testing sandbox…"
            : "Test Sandbox PAN Lite"}
        </button>
      </section>
      <aside className="alert warning">
        <div>
          <strong>Before production verification</strong>
          <p>
            Confirm account and product entitlements, consent review, and
            registered RSA authentication or an independently approved
            static-egress architecture. Cloudflare Workers do not have an
            assumed fixed outbound IP. Hosted DigiLocker consent needs separate
            account configuration and is not proof of identity. Aadhaar identity
            checks, OCR and bank verification remain unavailable.
          </p>
        </div>
      </aside>
    </>
  );
}
export default function Verification({
  view,
  tenant = "",
  caseId,
  employeeId,
  onChanged,
}: {
  view: "platform" | "policy" | "self" | "queue" | "employee";
  tenant?: string;
  caseId?: string;
  employeeId?: string;
  onChanged?: () => void;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [requestId, setRequestId] = useState("");
  const {
    data: state,
    error: loadError,
    loading,
    load: refresh,
  } = useJsonResource<State>(
    "/api/verification?" +
      new URLSearchParams({
        view,
        tenant,
        status,
        page: String(page),
        caseId: caseId ?? "",
        employeeId: employeeId ?? "",
      }),
  );
  async function act(action: string, data: Record<string, unknown>) {
    if (busy) return false;
    setOperation(action);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, tenant, data }),
        }),
        result = (await r.json()) as { error?: string; status?: string };
      if (!r.ok) throw new Error(result.error ?? "Operation failed.");
      setNotice(
        action === "pan.start"
          ? `Provider result: ${result.status}. HR review is separate.`
          : action === "platform.test"
            ? "Cashfree confirmed the sandbox test."
            : "Saved.",
      );
      await refresh();
      onChanged?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
      onChanged?.();
      return false;
    } finally {
      setBusy(false);
      setOperation("");
    }
  }
  const title = {
    platform: "Cashfree Secure ID",
    policy: "Employee verification settings",
    self: "My identity verification",
    queue: "Employee verification review",
    employee: "Employee verification history",
  }[view];
  return (
    <section className="panel section-card">
      <SectionHeader
        title={title}
        description="Manage consent-based employee checks. Provider results and HR decisions remain separate."
        actions={
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              setNotice("");
              void refresh();
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      <Feedback error={error || loadError} notice={notice} />
      {loading && !state && (
        <p role="status" className="loading-state">
          Loading verification…
        </p>
      )}
      {view === "platform" && state && (
        <CashfreeSettings
          state={state}
          act={act}
          busy={busy}
          operation={operation}
          loading={loading}
        />
      )}
      {view === "policy" && state?.policy && (
        <>
          <form
            key={String(state.policy.version)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act("policy.save", {
                enabled: f.has("enabled"),
                panRequired: f.has("panRequired"),
                hrReviewRequired: f.has("hrReviewRequired"),
                digilockerEnabled: f.has("digilockerEnabled"),
                nameReviewThreshold: Number(f.get("nameReviewThreshold")),
                retentionDays: Number(f.get("retentionDays")),
                version: Number(state.policy?.version),
              });
            }}
          >
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={Boolean(state.policy.enabled)}
              />{" "}
              Enable company verification
            </label>
            <label>
              <input
                type="checkbox"
                name="panRequired"
                defaultChecked={Boolean(state.policy.pan_required)}
              />{" "}
              PAN required by company policy
            </label>
            <label>
              <input
                type="checkbox"
                name="hrReviewRequired"
                defaultChecked={Boolean(state.policy.hr_review_required)}
              />{" "}
              HR review required
            </label>
            <label>
              Local name-similarity review threshold{" "}
              <input
                name="nameReviewThreshold"
                type="number"
                min={50}
                max={100}
                defaultValue={Number(state.policy.name_review_threshold ?? 100)}
                required
              />
            </label>
            <label>
              <input
                name="digilockerEnabled"
                type="checkbox"
                defaultChecked={Boolean(state.policy.digilocker_enabled)}
              />{" "}
              Offer optional DigiLocker PAN consent journey
            </label>
            <label>
              Result retention days{" "}
              <input
                type="number"
                name="retentionDays"
                min="1"
                max="365"
                defaultValue={Number(state.policy.retention_days)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Save verification policy
            </button>
          </form>
          <p className="footnote">
            Onboarding approval evaluates the company verification policy and
            the saved template. Provider results and HR review remain separate.
          </p>
          {Boolean(state.roles?.length) && (
            <>
              <h3>Explicit privacy permissions</h3>
              <p>
                Only the company owner can change these grants after recent OTP
                verification. Broad HR or support access does not grant access.
              </p>
              {state.roles?.map((r) => (
                <form
                  key={`${r.id}:${r.can_view}:${r.can_review}:${r.can_view_documents}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("privacy.grant", {
                      roleId: r.id,
                      canView: f.has("view"),
                      canReview: f.has("review"),
                      canViewDocuments: f.has("documents"),
                      canReviewDocuments: f.has("docReview"),
                      canManageOnboarding: f.has("onboarding"),
                      canApproveOnboarding: f.has("approveOnboarding"),
                    });
                  }}
                >
                  <b>{r.name}</b>
                  <label>
                    <input
                      name="docReview"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_review_documents)}
                    />{" "}
                    Review scanner-cleared documents
                  </label>
                  <label>
                    <input
                      name="onboarding"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_manage_onboarding)}
                    />{" "}
                    Manage private onboarding forms and invitations
                  </label>
                  <label>
                    <input
                      name="approveOnboarding"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_approve_onboarding)}
                    />{" "}
                    Approve onboarding and offers
                  </label>
                  <label>
                    <input
                      name="documents"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_view_documents)}
                    />{" "}
                    Download scanner-cleared private documents
                  </label>
                  <label>
                    <input
                      name="view"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_view)}
                    />{" "}
                    View masked verification results
                  </label>
                  <label>
                    <input
                      name="review"
                      type="checkbox"
                      defaultChecked={Boolean(r.can_review)}
                    />{" "}
                    Review other employees
                  </label>
                  <button className="secondary" disabled={busy}>
                    Save role privacy grant
                  </button>
                </form>
              ))}
            </>
          )}
        </>
      )}
      {view === "self" && state && (
        <>
          <p>
            Registered employee: {state.employeeName}. Company verification:{" "}
            {state.policy?.enabled ? "enabled" : "disabled"}.
          </p>
          {Boolean(state.policy?.enabled) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form),
                  rid = requestId || crypto.randomUUID();
                setRequestId(rid);
                const ok = await act("pan.start", {
                  pan: f.get("pan"),
                  dob: f.get("dob"),
                  consent: f.has("consent"),
                  consentVersion: state.consentVersion,
                  requestId: rid,
                  caseId,
                });
                if (ok) {
                  form.reset();
                  setRequestId("");
                }
              }}
            >
              <label>
                PAN{" "}
                <input
                  name="pan"
                  required
                  autoComplete="off"
                  pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]"
                  maxLength={10}
                />
              </label>
              <label>
                Date of birth{" "}
                <input name="dob" type="date" required autoComplete="off" />
              </label>
              <p>{state.consentNotice}</p>
              <label>
                <input name="consent" type="checkbox" required /> I have read
                and agree to this verification consent
              </label>
              <button className="primary" disabled={busy}>
                Verify PAN with Cashfree
              </button>
            </form>
          )}
        </>
      )}
      {view === "queue" && state && (
        <label>
          Provider outcome{" "}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {[
              "all",
              "pending",
              "verified",
              "failed",
              "needs_manual_review",
              "needs_reconciliation",
              "name_review",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {state?.rows && (
        <>
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Records table, scroll for all columns"
          >
            <table>
              <thead>
                <tr>
                  {view === "queue" && <th scope="col">Employee</th>}
                  <th scope="col">Product / mode</th>
                  <th scope="col">Masked identifier</th>
                  <th scope="col">Provider result</th>
                  <th scope="col">HR decision</th>
                  <th scope="col">Reference / timestamp</th>
                  {view === "queue" && <th scope="col">Review</th>}
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.id}>
                    {view === "queue" && <td>{r.full_name}</td>}
                    <td>
                      {r.product} / {r.mode}
                    </td>
                    <td>{r.masked_identifier}</td>
                    <td>
                      {r.status}
                      {r.name_score !== null && r.name_score !== undefined && (
                        <small>
                          {" "}
                          · Local name similarity {r.name_score}% (review aid)
                        </small>
                      )}
                      {r.name_matched !== null && (
                        <small>
                          {" "}
                          · Name{" "}
                          {r.name_matched ? "matches" : "requires review"}
                        </small>
                      )}
                    </td>
                    <td>
                      {r.review_status}
                      <small>{r.review_reason}</small>
                    </td>
                    <td>
                      {r.provider_reference ?? "Awaiting reference"}
                      <small>{r.completed_at ?? r.created_at}</small>
                    </td>
                    {view === "queue" && (
                      <td>
                        {["pending", "needs_reconciliation"].includes(
                          String(r.status),
                        ) && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void act("reconcile.manual", {
                                id: r.id,
                                outcome: f.get("outcome"),
                                reason: f.get("reason"),
                                supportReference: f.get("supportReference"),
                                confirmedNotProcessed: f.has("confirmed"),
                              });
                            }}
                          >
                            <p>
                              Reconcile the original PAN Lite request with
                              provider support. This action never marks identity
                              verified.
                            </p>
                            <label>
                              Outcome
                              <select name="outcome">
                                <option value="unresolved">
                                  Still unresolved
                                </option>
                                <option value="cancelled_without_verification">
                                  Provider confirms not processed or charged
                                </option>
                              </select>
                            </label>
                            <label>
                              Provider support reference
                              <input
                                name="supportReference"
                                required
                                minLength={3}
                                maxLength={100}
                              />
                            </label>
                            <label>
                              Reason
                              <input
                                name="reason"
                                required
                                minLength={10}
                                maxLength={500}
                              />
                            </label>
                            <label>
                              <input name="confirmed" type="checkbox" />
                              Provider confirmed original request was not
                              processed or charged
                            </label>
                            <button disabled={busy}>
                              Record audited reconciliation
                            </button>
                          </form>
                        )}
                        {r.review_status === "pending" &&
                          !["pending", "needs_reconciliation"].includes(
                            String(r.status),
                          ) && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void act("review", {
                                  id: r.id,
                                  decision: f.get("decision"),
                                  reason: f.get("reason"),
                                });
                              }}
                            >
                              <label>
                                Decision{" "}
                                <select name="decision">
                                  <option value="correction_required">
                                    Request correction
                                  </option>
                                  <option value="rejected">Reject</option>
                                  {r.status === "verified" && (
                                    <option value="approved">Approve</option>
                                  )}
                                </select>
                              </label>
                              <label>
                                Review reason{" "}
                                <input
                                  name="reason"
                                  required
                                  minLength={5}
                                  maxLength={500}
                                />
                              </label>
                              <button disabled={busy}>Save review</button>
                            </form>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.rows.length && <p>No verification records in this view.</p>}
          {view === "queue" && (
            <div>
              <button
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span> Page {page} </span>
              <button
                disabled={state.rows.length < 25 || busy}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
