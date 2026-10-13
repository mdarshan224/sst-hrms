# Sohan Soft Tech HRMS — People & Workforce Platform

Milestone 04 adds verified-mobile employee activation, a personal profile/request portal, direct-report manager access, distinct HR/recruiter dashboards, and persistent tenant branding with the supplied platform logo/favicon. The full HRMS remains unfinished. See docs/ROLE_DASHBOARD_AUDIT.md and MILESTONE04_RELEASE.md for the current feature matrix, workflow guide and launch gaps. Existing architecture/OTP are preserved. Native domain/TLS status is now active for https://hrms.sohansoft.in.

# SohanSoft HRMS

Database-backed multi-tenant HRMS, upgraded with mobile OTP sign-in and customizable company dashboards. **This is a working incremental product; the full HR/payroll specification is not yet complete.**

## Architecture
- React + TypeScript, Next-compatible App Router through Vinext, Cloudflare Workers.
- Durable D1 SQLite with Drizzle schema and append-only migrations. PostgreSQL/Prisma remains a future migration decision.
- Fast2SMS SmartOTP sends/verifies codes server-side. Provider credentials are runtime secrets, absent from source and ZIP.
- Hashed random sessions in secure `__Host-` HTTP-only cookies; CSRF origin checks; absolute session expiry and logout revocation.
- Tenant memberships, custom RBAC, subscription gates and tenant-scoped composite foreign keys.
- Audited, reason-bound, one-hour Super Admin company access, bound to the verified session.
- Company dashboard routes and saved headline, message, widget selection/order, display density and hero style.

## Sign in and start
1. Open `/login` and enter the registered Indian mobile number.
2. Use the received 6-digit OTP. Super Admin is configured through `PLATFORM_ADMIN_MOBILE` (the requested number has been configured in hosting).
3. The configured Super Admin is routed to `/super-admin` after verification.
4. Create a company and assign a company administrator's mobile number; email is optional contact information and never proves identity.
5. The company administrator signs in with OTP and accesses their assigned workspace. Each company has `/company/<slug>`.
6. Super Admin uses **Open dashboard**, enters a reason and receives up to one hour of audited company access. Use **End admin access** or sign out to revoke it.
7. Company owners can click **Customize** on Overview to configure the dashboard. Branding settings remain in Workspace settings.
8. Additional teammates are invited with an expiring token bound to their verified mobile number.

An OTP-verified number with no membership gets no company access. Phone verification alone never grants access to an arbitrary tenant. Email-only legacy invitations must be replaced with mobile-bound invitations. Previous configured platform-owner memberships migrate to the new Super Admin only after that mobile number is OTP-verified.

## Required runtime configuration
`FAST2SMS_API_KEY` (secret), `FAST2SMS_OTP_ID`, `PLATFORM_ADMIN_MOBILE`, and D1 binding `DB`. `PLATFORM_OWNER_EMAIL` is optional and used only for controlled legacy membership migration. `.env.example` contains placeholders only.

Provider success requires HTTP success plus `return: true` and `status_code: 200`. An accepted send request is not proof of delivery. Delivery, account balance, approved templates and channels are controlled by Fast2SMS configuration. No live SMS test was initiated during the session.

## Commands
Use Node 24+ for the test adapter.
```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run db:generate
pnpm run build
```
In the managed environment `pnpm` is available as `node "$SITES_PNPM_BIN"`; supplied Sites installation/build/source helpers manage deployment. The archived source excludes dependencies, runtime secrets and runtime data.

## Source map
- `app/login`, `components/hrms-login.tsx`: mobile/OTP login UI.
- `lib/hrms/auth.ts`, `server-auth.ts`, `app/api/auth`: OTP challenge state machine and secure sessions.
- `app/super-admin`, `app/company/[slug]`, `components/hrms-workspace.tsx`: platform and independent company workspaces.
- `lib/hrms/domain.ts`, `service.ts`, `http.ts`: validation, authorization, transactions and HTTP handling.
- `db/schema.ts`, `drizzle`: normalized 27-table schema and migrations.
- `tests/auth.test.mjs`, `service.test.mjs`, `d1-adapter.mjs`: 92 tests exercising real migration/service SQL plus mocked provider contracts.
- `docs/PROJECT_CHECKLIST.md`, `docs/DEPLOYMENT.md`: verified scope, remaining work and DNS configuration.

## API surface
`GET /api/auth` reports the current own session and configuration readiness. `POST /api/auth` supports `send`, `verify`, `logout`, `session.revoke`, `logout_all`; `GET ?view=sessions` lists own-session metadata.
`GET /api/hrms` reports memberships. Workspace, platform, candidate history and employee exports enforce permissions.
`POST /api/hrms` supports the implemented company, plan, invitation, employee, recruitment, branding, dashboard and support-access operations. Client-supplied tenant IDs select a workspace; they do not authorize it.

No ChatGPT sign-in integration remains in application routes. Company documents, payroll and other unfinished modules have no fake APIs or simulated success states.

## Foundation stabilization release
See docs/AUDIT.md, PROJECT_CHECKLIST.md, RELEASE.md and RECOVERY.md for the source inventory, current implementation state, test results and recovery limits. This release adds branch/department scopes, restricted permission delegation, membership/session revocation, server pagination and accurate aggregate KPIs, employee lifecycle history/edit/restore, versioned vacancy edits and security headers. New schema changes are additive.

A dependency audit includes build dependencies because Vinext/RSC build dependencies can enter the Worker bundle. Available advisory fixes are pinned in pnpm-workspace.yaml; final audit retains one high-severity `braces` advisory in glob-processing tooling with no listed patched version. This release is not certified secure or commercially complete.
