# Milestone 06 — customer-domain foundation

12 October 2026. Source baseline: deployed Milestone 05 commit 8cc43c2b53871a3d52f95feafe3d42a3c0490256, 101 passing tests. Audited routing, authentication, authorization, schema/migrations, workspace links, branding and hosting configuration before extending them. Existing React/TypeScript, Vinext/Vite, Workers, D1/Drizzle and Fast2SMS remain in use.

## What is implemented

- Persistent tenant_domains registry: unique normalized hostname, immutable tenant/hostname association, public ownership challenge/expiry, ownership/provider/TLS/routing status, provider record ID and DNS instructions, primary selection, version, session epoch, 24-hour verification lease, timestamps and diagnostics.
- Register, DNS verification, challenge rotation/reopening, signed hosting-status import, HTTPS routing activation, disable, logical removal and primary-domain actions. Removed hostnames remain reserved to prevent stale DNS/session reassignment; physical provider removal is a separate operator step.
- Super Admin management panel with company selection, setup records, copy instructions, current states, diagnostics, action errors/loading states and a hosting receipt form. Mutations require recent verified platform sessions; company admins/custom-host sessions cannot manage mappings.
- DNS ownership reads Cloudflare's DNS-over-HTTPS resolver. Application TXT values are actual cryptographically random challenges, not fabricated Cloudflare validation records. Missing TXT records do not mark ownership verified.
- Activation requires fresh ownership and signed managed-hosting/TLS evidence, the verified managed CNAME target, and a nonce-specific server-HMAC proof fetched over HTTPS from the customer hostname. Redirects, wrong responses, stale evidence, unknown hosting configuration and inactive TLS fail closed. External response sizes/timeouts are bounded.
- Signed operator bridge scripts/attest-managed-domain.mjs adopts actual native Sites domain results for the exact HRMS project. No runtime Cloudflare API credential is invented. This bridge is operator attestation, not automatic Cloudflare account provisioning.
- Worker request resolver rejects unknown, pending, disabled, removed, expired, inactive-tenant or unentitled custom hosts. It compares Host against the request URL authority and ignores arbitrary forwarding/proxy/tenant headers. A request-local AsyncLocalStorage context supplies the mapped tenant and session realm to SSR and APIs.
- Tenant-bound authorization filters workspace bootstrap, checks every existing scope-based read/write/export/report/history path, rejects foreign invitations, restricts branding reads and suppresses platform privileges on customer hosts. Normal primary-host multi-company switching still verifies membership/permissions server-side.
- Host-only Secure/HttpOnly/SameSite=Strict cookies remain unchanged. Sessions and OTP challenges now carry a realm. Customer domains cannot reuse primary or other-domain session/challenge tokens. Disable/rotation/removal and failed verification change the realm epoch; successful lease renewal preserves it. Root legacy-account migration runs only in the platform realm.
- Trusted tenantUrl helper generates customer URLs only from current verified primary registry entries; otherwise it retains the fixed primary hostname and canonical workspace path. It validates active company/subscription, paths and registry state. Future background jobs must pass their persisted tenant ID and separately enforce operation permissions; no background job engine is claimed here.

## Canonical routes

| Purpose | Primary domain | Verified customer domain |
| --- | --- | --- |
| Company home | /:slug | / |
| Administrator login/workspace | /:slug/admin/login, /:slug/admin | /admin/login, /admin |
| HR login/workspace | /:slug/hr/login, /:slug/hr | /hr/login, /hr |
| Manager | /:slug/manager/login, /:slug/manager | /manager/login, /manager |
| Employee | /:slug/employee/login, /:slug/employee | /employee/login, /employee |
| Recruiter | /:slug/recruiter/login, /:slug/recruiter | /recruiter/login, /recruiter |
| Payroll | /:slug/hr/payroll | /hr/payroll |

These are actual framework routes using existing permission-checked dashboard services. Payroll routes require authentication and tenant authorization and explicitly report that payroll is unavailable; no payroll data/actions are enabled. Existing /company/:slug/:mode links redirect to canonical routes. Legacy reserved slugs retain their /company path. The dynamic login folder was consolidated under [mode] to meet framework route validation; its public URL remains compatible.

/join/:token and full configurable onboarding/private documents remain the next phase. Existing verified-mobile employee activation of an existing record is preserved; it is not represented as completed candidate onboarding.

## Actual hosting inventory

Native inspection this turn confirms:

| Application | Managed project | Worker | Primary hostname | Status / TLS |
| --- | --- | --- | --- | --- |
| HRMS | appgprj_6acc998779048191a144f8c871a17577 | site---6acc998779048191a144f8c871a17577 | hrms.sohansoft.in | active / active |
| ERP | appgprj_6ac07a6917c48191ba7f4cf066eb5db6 | site---6ac07a6917c48191ba7f4cf066eb5db6 | erp.sohansoft.in | active / active |

Both existing managed registrations return custom-domains.chatgpt.site. as their CNAME target. The HRMS manifest retains DB and no R2. The ERP manifest retains DB and BUCKET. Provider physical D1 identifiers are not exposed by these manifests; Vite's zero UUID is a build placeholder.

Read-only inspection retained the ERP template at deployment/custom-domain-proxy.ts / .wrangler.json in the ERP checkout. It names sohan-erp-domain-proxy, forwards to erp.sohansoft.in and uses DOMAIN_PROXY_SECRET. Its guide proposes a broad Worker route. Actual external proxy deployment, account/zone routes, fallback origin, DNS configuration and account Cloudflare-for-SaaS capabilities remain unverified. No ERP files, secret, DNS, routes, fallback origin or Worker were changed. No wildcard HRMS route or external proxy was deployed.

## Exact operator onboarding sequence

1. Register an actual customer hostname against the correct company in Super Admin. Platform/ERP/internal hostnames are prohibited. Copy the generated _sohansoft-hrms.<hostname> TXT record to customer DNS.
2. Check ownership. Missing/mismatched TXT remains pending; resolver/provider errors are failures, not successes. Challenges expire after seven days and can be rotated; rotation closes access until verification completes.
3. Use the supported Sites native custom-domain operation to attach this exact customer hostname to the HRMS project above, retaining its public application-login shell. Never attach it to ERP. Do not replace existing records. No real customer hostname was supplied or attached in this release.
4. Obtain the native provider's actual CNAME, ownership/certificate records and refresh its DNS/provider/TLS status. Apply only those returned records at customer DNS. Do not derive account IDs, certificate tokens, wildcard routes or fallback origins from examples. The application only supports the verified managed subdomain CNAME method in this milestone; apex/wildcard/custom proxies are not enabled.
5. Configure an independent high-entropy HRMS_DOMAIN_SYNC_SECRET as an HRMS runtime secret and in the operator's protected environment. Never reuse DOMAIN_PROXY_SECRET, put the secret in a URL/form/repository, or expose it to the browser. It is currently not configured by this release; activation stays blocked until configuration.
6. Feed the unchanged structured result of the HRMS native list_custom_domains operation into scripts/attest-managed-domain.mjs through stdin. Pass the public hostname, registry UUID and current version using hostname=..., domainId=..., version=... arguments. This script does not mutate Cloudflare. It signs current status evidence; the operator must use a freshly checked native result. Cached/exported evidence is not a substitute for current provider checks.
7. Import the script's payload/signature through the Super Admin receipt form. Exact project, hostname, domain ID, version, managed target, signature and a ten-minute age limit are checked. DNS/certificate records shown in the panel come from the signed provider result, not guessed values.
8. Recheck ownership within fifteen minutes and select Check routing & activate. The app validates DNS CNAME, active hosting/TLS evidence and fresh HTTPS routing proof. Do not turn off Cloudflare security checks to make a failed probe pass; resolve the actual routing/HTTPS issue.
9. Optionally set the active hostname as primary for generated tenant links. Browser login uses a fresh OTP on that hostname; cookies are never widened or shared across registrable domains. Test authenticated SSR, role routes, logout/revocation, branding and tenant isolation on the real hostname before commercial use.
10. Repeat current hosting/ownership/routing checks before the 24-hour lease expires. Successful renewal preserves sessions. Negative checks revoke access; expired leases fail closed. Durable automated reconciliation/provider access is not yet implemented, so this currently requires an operator process and is a commercial-launch limitation.
11. To offboard, disable/remove the app mapping first, then detach the exact native customer hostname and remove its customer DNS records under authorized operator control. Removal does not pretend to delete external hosting. Retained registry/audit records prevent stale hostname reassignment. Primary HRMS and ERP entries cannot be changed through this screen.

## Database migration and recovery

Additive 0007_bent_kabuki.sql adds tenant_domains and realm columns to sessions/otp_challenges. Existing rows receive platform realm; prior migrations and tenant IDs/aliases remain intact. Database guards enforce normalized records, immutable hostname/tenant associations, verification prerequisites for active status, one active primary per tenant and retained removal history. Service writes/audit use atomic batches and version guards; stale asynchronous checks cannot overwrite newer disabled state or append false success audit.

Capture/verify a provider backup before production changes. Tests upgrade a populated pre-domain schema and preserve legacy sessions/aliases, check foreign keys/integrity, and retain existing recovery tests. This is not an actual production D1 restore.

Before rolling back to a pre-domain Worker, disable/detach all customer hostnames or retain the Milestone 06 host/realm guard in the rollback build. Old code does not enforce these invariants. Keep additive schema/realm data; do not drop tables/triggers, reset epochs, recycle domains or restore active sessions blindly. Prefer an inspected forward fix. No destructive migration or infrastructure rollback was performed.

## Verified and unverified results

Baseline 101 tests passed. Expanded suite, typecheck, lint, Drizzle drift validation and production build results are in the publication receipt. New tests cover normalization/reserved hosts, permission/fresh-session checks, DNS ownership, forged/stale/mismatched receipts, TLS/routing gates, redirects, domain states/lease expiry, Host header injection, ignored forwarding headers, company entitlements, tenant-bound reads/writes/exports, URL builders, overlapping SSR contexts, OTP/session realm replay, host-only cookies/logout/CSRF, concurrent disable/verification, renewal and populated migration upgrade.

No actual customer domain registration/activation, customer-domain authenticated browser journey, live OTP delivery, production restore or edge load test was performed. The required managed browser capability is unavailable; no alternative preview/browser was installed. Native primary-domain and deployed schema checks plus available anonymous HTTP smoke are recorded separately. Synthetic hosting/DNS/provider responses in tests are not external deployment evidence.

Full dependency audit still reports one high braces advisory (GHSA-vfj7-8cjw-p6xm), no listed patch, in trusted build/lint glob tooling. No warning/assertion was suppressed. Independent security review, CSP nonce work, recovery/MFA and load/accessibility/browser acceptance remain open.

## Next unfinished phase

Private employee documents and configurable onboarding: bind private R2, define tenant/document/sensitive-field permissions, versioned metadata, bounded upload validation, quarantined storage, a configured fail-closed malware scanner and authorized downloads, then verified resumable invitations/forms/review/corrections and idempotent employee conversion. HRMS currently has no private R2 binding/scanner. Do not enable public uploads or downloads while scanning is unavailable. Attendance, leave, payroll and other unimplemented modules remain disabled; no disbursement or compliance claim.

Official Cloudflare references checked: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/common-api-calls/ and https://developers.cloudflare.com/api/resources/custom_hostnames/methods/get/. Account capability/route changes require actual inventory and approval; the managed-hosting bridge does not assert that the user's own Cloudflare for SaaS zone is enabled.

## Changed files

- .env.example
- app/[slug]/[mode]/login/page.tsx
- app/[slug]/[mode]/page.tsx
- app/[slug]/[role]/login/page.tsx
- app/[slug]/hr/payroll/page.tsx
- app/[slug]/page.tsx
- app/admin/login/page.tsx
- app/admin/page.tsx
- app/api/branding/route.ts
- app/api/domains/route.ts
- app/api/hrms/route.ts
- app/company/[slug]/[mode]/page.tsx
- app/company/[slug]/page.tsx
- app/employee/login/page.tsx
- app/employee/page.tsx
- app/globals.css
- app/hr/login/page.tsx
- app/hr/page.tsx
- app/hr/payroll/page.tsx
- app/layout.tsx
- app/login/page.tsx
- app/manager/login/page.tsx
- app/manager/page.tsx
- app/page.tsx
- app/recruiter/login/page.tsx
- app/recruiter/page.tsx
- app/workspace/page.tsx
- build/sites-worker.ts
- cloudflare-env.d.ts
- components/hrms-domains.tsx
- components/hrms-workspace.tsx
- db/schema.ts
- docs/DEPLOYMENT.md
- docs/MILESTONE06_DOMAINS.md
- docs/PROJECT_CHECKLIST.md
- docs/RECOVERY.md
- drizzle/0007_bent_kabuki.sql
- drizzle/meta/0007_snapshot.json
- drizzle/meta/_journal.json
- lib/hrms/access.ts
- lib/hrms/auth.ts
- lib/hrms/domains.ts
- lib/hrms/server-auth.ts
- lib/hrms/service.ts
- lib/hrms/tenant-context.ts
- lib/hrms/workspace-links.ts
- scripts/attest-managed-domain.mjs
- tests/domains.test.mjs
- tests/workspace-links.test.mjs
