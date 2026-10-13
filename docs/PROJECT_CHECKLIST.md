# Milestone 06 checkpoint

- [x] Unique tenant-domain registry, ownership checks, scoped management UI and auditable lifecycle.
- [x] Managed-provider signed evidence bridge, HTTPS routing proof and fail-closed activation gates.
- [x] Trusted request-local SSR/API tenant mapping, host-only realm-bound sessions/challenges and canonical real framework routes.
- [x] Cross-tenant/host/cookie/redirect/concurrency and migration-upgrade regression tests.
- [ ] Configure independent hosting-sync secret; attach and verify an actual customer domain.
- [ ] Actual custom-domain authenticated browser/OTP tests and automated daily provider reconciliation.
- [ ] Private R2/scanner, secure documents and complete configurable onboarding.

Milestone06 details and current limits supersede historical statements below.

# Current Milestone 05 checkpoint

- [x] Automatic name-derived workspace slugs, bounded collision retries and database uniqueness.
- [x] Platform-only slug changes with persistent protected redirect aliases.
- [x] Canonical root workspace links, branded admin/HR/manager/recruiter/employee sign-in aliases; payroll accurately unavailable.
- [x] Native independent HRMS/ERP managed Worker/domain/TLS inventory recorded.
- [ ] Customer hostname registry, ownership/TLS/provider checks, tenant-bound routing and custom-domain session tests.
- [ ] Verify deployed external ERP proxy, zone routes, fallback origin and Cloudflare for SaaS entitlement with account access.

See MILESTONE05_AUDIT.md and MILESTONE05_RELEASE.md for current source/test evidence and next unfinished steps. Historical checklists below do not supersede these milestones.

# Current milestone update — 12 October 2026

Milestone 04 adds employee/mobile-account activation, own-profile requests and reviewed changes, reporting-manager/direct-report scope, distinct HR/recruiter/employee/manager dashboard data, platform green/gold design and tenant logo/branding editor. See ROLE_DASHBOARD_AUDIT.md and MILESTONE04_RELEASE.md for current status and limits. These are foundation workflows; the complete self-service/manager/payroll/HRMS acceptance criteria remain unfinished. Native DNS/TLS now reports hrms.sohansoft.in active. Live OTP and browser E2E remain unverified. Historical milestone checklist follows; deployment receipts supersede historical deployment statements.

# SohanSoft HRMS — implementation checklist

12 October 2026 — Milestone 03: foundation stabilization and organizational access.

## Completed and verified locally
- [x] Existing source audited; existing architecture and Fast2SMS OTP preserved. See AUDIT.md for feature inventory and limitations.
- [x] Tenant provisioning, manual subscription plans/trials, employee quotas, active/suspended/archived tenant gates and core/recruitment entitlements.
- [x] Platform owner operations separated from customer data access; company dashboards and verified-mobile memberships.
- [x] Custom role permissions with branch/department restrictions; database tenant-scoped foreign keys.
- [x] Permission delegation limited to actor authority, owner role name reserved, Company Admin/HR Manager/Recruiter/Auditor presets installed explicitly.
- [x] Employee/candidate/job reads, aggregate KPIs, exports, histories and mutations scoped to implemented organizational restrictions.
- [x] Mobile-bound expiring hashed invitations; acceptance/revocation and replay protections.
- [x] Membership revocation/restoration, immediate authorization checks and immutable audit trail; self-role/revocation guards.
- [x] OTP challenge cooldown/limits, secure hashed HTTP-only sessions, absolute expiry, replay/concurrency protections.
- [x] Own-session inventory, individual revocation, sign out all devices; revocation closes support grants.
- [x] Recent OTP verification required to open reason-bound, audited, session-bound, one-hour Super Admin support access.
- [x] Bounded server pagination, literal wildcard search, status/branch/department filters and deterministic directory sorting; candidate stage filters and paginated vacancy lists.
- [x] Scoped dashboard/headcount/applicant counts reconcile with source records beyond the former 500-row snapshot limit.
- [x] Existing-employee creation, sequential company IDs, duplicate checks, edit/archive/restore UI, optimistic versions and immutable lifecycle snapshots.
- [x] Tenant-scoped branches/departments, job assignments and vacancy edit/close UI with optimistic concurrency.
- [x] Configurable internal candidate pipeline, authorized transitions, reasons and immutable decisions.
- [x] Dashboard customization retains title/message/widget order/visibility/density/style; saved heading now renders in hero.
- [x] CSV formula protection including leading whitespace/control characters; exports restricted and audited.
- [x] Same-origin JSON mutations, streamed-body bounds, rate limits, generic failures, security headers and no-store HTML/JSON responses.
- [x] Additive migrations 0003/0004 (22 application tables); applied migrations preserved.
- [x] 71 automated tests pass, including all 54 original tests and 17 new foundation/auth/upgrade/restore cases.
- [x] Synthetic SQLite backup/restore and integrity checks pass. This is not a production D1 restoration drill.

## Release checks
- [x] Initial test/type/lint/build baseline passed before dependency hardening.
- [x] Final dependency-hardening test/type/lint/build results recorded in RELEASE.md.
- [ ] Native deployment and live schema results recorded in RELEASE.md.
- [ ] Live anonymous HTTP smoke checks recorded in RELEASE.md.
- [ ] Browser E2E and responsive/accessibility QA: unavailable in this managed environment.
- [ ] Live Fast2SMS delivery and code verification: not exercised in this session.
- [ ] hrms.sohansoft.in DNS ownership, routing and TLS: pending; exact DNS records in DEPLOYMENT.md.

## Remaining implementation phases
### Phase 2 foundation follow-ups
- [x] Direct-report/current reporting-manager scope and own-employee authorization.
- [ ] Full team hierarchy/delegation and sensitive-field policies.
- [x] Verified-mobile employee association and limited own-profile/self-service request access; broader employee services remain unfinished.
- [x] Platform supplied logo/favicon; tenant PNG logo, primary/accent, locale/currency/timezone editor.
- [ ] Legal entities, contact information, workweek, policies/holidays and configurable numbering beyond prefix/sequence.
- [ ] Per-company module overrides, storage/API/notification quotas and complete subscription history.
- [ ] Large background exports, FTS/keyset evaluation, configurable retention, deletion and tenant export.
- [ ] Independent MFA, account recovery, privileged step-up beyond support opening, bot protection and CSP nonces.

### Phase 3 recruitment and onboarding — next coherent milestone
- [ ] Private R2 storage, file-type/size validation, quarantine and fail-closed malware scanning.
- [ ] Short-lived authorized downloads/previews, versioned document categories and per-document verification history.
- [ ] Public branded careers, applications, consent/retention, duplicate detection, tags/talent pools and candidate identifiers.
- [ ] Requisitions/approval, interviews/panels, feedback/scorecards, calendars and hiring decisions.
- [ ] Offer templates/PDFs, maker-checker approval, acceptance/rejection/expiry, signed-offer tokens and correction/re-upload review.
- [ ] Configurable onboarding forms; personal/contact/employment/emergency/education/identity/banking/consent sections.
- [ ] Draft/resume, secure submissions, field corrections, checklists/policies/induction and approval hierarchy.
- [ ] Verification-gated transactional candidate conversion, duplicate prevention, preserved history and mobile-bound employee activation.

### Phase 4 core HR and employee services
- [ ] Employment records, effective-dated promotions/transfers/salary changes, reporting hierarchy, probation/confirmation and contract renewal.
- [ ] Restricted employee details/document vault, HR letters, profile-change approvals and policy acknowledgements.
- [ ] Employee/manager portals, assets, helpdesk, resignation/offboarding/clearance, account revocation and rehire history.

### Phase 5 attendance, shifts and leave
- [ ] Work sessions/check-in/out/breaks, timezones, overnight/rotating shifts and holiday calendars.
- [ ] Duplicate/idempotent punches, corrections and approvals, attendance locking/reopening and reports.
- [ ] Authorized GPS/geofences/device adapters and safe offline sync where supported.
- [ ] Leave policies/accrual/ledgers, half-day/hourly requests, overlap/balance guards, delegated approvals/cancellation and calendars.
- [ ] Attendance/leave/payroll integration and recovering real-time UI updates.

### Phase 6 payroll
- [ ] Decimal-safe salary structures/effective dates, attendance/LOP/overtime/arrears and reproducible input snapshots.
- [ ] Effective-dated PF/ESI/PT/TDS/tax-regime configuration and authoritative-source/specialist validation.
- [ ] Joiner/leaver/rounding/threshold/retroactive boundary tests before any disbursement use.
- [ ] Run uniqueness, maker-checker approval, immutable finalization/adjustments, payslips/registers/bank export uniqueness.
- [ ] Reconciliation, loans/reimbursements, accounting exports, tax documents and full-and-final settlement.

### Phase 7 performance and analytics
- [ ] Reviews/goals/OKRs/templates/scales/360, skills/training/certifications, PIPs and promotion planning.
- [ ] Workforce/attendance/leave/payroll/recruitment/attrition analytics and permission-controlled CSV/XLSX/PDF reports.

### Phase 8 SaaS operations and integrations
- [ ] Transactional outbox, durable queues/schedulers, in-app notifications, provider delivery logs/retries/idempotency/dead letters.
- [ ] Email/SMS/WhatsApp templates/preferences and independently configured providers.
- [ ] Billing/payment webhooks/invoices/renewals/add-ons, quotas and usage monitoring.
- [ ] Scoped API keys, signed webhooks, customer domains, integrations and tenant offboarding.
- [ ] Expenses/travel/reimbursements/assets/helpdesk/surveys and exit-clearance workflows.

### Phase 9 production acceptance
- [ ] Production D1 backup restoration drill and disaster recovery validation.
- [ ] Independent security review, penetration tests, performance/load/edge concurrency checks and monitoring/incident response.
- [ ] Browser critical-flow E2E, accessibility and responsive-device verification.
- [ ] Legal/payroll/privacy/retention specialist review; no certification or legal compliance claim.

## Known limitations
Full dependency audit retains one high-severity braces advisory with no listed patch in trusted build/lint glob processing. Available advisory fixes were applied and verified; see AUDIT.md.

No files, payroll, attendance, leave, offers or onboarding functionality is implied by directory/pipeline UI. No external email, calendar, payment or notification delivery is simulated. OTP provider contract tests use synthetic responses.

Employee/candidate history views are bounded to recent records, and directory exports above 5,000 records fail explicitly. Vacancy selection in the candidate form uses the initial workspace page; a paginated/searchable form picker remains necessary for many simultaneous open vacancies. Existing unassigned jobs/employees must be assigned to become visible to restricted roles. Manager/direct-report access and confidential HR fields remain unimplemented.

The test D1 adapter uses real SQLite and atomic transactions; it does not certify Cloudflare edge behavior. No production sensitive data was copied into test fixtures. Required runtime variables and deployment steps are in .env.example and DEPLOYMENT.md.

## Next concrete implementation step
Bind private R2, implement quarantined versioned documents with fail-closed scanning and authorized streaming, then build signed-offer review and verification-gated onboarding/conversion. Preserve this milestone's authorization and migration tests.

## Milestone 07 foundation checkpoint
See MILESTONE07_RELEASE.md for verified source/tests and MILESTONE07_AUDIT.md for the unfinished inventory. Domain evidence hardening, linked-employee PAN Lite and private quarantine are implemented. Full configurable onboarding, document HR review/corrections/scanner consumer, other verification products, attendance/leave/payroll, additional HR modules and production acceptance remain pending. Do not mark the entire milestone/product complete.


## Milestone08 checkpoint
Read MILESTONE08_RELEASE.md and MILESTONE08_DEPLOYMENT.md for current scope, additive0010/0011 migrations, configuration and rollback. Prior reports are historical. Complete HRMS/payroll or commercial production readiness is not claimed.
