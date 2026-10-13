# Source audit and foundation release — 12 October 2026

## Evidence and architecture
Audited the existing `/workspace/sites/sohansoft-hrms` checkout, source repository state, prior ZIP references, application routes, schema, migrations, auth/provider code, all business-service modules, UI, environment example, package/lockfile and tests. The live database initially contained 18 application tables. The hosted Site is public at the shell level; authenticated APIs independently enforce verified-mobile identity.

The framework is React 19 + TypeScript, Next-compatible App Router through Vinext, Vite, Cloudflare Workers. Data is D1 SQLite; schema/migrations use Drizzle. Sessions and OTP challenges persist in D1. Fast2SMS SmartOTP is the selected sign-in integration. R2 is not bound and no private document functionality exists. No architecture, provider, authentication mechanism or production secret was replaced.

The checkout already contained unfinished, uncommitted foundation changes. These were preserved, completed, tested and integrated; they were not treated as verified features merely because source files existed. Baseline: 54 existing tests passed and TypeScript passed. Native deployed schema inspection confirmed migration 0003 was not yet applied.

## Feature inventory at inspection
| Area | Status before this release | Relevant files | Finding / action |
| --- | --- | --- | --- |
| Mobile auth | Implemented; live OTP unverified | auth.ts, server-auth.ts, api/auth | Retain challenge/session protections; finish own-session administration and tests |
| Super Admin | Implemented foundation | service.ts, super-admin/page.tsx | Preserve platform/customer separation; require recent OTP for opening support grants |
| Tenants/plans | Implemented basic provisioning and manual subscriptions | schema.ts, service.ts | Retain atomic batches, quotas and entitlements; billing/storage limits still absent |
| Authorization | Implemented company-level; scoped work unfinished | access.ts, service.ts | Finish branch/department restrictions and delegation limits; protect owner role name |
| Directory | Basic records implemented; pagination unfinished | records.ts, hrms-workspace.tsx | Connect server search/filter/sort/pagination and aggregate totals |
| Employee lifecycle | Partial local history/edit/archive/restore APIs | schema.ts, records.ts | Connect UI; immutable history; version and quota regression cases |
| Recruitment | Internal vacancies and versioned pipeline | records.ts, service.ts | Scope jobs/candidates; editable vacancies, concurrency guard and applicant aggregates |
| Dashboard customization | Persisted config | hrms-workspace.tsx | Hero ignored saved headings; apply saved text and accurate aggregate KPIs |
| Careers/interviews/offers | Missing | No corresponding module | Next phase; do not imply working flows |
| Onboarding/documents | Missing | No R2 binding or module | Private quarantine/storage must precede upload and conversion workflows |
| Attendance/leave/payroll | Missing | No models/services | Not enabled, no calculations or salary disbursement |
| Performance/assets/expenses/helpdesk | Missing | No module | Later phases after employee identity and workflow foundation |
| Notifications/real-time/jobs | Missing | No outbox/queue | Critical transactions currently do not send notifications; durable outbox precedes providers |
| Tests | 54 integration tests | tests/*.test.mjs | Provider mocks plus real SQLite adapter; no browser or Cloudflare concurrency certification |

No duplicate HRMS application was created. Unused starter UI components/examples remain intact; removing them was unnecessary. The unused email invitation helper remains for source compatibility; mobile-bound service invitation validation is authoritative.

## Security findings addressed
- Company role management must not delegate permissions or branch/department scope beyond the actor's database-derived authority. Reserved Company Owner name cannot be assigned through custom role creation.
- Revoked memberships must disappear from bootstrap and fail subsequent API authorization. Restoring/revoking access is tenant-scoped and audited; self-revocation is blocked.
- Reads, exports, employee history, candidate history, vacancies and aggregate KPIs now respect implemented organizational restrictions. Composite foreign keys prevent cross-company branch/department assignments.
- Session listing exposes only the authenticated user's session metadata, never token hashes. Single-session/all-session revocation also closes support grants.
- Support-access opening requires OTP verification within ten minutes; the grant still expires after one hour and is session-bound.
- Vacancy edits now reject stale/interleaved writes; employment changes retain versioned history protected against update/delete.
- CSV exports neutralize spreadsheet formula prefixes even after leading whitespace/control characters.
- Worker responses add security headers and no-store for HTML/JSON. CSP permits inline framework scripts/styles; nonce-based CSP remains a future hardening task.

## Data and scaling
New migration 0003 adds role_scopes, job_organization, membership_revocations and employee_history, plus employee version and organizational indexes. New migration 0004 adds job version and immutable employee-history triggers. Applied migrations 0000–0002 remain unchanged. Upgrade tests preserve legacy rows and pass integrity/foreign-key checks.

Directory, vacancies and candidates use bounded server pages (up to 100 rows), deterministic ordering and SQL filtering. Dashboard totals aggregate all permitted records rather than the first page. Search escapes LIKE metacharacters and never interpolates browser SQL. Existing records with no organizational assignment remain company-wide and are excluded from restricted scopes until assigned.

Constraints: OFFSET pagination and LIKE search need further workload testing/FTS/keyset evaluation at commercial scale. Exports are bounded to 5,000 records and fail explicitly above that size; large exports need a durable job. Employee/candidate history screens show bounded recent entries. Full JSON snapshots/history are not retroactively backfilled for pre-release changes. Default employee permission does not grant a self-service portal; employee-user binding is still needed.

## Remaining risks and external dependencies
- Live SMS delivery and verification on the configured account have not been exercised by this session.
- Manager/direct-report scopes and sensitive-field restrictions are not implemented. No Aadhaar, PAN, bank or salary model was added to this release.
- No private document storage, quarantine/malware scanner, legal consent/retention engine or recovery workflow exists yet.
- No independent MFA factor; recent mobile verification is reauthentication, not MFA. Recovery and step-up protection for other privileged operations remain open.
- Production backup restoration, penetration testing, edge concurrency/load tests and independent compliance review are not verified.
- Browser E2E, responsive visual QA and accessibility automation unavailable in this managed environment; no alternate browser was installed.
- hrms.sohansoft.in remains pending DNS/TLS validation; existing DNS records are retained in DEPLOYMENT.md.
- Do not treat this release as completion of the full HRMS acceptance criteria.

## Phase dependencies
1. Foundation milestone in this release: source audit, scoped authority, membership/session controls, pagination, aggregate accuracy and versioned lifecycle changes.
2. Next: private R2 quarantine, authorized document streaming, scanner integration/fail-closed release and document version/review history; then offers, candidate submissions, onboarding verification and idempotent candidate conversion/mobile-bound activation.
3. Bind verified employees to users and establish manager scopes before employee portals, attendance, shifts, corrections and leave ledgers.
4. Add immutable effective-dated payroll inputs/rule versions only after attendance/leave locks; validate current Indian statutory rules with authoritative sources and qualified review before disbursement.
5. Add durable transactional outbox/jobs, notifications, reports, additional HR modules and SaaS operational controls incrementally; finish restore/load/security/browser acceptance before commercial launch.

## Final dependency verification
Initial full pnpm audit reported 48 advisories across the dependency graph (25 high, 17 moderate, 6 low). Updated Vite and React server-component packages, plus scoped transitive overrides for ws, undici, js-yaml, brace-expansion, esbuild, fflate and image-size. The existing release-age/build policies were preserved; the frozen lockfile install passed. Final full audit reports one high advisory: braces <=3.0.3, stack exhaustion for deeply nested patterns; the registry advisory lists no patched version. It is reached through fast-glob/micromatch in ESLint and Vinext import tooling. Application APIs do not accept user glob patterns; build inputs are trusted project files. This is an open supply-chain finding, not a claim that the runtime is unaffected or fully secure. Production-only audit initially returned zero advisories; full audit remains authoritative for this build pipeline. Patched toolchain passed tests, typecheck, lint, schema generation (no drift) and production build.


## Milestone08 checkpoint
Read MILESTONE08_RELEASE.md and MILESTONE08_DEPLOYMENT.md for current scope, additive0010/0011 migrations, configuration and rollback. Prior reports are historical. Complete HRMS/payroll or commercial production readiness is not claimed.
