# Milestone08 deployment and operator acceptance
Architecture unchanged. Existing .openai/hosting.json binds DB/D1 and BUCKET/privateR2 to the existing HRMS project. ERP/secrets/proxy/routes/DNS entirely excluded. No wildcard route/fallback-origin/account/framework migration.

## Installation and checks
Node>=22.13, existing pnpm11.25 lockfile. Run npm run install:ci (frozen), npm test, npm run typecheck, npm run lint, python -m unittest discover -s integrations/scanner -p 'test_*.py', npm run db:generate (expect no changes), npm run build. Native Sites publication uses existing build/package workflow. Exclude node_modules/runtime directories/credentials/employee databases from source ZIP.

## Additive database upgrade
Back up actual D1 and R2 metadata/objects before rollout. Preserve0000–0009. Apply0010_clammy_stephen_strange.sql then0011_awesome_greymalkin.sql using existing hosting migrations; never reset D1 or mark unapplied SQL complete. Local tests execute actual SQL, legacy upgrade and synthetic SQLite restore; this does not certify production D1 recovery. Existing plans/modules are unchanged. Enable onboarding only for an entitled plan after operator acceptance.

## Secrets and runner
Preserve FAST2SMS_API_KEY/OTP_ID, PLATFORM_ADMIN_MOBILE, PLATFORM_OWNER_EMAIL, independent HRMS_DOMAIN_SYNC_SECRET.
ONBOARDING_DATA_KEY:32random bytes as64lowercase hex, server secret. Missing key blocks private forms. Keep approved recovery copy in operator vault; never regenerate after data exists. Rotation requires controlled decrypt/re-encrypt/key-version transition and restore tests (not automated).
HRMS_DEPLOYMENT_VERSION must equal exact saved deployed version; renew customer-domain evidence against it. Primary host independent.
HRMS_JOB_RUNNER_SECRET: high-entropy server secret authenticating bounded POST /api/operations. Configure approved separate scheduler (e.g.minute); no query-string/log secrets. Scheduler is not claimed provisioned. In-app jobs also process on authenticated notification reads. Platform UI shows blocked/retry/dead-letter metadata with audited fresh-login requeue.

## Cashfree
Configure environment-specific VRS/SecureID (not Payments/Payout) secrets:
CASHFREE_SECUREID_SANDBOX_CLIENT_ID/CLIENT_SECRET/PUBLIC_KEY
CASHFREE_SECUREID_PRODUCTION_CLIENT_ID/CLIENT_SECRET/PUBLIC_KEY
CASHFREE_SECUREID_PRODUCTION_APPROVED only after account/legal/product approval.
Optional CASHFREE_SECUREID_SANDBOX_PRODUCTS/PRODUCTION_PRODUCTS comma-separated digilocker after validated entitlement.
CASHFREE_DIGILOCKER_PRODUCTION_HOSTNAME must be actual documented/account-verified provider host.
Credentials never returned; UI shows masked identifiers/readiness. Confirm registered Cashfree RSA authentication and/or approved static egress requirements for every enabled product. Workers are not fixed egress; no proxy was invented/deployed.

PAN Lite uses documented POST /verification/pan-lite. HTTP200 is not proof. Adjacent Get Status docs describe PAN Bulk, not a documented PAN Lite inquiry. Unknown outcomes stay unresolved without repeating POST. Independent HR records provider support evidence; explicit confirmed not-processed/not-charged cancellation allows a new request, never verified status.

DigiLocker uses documented POST/GET /verification/digilocker, PAN-only hosted consent. AUTHENTICATED→consent_received, not verified identity. Full Aadhaar/DigiLocker document retrieval, OCR and bank verification disabled. No Aadhaar OTP/password/full identifiers or government document bodies collected.

Webhook POST /api/verification/webhook?mode=sandbox (or production): HMAC(timestamp header text+rawbody), base64, that environment VRS client secret; x-webhook-timestamp/x-webhook-signature; freshness window. Body hash deduplication/minimized metadata only. Recognized top-level matching DigiLocker verification_id/reference_id hints queue authoritative original-ID GET; browser/event success ignored. Unsupported envelopes visible, not applied. Validate account-specific webhook event envelopes/products with Cashfree before calling this complete webhook integration. PAN Lite synchronous results are not overwritten by unconfirmed asynchronous events.

Register callback/return on actual account, confirm RSA/IP/permissions, approved sandbox fixtures, business rejection/cancellation, replay/signatures/status inquiries before production. Local transport tests are synthetic; no live Cashfree sandbox/production call performed.

## Documents and onboarding
BUCKET private, no publicR2 domain. Authorized server streaming (not permanent public URLs). PDF/PNG/JPEG<=2MiB, allowed categories; no Aadhaar/identity image category. Quarantine stays until exact-byte/request signed scan clears. See integrations/scanner/README.md. DOCUMENT_SCANNER_URL/TOKEN/SCAN_CALLBACK_SECRET require real approved gateway. Scan clearance, HR document approval and identity verification remain distinct.

Employee Verification settings have explicit masked-result, result-review, document-read/review, onboarding-management/approval grants. Branch/department/module/employee.activate permission still applies. No self-review. Basic recruitment role alone cannot view private offer terms; explicit onboarding privacy grant required.

Configure versioned template, explicit HR grants and entitled plan. Generate/copy mobile-bound invitation; deliveryStatus remains not_sent (no automated email/SMS/WhatsApp sender). Employee logs in through existing Fast2SMS, consents/encrypted form, completes requirements and receives independent review/correction. Candidate requires selected stage, checker-approved offer and employee acceptance. Offers are persisted text, not PDF/e-signature/legal validation. Interviews persisted, external calendar not_configured.

Retention: checks configurable; private objects default90days with bounded audit purge; closed encrypted submissions older90days may be purged from maintenance/API, metadata/history preserved. Operational defaults require legal/privacy review. No automatic purge scheduler/key-erasure certification.

## Domains and rollback
Native hosting reported hrms.sohansoft.in attachment/TLS active. Existing primary canonical builder/host-only cookies preserved.
Customer domains: register→TXT→authenticated hosting sync→TLS/direct routing proof→activate;24-hour expiry requires renewal. Fresh signature is not evidence freshness. Actual Cloudflare read token/zone/custom-hostname UUID/custom_metadata support unavailable; native IDs are not Cloudflare IDs. Keep unverified hosts blocked. No ERP/fallback/DNS changes.
Reattest hostname/project/tenant/current deployment through approved workflow. Disable/remove changes realm epochs and blocks existing custom-host sessions. Unknown hosts/forwarded identity headers cannot grant tenant access; never widen cookies.

Rollback to previous saved HRMS version preserving additive database/new records. Set deployment-version config to previous exact saved version and reattest customer domains. Do not drop tables to downgrade. Retain encryption/scanner keys for restoration; disable modules instead of database resets.
Before commercial launch: real OTP/browser session journeys, browser E2E/a11y/responsive QA, load/edge concurrency, live Cashfree/scanner, real D1+R2 backup restore and independent security/privacy review. Attendance/leave/payroll/disbursement/performance/expenses/assets/helpdesk remain disabled/unimplemented.
