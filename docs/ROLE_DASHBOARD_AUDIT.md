# Role/dashboard audit and Milestone 04

12 October 2026. Existing ZIP source matches the clean deployed checkout at commit 962a5befbc56847156e7ba16a129e8d38c918728. Inspected schema/migrations, auth, authorization, every implemented mutation/API view, workspace/login/account UI, dependency lock/config and existing audit/release/deployment/recovery/checklist.

## Baseline
- 71 existing tests pass; type checking, lint and production build pass.
- Live D1 has 22 application tables before this release.
- Current architecture remains React 19/TypeScript, Vinext/Vite App Router, Cloudflare Workers, D1/Drizzle and Fast2SMS SmartOTP. No replacement application or infrastructure migration.
- Full dependency audit still reports one high-severity braces advisory in trusted build/lint glob tooling, no listed patch. It is not suppressed or described as resolved.
- Native domain inspection now reports hrms.sohansoft.in active, provider active, TLS active. This supersedes the older pending-domain statements in historical documents. Live delivery of OTP is still not verified.
- Supplied PNG logo is present and inspected; used unmodified as the platform logo and favicon. No invented logo is presented as official.

## Feature matrix and dashboard gaps
| Feature / role | Before release | Current milestone / remaining gap |
| --- | --- | --- |
| OTP/session/account controls | Implemented and verified locally; live OTP blocked by external configuration/verification | Retained; no real OTP send performed |
| Super Admin | Implemented and verified locally | Retained dedicated platform console, explicit audited support access; health/billing/storage monitoring partial |
| Company Admin | Implemented and verified locally, partial full HRMS | Retained operational controls and overview; new branding/activation/manager controls |
| HR Manager | Partial, shared overview | Distinct profile approval queue and workforce KPIs; full HR tasks/documents/offboarding missing |
| Recruiter | Partial, shared overview | Distinct candidate/vacancy dashboard and existing hiring workspace; interviews/offers missing |
| Employee | Missing binding/self-service | Verified-mobile activation, own-profile DTO, own request history, profile change submission and account security implemented |
| Manager | Missing reporting model/scoped dashboard | Same-company reporting graph, cycle guard, direct-report pagination/search and limited DTO implemented |
| Payroll/Finance | Missing | Remains unavailable; no fake dashboard, payslips, calculations or payments |
| Role-specific routing | Partial | Server-validated /company/:slug/:mode and dashboard APIs derive allowed modes from membership permissions and active employee binding |
| Platform branding | Partial/inconsistent | Central forest-green/gold tokens, official supplied PNG/logo/favicon, login and shell styling |
| Tenant branding | Partial | Persistent logo/primary/accent/locale/currency/timezone/prefix, preview/save/reset and PNG validation |
| Private documents/onboarding | Missing; scanner/provider configuration blocked | Deferred; public branding images are not a document vault |
| Attendance/leave/real-time jobs | Missing | Deferred; no fake controls/data |
| Browser E2E/accessibility/visual QA | Implemented but not verified UI behavior | Required managed browser capability unavailable; no alternate preview/browser installed |

No pre-existing broken automated tests were found. The original default employee role only had report.view and no employee-user binding. A public shell or role label alone did not constitute an employee portal. The new account binding addresses that foundation without granting employee.view or company administration.

## New authorization and data model
Additive migration 0005 introduces employee_accounts, employee_activations, employee_reporting, profile_requests and tenant_branding. Existing tables/rows and applied migrations remain unchanged. Composite foreign keys bind employee accounts to a same-tenant membership and reporting edges to same-tenant employees. A partial unique index allows one active employee association per user per tenant. Activation table insertion also has a database trigger enforcing invitation tenant equality. Profile decisions/history become immutable after finalization.

Activation is a mobile-bound, hashed, expiring invitation. The authenticated recipient must verify the invited mobile through existing OTP. The claim, membership creation (when absent), employee binding, token consumption and audit run in one D1 batch. Existing memberships keep their assigned role. Conflicting employee/user bindings roll back. An archived employee, revoked invitation, revoked membership, inactive tenant or inactive subscription cannot gain employee access. No email-based auto-matching and no plaintext passwords.

Employee endpoints derive the employee from the active account and membership; they accept no browser employee selector. The personal DTO contains only current own employment/contact data and own request history. Manager reads require team.view plus an active linked employee, use the bound employee as manager, include only direct active reports, and intersect existing branch/department restrictions. Manager DTOs omit email, user/mobile identity, salary, bank/tax/identity fields and private documents.

Reporting assignment is authorized through employee.edit and existing organizational scope. The recursive cycle check executes inside the write statement. Profile requests are limited to name/email, one pending request per employee; a separate authorized employee.edit reviewer must approve/reject with a reason. Approval uses immutable request and employee versions and rechecks the current active employee association/membership. It records employee history and audit without changing login mobile identity.

Dashboard modes are task views of database-derived authority, not independent grants or local-storage roles. Each dashboard endpoint checks mode availability. Switching to recruiter/employee mode cannot grant a capability; an administrator continues to possess explicitly assigned administrative authority. Full multi-role grants and payroll sensitive-field authorization remain future work.

## Branding design and storage
Platform primary #176B50, text #173D30, background #F6F9F7, gold #D9A441 and typography are centrally defined. Tenant primary/accent override only that tenant's shell. Existing customer primary colours are preserved. New companies start with the requested green; reset branding deliberately selects green/gold and removes the company logo. Company settings/name/timezone/locale/currency remain in tenants; logo/accent/revision persist in tenant_branding.

Small public logos are stored as bounded PNG base64 in D1 (maximum 36 KB encoded input <=48,000 chars). The browser validates PNG headers/size, normalizes a selected image through canvas to 128 pixels, and submits it through the protected JSON mutation. Server checks PNG signature, chunk boundaries, CRCs, dimension limits, allowed chunk types and final IEND. Non-PNG, hidden metadata chunks, malformed/oversized images are rejected. Primary colours require 4.5:1 contrast with white button text; accent foreground is chosen for contrast.

The logo endpoint is intentionally public for company-branded login/favicon usage, serves image/png with nosniff and same-origin resource policy, and exposes no other tenant fields or private files. Branding version URLs refresh cached images. This is bounded public-artwork storage using the existing D1 architecture, not sensitive document storage; private documents still require R2 quarantine, malware scanning and authorization.

## Remaining limitations / next phase
- Employee/manager portals are foundation slices: attendance, leave, payslips, personal files, expenses, tickets, assets, policy/training tasks and live events do not yet exist.
- Recruitment still lacks public applications/interviews/offers and onboarding conversion. Activation here applies to an existing employee record, not a shortcut around future onboarding verification.
- Manager hierarchy is current-state/direct-reports, not effective-dated delegation, full org charts or multi-level approvals. Archive/unlink blocks personal/team access; separately granted company-admin memberships require explicit membership revocation.
- Self-service updates only name/email; mobile recovery and confidential HR-field schemas remain missing. No statutory payroll engine or compliance claim.
- HR queue shows up to 100 requests and personal history up to 50; large queue/history pagination remains future work.
- Logo asset is unchanged from upload; browser verification, full accessibility/performance checks and production restore drill remain unverified.
- Full dependency audit still has the known high build-tool advisory.

Next: private quarantined documents and versioned review, offers/onboarding/controlled candidate conversion; extend employee/team identity into attendance and leave only after those workflows are verified.
