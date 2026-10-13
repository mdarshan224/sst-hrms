# Milestone 06 deployment

See MILESTONE06_DOMAINS.md for current architecture, exact operator onboarding and external blockers. Retain existing HRMS/ERP domain registrations and secrets. Migration 0007 is additive. HRMS_DOMAIN_SYNC_SECRET is optional until customer-domain activation; missing configuration fails closed. No custom hostname, wildcard route or fallback origin is changed by publication. Existing primary-host sessions retain platform realm. Real customer activation/authenticated browser verification remains required.

# Current deployment work — Milestone 05

Workspace aliases use the existing HRMS Worker. Native inspection confirms independent active/TLS-active HRMS and ERP managed Workers; see MILESTONE05_AUDIT.md for exact IDs and limits. No DNS, ERP proxy secret, Worker route, or SaaS fallback origin is changed by this source release. Additive migration 0006 reserves historical workspace identifiers; no new secret is needed. Customer custom-hostname mapping and registry-bound tenant/session routing are still unfinished. Existing host-only cookies must not be widened to a parent domain.

Do not deploy the ERP proxy template as an HRMS proxy. Do not add */* or change shared SaaS origin configuration without a read-only account inventory and impact review. Native domain records below describe the managed primary HRMS registration, not customer-domain onboarding instructions. Use actual provider-returned customer records after the adapter is implemented.

# Current deployment status — Milestone 04

Native check on 12 October 2026 confirms hrms.sohansoft.in active, provider active and TLS active. Existing OTP runtime variables and D1 binding remain unchanged. Migration 0005 adds five tables; no existing data is deleted. Branding logo endpoint is public for login artwork; private documents are not stored there. Final published version and smoke checks are in the release receipt. Historical deployment instructions below retain earlier status observations.

# Deployment and session verification

## Environment
- Runtime: Cloudflare Workers with Next-compatible Vinext.
- Structured storage: D1 binding `DB`, declared in `.openai/hosting.json`.
- Required runtime configuration: `FAST2SMS_API_KEY` as a secret, `FAST2SMS_OTP_ID`, and `PLATFORM_ADMIN_MOBILE`. The supplied configuration is stored in hosting, never in source.
- Optional `PLATFORM_OWNER_EMAIL` is used only to migrate previous platform memberships after the configured root mobile is OTP-verified.
- R2, mail, payroll, queue, calendar and payment integrations are not configured.
- Future `DATABASE_URL` and provider names in `.env.example` are commented placeholders and are not consumed by the current app.

## Release steps
1. Install the lockfile with the supplied dependency helper.
2. Run tests, type checking and lint. Generate migrations when the schema changes; do not rewrite applied migrations.
3. Build using the supplied Sites build helper.
4. Commit/push exact source using the credential via stdin to the Site workflow helper; package from the same source state.
5. Save and deploy the matching archive. Sites provisions D1 and applies migrations before Worker publication.
6. Deploy the verified OTP release while the Site is private, then enable public Site access as authorized by the request to remove ChatGPT login. The login page is public; company records are protected by application OTP sessions and permissions.
7. Register `hrms.sohansoft.in`; add the exact returned CNAME/verification records through the domain's DNS provider, then refresh native domain status.
8. Do not consider the domain active until DNS ownership, routing and TLS are verified.
9. Before commercial exposure complete authentication, file safety, onboarding, payroll checks, backups and security review in PROJECT_CHECKLIST.md.

## Session checks
- Integration tests: 54 passed.
- TypeScript: passed (tsc --noEmit).
- ESLint: passed (full project).
- Production build: passed (Vinext/Vite, including server and client output).
- Live HTTP smoke checks: `/login` returned 200 with the OTP form, `/api/auth` returned 200 with authenticated=false/configured=true, and anonymous `/api/hrms` returned 401. These requests did not use ChatGPT identity or an auth cookie.
- Browser E2E/visual QA: not run; required browser capability is unavailable.
- Original release: succeeded at https://sohansoft-hrms.info756362.chatgpt.site.
- OTP release: native deployment succeeded at https://sohansoft-hrms.info756362.chatgpt.site.
- Site access: public, as required for independent mobile sign-in; company records remain protected by own sessions and tenant permissions.
- Live D1 schema: all 18 tables confirmed after deployment. Existing tables and records were preserved; migrations appended.
- Domain: hrms.sohansoft.in registered; latest refresh still pending DNS verification and TLS validation. No DNS-provider credentials/access were supplied.


## Exact DNS records for sohansoft.in

Add these records at the DNS provider. Some providers expect names relative to `sohansoft.in` (`hrms`, `_openai-site-verification.hrms`, `_cf-custom-hostname.hrms`). Use the appropriate name format, retain the values exactly, and use DNS-only mode if your provider has a proxy option.

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `hrms.sohansoft.in` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.hrms.sohansoft.in` | `openai-site-verification=SqoWQVpuQ4zMDIMMWbEUKk9YS2LQaekioTq5ZCVg8hI` |
| TXT | `_cf-custom-hostname.hrms.sohansoft.in` | `3db91b89-958a-4c36-bc46-8b2534fb6870` |

The subdomain uses the CNAME. Do not add the apex A-record targets to `hrms` alongside its CNAME. Registration alone does not verify routing or TLS. After records propagate, refresh the custom-domain status through Sites. Until active, use the private generated URL above.


## Authentication operations
- Application routes no longer use ChatGPT authentication. The Site boundary must permit anonymous visitors to reach `/login`; the app rejects unauthorized company API requests.
- SmartOTP uses official `/dev/otp/send` and `/dev/otp/verify` endpoints with an Authorization header from the server-side secret.
- Codes are not stored, logged or returned by the app. Session and challenge tokens are stored as SHA-256 hashes.
- Super Admin sessions last one hour; other sessions last twelve hours. Tokens are revoked on logout. Sessions are not refreshed indefinitely.
- Sending has a 60-second cooldown, 6 requests/phone/hour and 12 requests/IP/hour; verification is capped at 5 attempts/challenge and 40 attempts/IP/hour. Tune policies and add a reviewed bot-protection integration before a large public rollout.
- Provider requests time out after 12 seconds; success is never simulated after provider failure.
- No live OTP was sent by the assistant. Delivery and OTP verification on the configured account must be confirmed through the deployed login page.
- Email-only old invitations are intentionally ineligible for mobile acceptance; reissue them with an assigned number.
- Restore drills, security review, additional MFA, recovery and account/session administration remain launch prerequisites.

## Milestone 03
Preserve the current public shell and application OTP identity. No new runtime secrets or providers are required for the foundation release. New migrations 0003 and 0004 are additive; see RECOVERY.md. Use explicit reauthentication at `/login?reauth=1&next=/super-admin` before opening support access if the login is more than ten minutes old. Account security supports own-session revocation and sign out all devices.

Current checks and source changes are in RELEASE.md. A successful native publication receipt and live smoke results are included in the delivered ZIP after deployment. Custom-domain DNS/TLS remains an external operation; the existing records above were confirmed by native domain listing during this session.

## Milestone 07 override
Read `MILESTONE07_DEPLOYMENT.md` before domain sync, Cashfree or document rollout. Offline hosting receipts are no longer fresh-provider evidence. New source requests private BUCKET storage; it does not configure a malware engine or enable Cashfree. ERP remains separate.


## Milestone08 checkpoint
Read MILESTONE08_RELEASE.md and MILESTONE08_DEPLOYMENT.md for current scope, additive0010/0011 migrations, configuration and rollback. Prior reports are historical. Complete HRMS/payroll or commercial production readiness is not claimed.
