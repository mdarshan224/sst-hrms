# Milestone 04 — employee identity, role workspaces and branding

## Files changed
- db/schema.ts; drizzle/0005 and metadata: five additive tables, same-company references, active binding uniqueness, immutable profile decisions and activation tenant trigger.
- lib/hrms/employee-portal.ts: activation/unlinking, own-record authorization, dashboard availability/data, direct reports, reporting-cycle guards and reviewed profile changes.
- lib/hrms/branding.ts: shared platform tokens, PNG verification, public branded asset response and colour contrast.
- lib/hrms/service.ts, records.ts, domain.ts, http.ts: actions, scoped picker, directory account/manager state and persisted branding.
- components/hrms-role-dashboard.tsx, hrms-branding.tsx, hrms-employee-picker.tsx, hrms-workspace.tsx, hrms-login.tsx: distinct role experiences, profile queue/self-service, manager directory, mobile-bound activation, branding editor and supplied logo.
- app/api/branding, app/company/[slug]/[mode], app/login, app/layout, globals.css and public/brand: authorized role routes, logo serving, favicon and forest-green design system.
- tests/employee-portal.test.mjs and docs: identity/tenant/scope/approval/concurrency/image regression coverage and current gap analysis.

## Checks
Baseline: 71 tests, type check, lint and production build passed. Added integration suite exercises synthetic identities and real SQLite/D1-adapter SQL; it is not a browser or live OTP test. Final checks: 92 tests passed with no skips/deletions; type checking, full lint, Drizzle schema check and production build passed. Migration upgrade and synthetic restore tests remain passing. Browser E2E unavailable. Exact source/deployment receipt is included after publication.

Current known gaps are in ROLE_DASHBOARD_AUDIT.md and PROJECT_CHECKLIST.md. No independent MFA, private document scanner, payroll disbursement, notification delivery, browser E2E or production recovery claim is made. Existing server-side OTP credentials are unchanged and excluded from the ZIP.

## How to use
1. Company Owner opens People, adds/selects an existing employee and chooses Activate account. Enter the employee's correct 10-digit mobile, then share the generated invitation securely.
2. Employee signs in with that number, accepts the invitation, and selects My workspace. No new employee record is created during activation.
3. HR/Owner uses Manager on a directory row to search and assign the reporting manager. Set an activated manager's company role to a custom role containing team.view; the role may retain other explicitly authorized permissions. Manager sees My team and My workspace.
4. Employees submit profile changes. HR opens the HR operations dashboard and records a reasoned decision. The requester cannot approve their own change.
5. Workspace settings contains logo upload, preview, primary/accent colour, locale/currency/timezone/prefix, save and reset controls. Logos are public company artwork only.
6. Company/HR/recruiter/manager/employee view selection is based on server-derived availability. Payroll and other unavailable modules are hidden.

Native domain check now reports hrms.sohansoft.in and TLS active; the previous pending status was historical. Actual live SMS delivery/verification still requires a real login attempt.
