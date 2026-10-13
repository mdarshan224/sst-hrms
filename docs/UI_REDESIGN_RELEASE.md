# UI redesign release — 13 October 2026

## Source and audit

This release extends the actual Milestone08 source at `89faff7ec5af7dafcf9f16286d4966a4f0d93327`. All 268 tracked baseline files were compared byte-for-byte with `sohansoft-hrms-milestone08-onboarding-verification-full.zip`: no missing or mismatching files. The existing hosted HRMS project is retained. No ERP source or deployment configuration was changed.

Reviewed the application route inventory, shared layout/styles, all HRMS feature components and their handlers, relevant API response contracts, baseline tests and previous release documents. Existing framework, database and authentication were retained. The separate component-library primitives are not substituted for the current application UI.

### Confirmed defects

- Cashfree platform settings were inline labels and native controls without form-row layout. Save, credential messages, sandbox test and prerequisites had no distinct sections.
- New workflow panels lacked body padding; `.table-wrap` had no scroll-container definition. The older global table `white-space: nowrap` forced diagnostics, URLs and actions onto long lines.
- Global and later branding tokens overlapped. Many dashboard labels were only 8–11px; secondary text was too faint on light surfaces. New and old buttons/inputs had different dimensions.
- Company action groups did not wrap. Sidebar content could exceed the viewport; its mobile drawer lacked a backdrop, dedicated close control, focus containment and expanded-state announcement.
- Modal focus was reinitialized whenever saving state changed. Invitation copy failures appeared behind the dialog.
- Workflow requests scoped data but not loading/errors, and did not cancel superseded fetches. Older responses could replace current feedback.
- Document/domain refresh errors could persist after retry; documents initially displayed an empty state before loading. Operations had no initial loading state.
- Notification read failures were unhandled and concurrent read clicks were not disabled. The PAN form reset even after failed submission.
- Role dashboards removed their search/form content while refreshing or after a mutation error. Profile tabs lacked arrow-key navigation and explicit panel relationships.
- Hosted consent displayed unavailable before its fetch completed. Recruitment could display “No offers” before data loaded. Careers feedback did not distinguish failures from success and selecting an application did not move focus to its form.
- Several milestone notes described already implemented branding/onboarding foundations as entirely missing. App-level branded error/not-found pages were absent.

The screenshot mentioned in the request was not available as a viewable attachment in this turn. The reported overlapping structure was confirmed directly in the source. No before/after screenshots were fabricated.

## Implemented

### Cashfree Secure ID

- Separate section header/refresh action, three full-label checkbox cards with explanations, a service-availability fieldset and labelled environment selector.
- Dedicated save row with pending state; form controls disable during mutation. Success remains contingent on the existing server response.
- Six readiness cards: sandbox/production credentials, sandbox/production RSA configuration, production approval configuration, and last recorded successful sandbox test.
- Credentials remain masked. “Configured” explicitly does not mean live connectivity was verified.
- Separate sandbox test area with unavailable/running states and actual server success/error feedback.
- Wrapping production prerequisites and accurate distinction between hosted consent and identity verification. Missing Aadhaar/OCR/bank products remain unavailable.
- PAN validation failures preserve entered values; successful submissions clear the form. No provider, consent, state-machine or API contract changes.

### Workflow Operations

- Consistent header/refresh, independent encryption/scanner/quarantine status cards.
- Loading/error/retry feedback, job table with defined column proportions and wrapping diagnostics, separate webhook delivery table and useful empty states.
- Requeue asks for configuration-review confirmation, prevents concurrent clicks, and reports only that the server requeued the job—not that execution succeeded.
- Quarantine remains mandatory until a valid clean scan is recorded. Configuration never implies a working scanner engine.

### Shared application UI

- Central green-brand/color/typography/spacing/radius/control/status tokens; raised small-text sizes and stronger secondary text.
- Reusable `SectionHeader`, `StatusItem`, `Feedback`, `EmptyState`; padded section cards and shared labels, checkboxes, controls, actions, table wrappers and settings layouts.
- Shared table keyboard scrolling, column header scopes, wrapping long values, accessible focus rings, responsive action groups, reduced-motion support retained.
- Responsive sidebar backdrop/close/Escape/focus containment, body scroll locking, inert background, skip link and active navigation announcements. Long company names wrap in branding and remain selectable in the workspace switcher.
- Platform section links for companies, integration, operations, domains and plans. Existing permission checks are unchanged.
- Viewport-constrained dialogs with internal scrolling, wrapping action buttons, descriptions and focus restoration without save-state resets.
- Employee profile tabs now support arrows/Home/End and roving focus with named panels.
- Branded safe error/not-found pages; no raw exception details shown.

Affected experiences: Super Admin, company admin, HR, manager, recruiter, employee profile/self-service, recruitment, onboarding templates/invitations/portal, verification policy/history, private documents, hosted consent, domain registry, account security, branding, notifications, login/OTP, careers and invitation/verification return pages through shared styles. Payroll and other unfinished modules were not enabled or invented.

## Functional fixes and tests

`useJsonResource` keys data/errors/loading by the complete URL and cancels previous requests. It preserves current data during a refresh, clears retry errors, and ignores superseded responses after scope changes/unmount. Workflow, documents, verification and operations use it. Existing server tenant checks remain authoritative.

The new seven-test component/client suite covers real TSX rendering of Cashfree checkbox grouping, readiness, unavailable testing, saving/testing states, escaping and announcements, initial operations loading, superseded request cancellation, and real client error propagation under synthetic transport responses. These are component/contract tests, not browser or live Cashfree tests.

Actual executed checks:

| Check | Result |
| --- | --- |
| Baseline `npm test` | 166 passed |
| Baseline `npm run typecheck`, `npm run lint` | Passed |
| Final `npm test` | 173 passed, 0 skipped/failed |
| Final `npm run typecheck` | Passed |
| Final `npm run lint` | Passed; an initially detected error-page Link lint error was fixed |
| `npm run db:generate` | 48 tables; no schema changes, no new migration |
| `npm run build` | Passed |
| `python -m unittest discover -s integrations/scanner -p 'test_*.py'` | 3 passed |
| Existing migration/tenant/auth/domain/document suites | Included in the 173 passing tests |

Dependencies already installed from the unchanged pnpm lockfile were reused. No package, lockfile, framework, database schema, SQL migration, auth/session/permission/provider implementation or hosting binding changes were needed. No production data reset, DNS operation, Worker route replacement or ERP deployment occurred.

## Responsive and accessibility verification limits

Responsive rules were implemented for small screens, tablet layouts and wide desktop layouts: minmax grids, flexible actions, internal table scrolling, capped dialogs, drawer at 720px and single-column cards at 430px. The requested 320, 375, 430, 768, 1024, 1280 and 1440px browser checks were **not run**: the approved managed browser capability is unavailable. No browser was installed or substitute preview used.

Keyboard/focus semantics and component markup were source-reviewed and tested where indicated above. Actual focus movement, zoom/reflow, screen-reader announcements, touch behavior and every rendered contrast combination still require browser/manual acceptance. This is not a WCAG certification or a claim that all viewport acceptance criteria have been independently verified.

Before commercial acceptance, authenticate using synthetic company accounts and perform:
1. Cashfree at 320/375/768/1280/1440px: every label, helper, warning and action must wrap; save success/403/503/network errors must preserve appropriate values and display truthful results.
2. Workflow jobs/webhooks: empty/loading/failure cases, long diagnostics, keyboard scroll and controlled requeue.
3. Long company names, action groups, workspace switching during delayed requests; no previous tenant result/error should appear.
4. Drawer open/close/Escape/Tab/resize and dialog validation/save/failure/close/focus restoration at every target width.
5. Employee/manager/HR/recruiter account access and unauthorized restricted-operation attempts.
6. Onboarding save/correction, file quarantine/review states, notification errors, profile tab navigation, careers submissions, OTP flow and branded custom-domain pages.

## Deployment and rollback

- Publish through the existing HRMS Sites source/build workflow, keeping the current public login-shell audience and the existing DB/BUCKET bindings.
- No new environment values or migrations. Preserve all secrets. Set the existing `HRMS_DEPLOYMENT_VERSION` to the exact newly saved version ID before deployment so the current domain-attestation binding remains correct.
- Re-attest any active customer-domain mapping to the deployment according to existing domain procedures. Do not change HRMS/ERP DNS, routes or fallback origins for a UI release.
- Verify deployment success, primary login response, unauthenticated Super Admin redirect and protected API denials. Authenticated visual verification remains required separately.
- Roll back by deploying saved HRMS version12 (`appgprj_6acc998779048191a144f8c871a17577~appgver_085dc07e579c81919360a05daa459c3d`) and restoring its matching `HRMS_DEPLOYMENT_VERSION`. No data/schema rollback is needed for this release. Keep encryption keys and all provider secrets unchanged.
- The delivered archive's `release-evidence/` records the actual final source/deployment identifiers and executed outputs. Read prior MILESTONE08 deployment/configuration docs for provider setup.

## Remaining blockers

Live Fast2SMS OTP, Cashfree verification, scanner engine and real backup restoration were not exercised. Missing Cashfree/scanner account configuration remains an operational blocker; no new provider success is claimed. The prior high-severity `braces` build-tool advisory remains unresolved; this UI release does not change or suppress it. Attendance, shifts, leave, payroll, disbursement, performance, expenses, assets and helpdesk remain incomplete. The redesign does not make the whole HRMS commercially production-ready.

## Exact changed and created files

- `app/error.tsx`
- `app/globals.css`
- `app/not-found.tsx`
- `components/hrms-account-security.tsx`
- `components/hrms-branding.tsx`
- `components/hrms-careers.tsx`
- `components/hrms-documents.tsx`
- `components/hrms-domains.tsx`
- `components/hrms-hosted-consent.tsx`
- `components/hrms-notifications.tsx`
- `components/hrms-onboarding-portal.tsx`
- `components/hrms-operations.tsx`
- `components/hrms-profile-tabs.tsx`
- `components/hrms-recruitment-operations.tsx`
- `components/hrms-role-dashboard.tsx`
- `components/hrms-ui.tsx`
- `components/hrms-verification.tsx`
- `components/hrms-workflow-admin.tsx`
- `components/hrms-workspace.tsx`
- `components/use-json-resource.ts`
- `components/workflow-client.ts`
- `components/workflow.css`
- `docs/UI_REDESIGN_RELEASE.md`
- `lib/hrms/latest-request.ts`
- `tests/ui-components.test.mjs`
