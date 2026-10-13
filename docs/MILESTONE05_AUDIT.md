# Milestone 05 — workspace routing and Cloudflare inventory

12 October 2026. This is a coherent foundation upgrade of the existing application, not completion of the full product acceptance criteria.

## Source and baseline

Audited the deployed source checkout at b3334bb947e7b58ce64e64b792618ce8cc81fe35, prior audit/release/deployment/recovery/checklist, App Router pages, API dispatch, service authorization, authentication/session/provider code, D1/Drizzle schema and append-only migrations, workspace/login UI, build configuration, dependency lock and existing tests. Architecture stays React 19/TypeScript, Vinext/Vite, Cloudflare Workers, D1 and Drizzle. Fast2SMS SmartOTP, existing membership/session protections and tenant permissions remain authoritative. No new framework, database or authentication provider.

Baseline checks this turn: all 92 tests passed, typecheck passed, lint passed. Full dependency audit reports one high braces advisory (GHSA-vfj7-8cjw-p6xm), no patched version listed. This remains unresolved in trusted build/lint glob tooling; no advisory is suppressed. Final build results are recorded in MILESTONE05_RELEASE.md. No live OTP was sent.

## Source-based feature matrix

| Area | Status | Evidence / outstanding work |
| --- | --- | --- |
| Platform / company management | Implemented and verified locally; live authenticated flow not verified | Atomic provisioning, plans/manual subscriptions, company status, scoped memberships and audited support access retained |
| Workspace URLs | Implemented and verified locally in this milestone | Automatic slug, collision retries, fixed canonical URL builder, root aliases, role login destinations and persistent rename redirects |
| Super Admin dashboard | Implemented; partial overall product | Tenant/plan console works; commercial billing, storage/health monitoring and domain lifecycle remain missing |
| Company Admin dashboard | Implemented; partial overall product | Organization, directory, roles, recruitment, branding and settings; attendance/payroll operations missing |
| HR / recruiter dashboards | Implemented foundation, verified locally | Distinct queues/KPIs and allowed actions; interviews/offers/document review missing |
| Employee dashboard | Partial, verified locally | Mobile-bound employee association, own profile and change requests, sessions; attendance/leave/payslips/documents missing |
| Manager dashboard | Partial, verified locally | Bound identity, direct reports and limited DTO; approvals/shifts/performance missing |
| Payroll / finance dashboard | Missing, deliberately unavailable | No payroll engine, statutory rules, maker-checker runs or disbursement |
| Multiple memberships / custom roles | Implemented foundation | Permission-derived workspace switching and scoped roles; multiple simultaneous roles per membership not implemented |
| Employee activation invitation | Implemented foundation | Hashed expiring mobile-bound activation of existing employee; configurable public onboarding and candidate conversion missing |
| Recruitment | Partial | Internal jobs and versioned pipeline/history; public applications, interviews, offers and onboarding missing |
| Branding / logo / favicon | Implemented; UI browser verification unavailable | Supplied logo retained; green/gold tokens and tenant-scoped persistent PNG branding |
| Customer-domain registry / tenant resolver | Missing | No active tenant hostname registry, DNS ownership workflow, TLS lifecycle or host-bound tenant/session context yet |
| Primary domain hosting | Implemented and verified by native status | hrms.sohansoft.in active, provider active, TLS active; live anonymous checks recorded in release receipt |
| Private employee documents | Missing, external storage/scanner configuration required | R2 absent in HRMS manifest; public logos are not private document storage |
| Attendance / shifts / leave / payroll | Missing | No persistent engines or calculations; no compliance/disbursement claim |
| Events / jobs / real-time / notifications | Missing | No outbox, queue or external delivery simulated |
| Performance / expenses / assets / helpdesk | Missing | Unimplemented modules remain unavailable |
| Recovery / browser E2E / accessibility / load | Not verified in production | Synthetic SQLite tests exist; no production restore drill or browser capability available |

## Verified hosting inventory and ERP separation

Native Sites domain listing returned:

| Application | Project ID | Managed Worker | Domain | Native status / TLS |
| --- | --- | --- | --- | --- |
| HRMS | appgprj_6acc998779048191a144f8c871a17577 | site---6acc998779048191a144f8c871a17577 | hrms.sohansoft.in | active / active |
| ERP | appgprj_6ac07a6917c48191ba7f4cf066eb5db6 | site---6ac07a6917c48191ba7f4cf066eb5db6 | erp.sohansoft.in | active / active |

Both registrations return custom-domains.chatgpt.site. as their managed CNAME target. This is evidence of current managed hosting, not instructions to route customer domains to ERP or to replace DNS records. HRMS manifest binds D1 DB and no R2. ERP manifest binds DB and BUCKET. Physical provider D1 IDs are not exposed by these manifests; the zero UUID in Vite is a local-build placeholder, never an identified production database ID.

Read-only inspection of /workspace/sites/campus-ledger found deployment/custom-domain-proxy.ts and deployment/custom-domain-proxy.wrangler.json naming sohan-erp-domain-proxy. That template forwards customer traffic to erp.sohansoft.in with HMAC signed x-sohan-proxy headers and requires DOMAIN_PROXY_SECRET. Its setup guide proposes a broad */* route with more specific exclusions. Source presence is not evidence that the separate proxy, fallback origin, routes or secrets are deployed.

No customer Cloudflare account/zone inventory capability, API credential, token scope, plan/capability proof, external proxy deployment receipt or actual customer hostname was supplied. Consequently the external Worker, account routes, fallback origin and Cloudflare for SaaS configuration are unverified. No ERP source, secrets, DNS, Worker, fallback origin or route was changed. Do not add a wildcard HRMS route or change the SaaS fallback origin in the shared zone before inspecting the existing ERP account configuration.

## Security and integrity changes

- Automatically generated names use URL-safe lowercase ASCII slugs with deterministic numeric suffixes, reserved application roots and a 60-character bound. Explicit existing clients may still supply valid slugs; duplicates produce 409.
- Legacy tenants whose previously permitted slugs now coincide with reserved roots retain /company/:slug and query-based login links. New allocations reject reserved names; historical records are not rewritten.
- Tenant creation, roles, subscription, administrator membership and audit remain one atomic D1 batch. A failed collision batch is retried only after a database lookup proves that its slug became reserved.
- Additive migration 0006 adds tenant_slug_aliases plus database triggers preventing one company's current/historical slug being claimed by another. Redirect records cannot be updated/deleted. Existing tenant IDs and data remain intact.
- Platform-only slug changes reserve the actual current slug inside the batch, update the tenant, and append audit history. Concurrent renames serialize as last-writer-wins; each prior slug remains reserved. This is not optimistic versioning of company configuration.
- Routes resolve aliases server-side, return no private employee data publicly, and reject inactive or unknown companies. Destination dashboards continue to check permissions from membership and active employee binding.
- Links use the fixed primary hostname, not arbitrary Host, forwarded headers or a browser tenant identifier. Role URLs do not create authority or independent sessions.
- Existing host-only __Host-hrms_session cookies remain unchanged. Cross-registrable-domain login/session isolation and registry-bound tenant locking must be implemented before customer hostnames are attached.

## Scalability and remaining risks

Slug retries are bounded to 100 candidate allocations; heavily colliding names then require an explicit available slug. Database uniqueness is the final authority, not the URL preview. Alias lookup uses primary/unique indexes. Immutable redirects intentionally reserve former names permanently; retention/tenant offboarding needs an explicit future policy.

Existing OFFSET pagination, LIKE search, bounded exports and D1 edge concurrency/load limitations remain documented. Manager scopes are direct-report/current-state, not delegated approval chains. Sensitive salary/bank/tax/document models and permissions remain absent. No private files or payroll data were introduced. General dependency, independent MFA/recovery, CSP nonce, penetration-test and production restore gaps remain open.

## Implementation dependency checklist

1. Completed here: automatic workspace allocation, protected rename aliases, role login links, source/hosting audit and regression tests.
2. Next: domain registry with unique normalized hostnames, DNS challenge lifecycle, approved Cloudflare adapter, provider/TLS status and routing diagnostics; host-resolved tenant locking on SSR, every API and background job. Unknown/unverified/disabled hosts must fail closed. Validate direct and signed-proxy routing before enabling any customer hostname.
3. Configure private R2 quarantine and fail-closed scanner; build versioned documents, offer approval/acceptance and configurable verified onboarding; then idempotent candidate conversion and notifications.
4. Build attendance/shifts/leave using existing employee binding and scoped teams; immutable ledgers and locks precede payroll.
5. Implement effective-dated payroll configuration and reproducible calculations, maker-checker approval, historical snapshots; authoritative Indian statutory and specialist review before disbursement.
6. Add durable outbox/jobs, notifications and remaining modules; complete browser/accessibility/load/security and actual backup restoration acceptance.

## Official Cloudflare references checked

- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/
- https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/

Cloudflare documents Worker fallback origins and custom-hostname ownership/TLS validation. Worker wildcard routes can affect all zone subdomains; the documentation warns that a Worker route bypasses custom_origin_server routing, which must then be handled in Worker code. These facts do not establish entitlement or deployed state in this account. Use provider-returned validation records for each actual registration; do not invent customer DNS instructions or reuse the ERP proxy secret.
