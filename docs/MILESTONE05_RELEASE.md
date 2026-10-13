# Milestone 05 release — 12 October 2026

## Implemented scope

Automatic company workspace allocation, deterministic collision retries, server-resolved root workspace/role-login aliases, platform-only audited slug changes with immutable historical redirects, canonical workspace/open/copy/role links and company-creation URL preview. Existing OTP, dashboard permission checks, employee bindings, branding/logo/favicon and ERP hosting are preserved. Full HRMS/custom-domain acceptance remains unfinished.

## Verification

- Baseline: 92 tests, typecheck and lint passed.
- Final automated suite: 101 tests passed, zero failed/skipped; includes slug normalization/reserved roots/lengths, duplicate names, rollback, simulated collision race, rename chains, historical link reservation, database guards, platform privilege checks, safe canonical URL builder, legacy reserved-slug compatibility and payroll unavailable state.
- Drizzle generation: no schema drift after additive migration 0006; 28 application tables.
- Typecheck, lint and matching production build are run before publication; native deployment/live checks recorded in the delivered receipt.
- Full dependency audit: one unresolved high braces advisory, no listed patched version; no suppression.
- Browser E2E/mobile/accessibility: unavailable in this environment; not claimed as passed.
- Live OTP, authenticated UI smoke, actual Cloudflare edge concurrency/load and production backup restore: not verified.

## Changed source

- lib/hrms/workspace-links.ts: slug validator/generator/candidates, role destinations, canonical links and indexed alias resolution.
- lib/hrms/domain.ts, service.ts: optional automatic slug, atomic provisioning retry and platform-only slug mutation/audit.
- db/schema.ts, drizzle/0006_tiresome_red_hulk.sql and Drizzle journal/snapshot: alias table/index/FK and ownership/immutability triggers. No existing migration edited, no data deleted.
- app/[slug]/page.tsx, app/[slug]/[role]/login/page.tsx and existing company routes: registered slug/alias lookup, active-tenant gate, branded role sign-in and explicit payroll unavailable page.
- components/hrms-workspace.tsx: creation URL preview, generated URL result, company workspace copy/open/role links and rename form.
- components/hrms-login.tsx, hrms-account-security.tsx: role sign-in label and framework Link navigation required by route-aware lint after root aliases were introduced.
- tests/workspace-links.test.mjs: nine regression cases exercising actual service SQL and migrations with synthetic data.
- docs/MILESTONE05_AUDIT.md, DEPLOYMENT.md, RECOVERY.md and PROJECT_CHECKLIST.md: current audit, independent ERP resource inventory and exact remaining work.

## External configuration and next unfinished step

No additional runtime secret is required for this milestone. Customer hostname registration, DNS checks, TLS activation, verified host routing and host-bound tenant/session isolation are NOT implemented by these path aliases. See MILESTONE05_AUDIT.md for known managed resources and unverified external ERP proxy/account setup.

Next implement the persistent domain registry and trusted resolver, then an approved Cloudflare/custom-hostname integration and routing diagnostics. Inspect actual Cloudflare zone, wildcard routes and fallback origin before any infrastructure changes; retain ERP Worker and DOMAIN_PROXY_SECRET. Bind private R2/scanner before onboarding uploads. Attendance/leave and payroll follow verified employee/workflow foundations, with independent statutory review before disbursement.
