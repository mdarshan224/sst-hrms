# Milestone 07 source audit and delivery boundary

12 October 2026. Source: sohansoft-hrms-milestone06-domains-full.zip, SHA-256 **e151317e9ab4a84e4ed34dcf1eebd01ec026c81dda0d302b594642c852b6df96**. Source comparison: all 196 tracked files match commit 122eddd9ab4a8638cdda7e9becc25ef721f9c91e.

## Detected architecture and baseline

React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5/Vite 8.0.16, managed Cloudflare Worker, D1/Drizzle 0.45.2, pnpm frozen lockfile. Actual worker entry is build/sites-worker.ts, not an assumed middleware.ts. Fast2SMS SmartOTP, server challenges, hashed sessions, host-only secure cookies and realm isolation remain unchanged. Input has 29 tables and migrations 0000–0007.

Executed before new implementation: npm run install:ci, npm test (120/120), npm run typecheck, npm run lint. The baseline production build from Milestone 06 is historical evidence, not a newly executed baseline build. A new production build is required for this release.

## Feature inventory

| Area | Source-derived status | Verification limits / dependency |
|---|---|---|
| OTP, session revocation, CSRF, abuse limits | Implemented and verified by automated tests | Live OTP delivery not tested this session |
| Tenant provisioning, collision-safe slugs, aliases, public role routes | Implemented and verified by automated tests | Browser journeys remain unverified |
| Company memberships, roles, organization scopes, employee binding/team scope | Implemented and verified by automated tests | Multi-role membership model remains constrained; salary permissions not built |
| Directory, lifecycle history, mobile-bound activation invitations | Implemented and verified by automated tests | Not configurable candidate onboarding forms |
| Recruitment vacancies/pipeline, immutable candidate history | Partial | Interviews, offers, careers applications and complete conversion missing |
| Branding, supplied logo/favicon, role dashboards | Implemented but browser verification incomplete | Manager/employee/recruiter foundations; payroll unavailable |
| Domain registry, leases, DNS checks, routing proofs, URL builder, realm cookies | Implemented and verified by automated tests | Real customer domain and account operations unverified |
| Offline domain attestation | Insecure before this release | New signing timestamp previously masked stale offline exports; fixed by independent server retrieval |
| Managed hosting attachment | Blocked by external configuration | Native Sites API IDs do not expose underlying Cloudflare zone/Custom Hostname UUID. No guessed account or fallback configuration |
| Cashfree Secure ID | Missing in input; PAN Lite slice added | Credentials/account products/real sandbox unavailable |
| Private employee documents | Missing in input; private quarantine foundation added | Real scanner deployment, review/corrections and real R2 workflow validation pending |
| Attendance, shifts, leave, payroll | Missing and disabled | Requires dedicated implementation/calculation tests; no disbursement enabled |
| Expenses, assets, helpdesk, performance, durable notifications | Missing | Do not expose fake working controls |
| Backup/restore, load, accessibility/browser acceptance | Not verified | Independent production acceptance work required |

## Hosting inventory, read-only

Native domain listing reports hrms.sohansoft.in and erp.sohansoft.in active, provider active, TLS active. HRMS project appgprj_6acc998779048191a144f8c871a17577, Worker site---6acc998779048191a144f8c871a17577. ERP project appgprj_6ac07a6917c48191ba7f4cf066eb5db6, Worker site---6ac07a6917c48191ba7f4cf066eb5db6. ERP's separate sohan-erp-domain-proxy external deployment/routes/zone configuration remain unverified. No ERP code, secret, DNS, route or fallback origin changed.

Available runtime keys at inspection: FAST2SMS_API_KEY, FAST2SMS_OTP_ID, PLATFORM_ADMIN_MOBILE, PLATFORM_OWNER_EMAIL. Values are omitted. No Cashfree, scanner or authenticated Cloudflare read credentials existed.

## Priorities and exact next checkpoint

1. Complete domain freshness and fail-closed authenticated evidence without changing provider architecture.
2. Add a bounded PAN Lite service with persistent consent/idempotency, platform/company configuration and explicit privacy grants; keep production gated.
3. Private R2 quarantine and authenticated scanner receipt/download boundary. Actual malware engine remains external.
4. Next unfinished phase: configurable pre-activation onboarding forms, invitation resumes/corrections, document review/version history, independent provider reconciliation and candidate conversion. Existing activation invitations are preserved; this release does not connect PAN results to candidate approval.
5. Then implement attendance/leave, followed by independently validated payroll, durable jobs and remaining modules.

Commercial readiness is not achieved by this checkpoint. A build/lint tooling advisory remains: braces 3.0.3, GHSA-vfj7-8cjw-p6xm, high, no published patched version in the current advisory. Dependencies were not silently suppressed or replaced.
