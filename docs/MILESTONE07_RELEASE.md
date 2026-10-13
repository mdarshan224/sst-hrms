# Milestone 07 foundation checkpoint

This release is partial: authenticated domain evidence, PAN Lite verification for linked employees, and private document quarantine. Full candidate onboarding, attendance, leave, payroll and additional HR modules remain unfinished. Do not claim commercial acceptance or identity/payroll compliance.

## Implemented source

- Existing domain registry and URL/session architecture preserved. Fresh authenticated Cloudflare retrieval replaces offline status authority. Host/project/tenant/deployment binding, bounded response, timeout/redirect protection, persisted deployment evidence and active/ownership/TLS/route gates. Native managed attachment still requires operator capability; fail closed by default.
- Server-only PAN Lite adapter, approved sandbox input test action, RSA authentication, strict documented business-result parsing, no automatic ambiguous retries, masked credential status.
- Five persistent Secure ID tables: platform flags; company policy; independent consent/check/idempotency records; explicit role privacy grants; webhook hash receipts. Employee-owned initiation, organization-scoped review, self-review denial, CAS review and configuration updates, audit and expiry-filtered reads. Broad administrator/support presets do not automatically grant new sensitive access.
- Native Super Admin integration panel, company verification settings/privacy grants, employee verification journey and HR review queue. No credential edit fields in browser; approved runtime secret workflow only.
- Private R2 binding, employee document metadata with composite tenant/employee FK, bounded private uploads, extension/MIME/signature checks, random keys, SHA-256, retry-safe storage, quarantine, authenticated scanner callback/deduplication, clean-only authorized streaming and employee deletion. Actual scanning infrastructure is not configured.
- Explicit employee_verification/private_documents subscription modules, validated by server plan configuration. Default plans unchanged; payroll/attendance/leave remain unavailable.

## Checks actually executed

Frozen `npm run install:ci`: passed. Input ZIP comparison: 196 tracked files identical. Baseline `npm test`: 120 passed. Final `npm test`: **150 passed, 0 failed, 0 skipped**. `npm run typecheck`, `npm run lint`: passed. `npm run db:generate`: no schema differences after generated migrations. Production `build-site.mjs`: passed. `git diff --check`: passed. All original tests retained; a migration preservation test now applies later migrations in chronological order rather than accidentally applying 0008 before 0007.

Tests use real generated SQLite migrations and synthetic provider/HTTP/R2 fixtures. Cashfree-approved sandbox PAN inputs are used, but **no live Cashfree sandbox/production call was performed**. No credentials/account entitlement were available. Tests do not constitute provider integration acceptance, live malware scanning, real customer-domain activation, browser testing, production OTP delivery or production restoration.

Dependency audit: pnpm audit --json reports 1 high braces GHSA-vfj7-8cjw-p6xm in trusted build/lint tooling, no published patched version; not suppressed. This remains a launch blocker for review.

## Changed files and database/API/UI boundaries

- Domain: lib/hrms/domains.ts, new hosting-provider.ts, app/api/domains/route.ts, build/sites-worker.ts, scripts/attest-managed-domain.mjs, components/hrms-domains.tsx, tests/domains.test.mjs and new hosting-provider tests.
- Secure ID: cashfree.ts, cashfree-config.ts, verification.ts, new /api/verification and /api/verification/webhooks/[mode] routes, components/hrms-verification.tsx, related tests/fixture.
- Documents: documents.ts, request-bytes.ts, /api/documents and /api/documents/scan, components/hrms-documents.tsx, document tests.
- Existing workspace/service, db/schema.ts, environment types/example and .openai/hosting.json extended. Supplied logo/favicon and all old migrations preserved.
- Additive migrations 0008_brown_argent.sql, 0009_illegal_famine.sql, generated snapshots/journal; 35 application tables. No DROP or destructive data migration.
- UI panels are embedded in existing platform/company/employee/people views, not a replacement application. No new dashboard URLs are claimed.

See MILESTONE07_AUDIT.md and MILESTONE07_DEPLOYMENT.md for exact external requirements and rollback. A publication result is separate from commercial readiness; record actual deployment IDs in the delivered archive's execution evidence.

## Resume here

Next: configurable secure pre-activation onboarding, resumable invitation forms, document review/rejection/correction/replacement history, real scanner/outbox consumer, provider reconciliation, and idempotent candidate conversion. Then attendance/shifts/leave and independently validated payroll. No existing tenant/company/auth records should be rebuilt. Preserve all applied migrations and this checkpoint's explicit privacy/entitlement boundaries.
