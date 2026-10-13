# Milestone 07 configuration, rollout and rollback

This is a coherent domain/PAN Lite/private-quarantine foundation release, not a complete commercially validated HRMS. Do not enable payroll. No ERP infrastructure change is required or permitted by this rollout.

## Source/runtime deployment

1. Frozen install: `npm run install:ci`. Run `npm test`, `npm run typecheck`, `npm run lint`, production Sites build. `npm run db:generate` must report no schema differences after committing generated SQL/metadata.
2. Append-only migrations: 0008_brown_argent.sql adds five Secure ID tables and nullable provider_deployment_version; 0009_illegal_famine.sql adds private_employee_documents and a default-denied document privacy grant. Existing tables/aliases/session realms are preserved; no destructive backfill. Read generated SQL before deployment.
3. Hosting manifest retains DB and the exact HRMS project ID; R2 binding BUCKET is newly requested through the supported managed hosting workflow. Access is server-side only. Never enable public R2 access or custom/public document buckets. Verify actual bucket policy independently before sensitive production uploads.
4. Save/publish the exact pushed source and built archive to the existing HRMS Site. Managed hosting applies migrations before Worker publication. Record the actual saved version and deployment outcome; do not fabricate successful migration application.
5. Set HRMS_DEPLOYMENT_VERSION to the exact saved deployment version identifier before deploying that version. It is not a secret. Generate HRMS_DOMAIN_SYNC_SECRET independently (at least 32 random bytes) in the approved secret workflow. Never reuse DOMAIN_PROXY_SECRET. The script's operator copy must be securely provisioned/rotated separately, not downloaded from a browser.
6. Keep Cashfree disabled and private files quarantined by default. Assign a plan including employee_verification/private_documents explicitly using existing plan/subscription UI. Existing plans are unchanged. All reads/writes enforce entitlements server-side.

## Domain evidence and attachment — externally blocked

The primary HRMS and ERP native attachments remain separate. Native Sites IDs (appgdom_...) are NOT Cloudflare Custom Hostname UUIDs. The application does not invent a native hosting REST endpoint or export timestamp. Native account-level Custom Hostnames access and compatible custom metadata have not been established. There is no automatic hostname attach operation in this release.

The optional read-only adapter uses the official Cloudflare GET /client/v4/zones/{zone_id}/custom_hostnames/{id}, Bearer scoped read token, timeout, redirect rejection and bounded response. Enable only after the actual managed hosting operator approves direct authenticated access and exact association to the existing origin. Required secrets/config:

- HRMS_DOMAIN_CF_READ_TOKEN (read-only; no DNS/Workers mutations)
- HRMS_DOMAIN_CF_ZONE_ID (actual zone)
- HRMS_DEPLOYMENT_VERSION (actual current saved deployment version)
- HRMS_DOMAIN_SYNC_SECRET (independent signing key)

Authenticated provider custom_metadata must contain exact hrms_project_id, hrms_tenant_id and hrms_deployment_version. If this architecture/account cannot expose these fields, keep sync/activation blocked; implement a supported authenticated native bridge after its API/account contract is available. Do not substitute an offline export, change a fallback origin, add a wildcard route, create another proxy or migrate the host architecture to bypass this block.

`scripts/attest-managed-domain.mjs` takes hostname=..., domainId=..., version=... and providerDomainId=ACTUAL_CF_UUID. It signs a selection envelope only. The server ignores its claimed TLS/hosting status and independently retrieves current data. Newly generated envelope time is not evidence freshness. IDs, project/tenant/deployment mismatch, stale responses and old registry versions fail closed. DNS TXT/CNAME and direct HTTPS proof remain separate activation gates. Each active lease expires after 24 hours; renew through fresh TXT check, authenticated sync and activation before expiry. Rotation/disable invalidates custom-domain session epochs. Host-only cookies and canonical URL construction remain intact.

## Cashfree Secure ID PAN Lite

Official references:
- https://www.cashfree.com/docs/secure-id/introduction
- https://www.cashfree.com/docs/api-reference/vrs/v2/pan/pan-lite
- https://www.cashfree.com/docs/api-reference/vrs/getting-started
- https://www.cashfree.com/docs/api-reference/vrs/data-to-test-integration
- https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification

Server-only, environment-separated VRS credentials:
CASHFREE_SECUREID_SANDBOX_CLIENT_ID / CLIENT_SECRET / PUBLIC_KEY;
CASHFREE_SECUREID_PRODUCTION_CLIENT_ID / CLIENT_SECRET / PUBLIC_KEY
(each suffix is appended to its complete prefix).
CASHFREE_SECUREID_PRODUCTION_APPROVED must remain unset until qualified operator review validates the actual account, PAN Lite entitlement, registered public-key authentication, privacy/consent and permitted production use. Production also requires a PEM SPKI RSA key. No implicit environment fallback and no fixed Worker egress IP assumption.

PAN Lite POST: sandbox.cashfree.com/verification/pan-lite or api.cashfree.com/verification/pan-lite; x-client-id, x-client-secret, optional registered RSA-OAEP/SHA1 x-cf-signature. No undocumented x-api-version header. Approved sandbox test inputs are ABCPV1234D, John Doe, 1993-06-30. The UI sandbox test sends only those documented test inputs, requires recent OTP and records a success only when the actual provider result matches.

A successful HTTP response is insufficient. VALID/E plus provider name/DOB matches and normalized registered employee-name equality are required. Other results are failed or manual review. Only masked PAN, provider reference, minimal match flags/status, consent version/time, policy version, reviewer and retention deadline are stored. Full PAN/DOB/provider payload are not stored or logged. An uncertain operation remains needs_reconciliation and cannot be blindly retried. An independent authenticated reconciliation operation is the next implementation dependency; do not manually manufacture a verified result.

Super Admin integration settings store flags/mode only, never credential values. The company owner must explicitly grant result viewing, independent review and/or private-document downloading to a role after recent OTP. Broad Company Owner/HR/platform support presets do not imply these new sensitive grants. Organization scopes remain enforced. PAN checks currently require an already-linked active employee; configurable invitation-driven pre-activation onboarding is not implemented here.

/api/verification/webhooks/sandbox and /production verify timestamp + exact raw body HMAC-SHA256/base64 using the selected VRS client secret, then store a deduplicated body hash. Local replay acceptance is ten minutes and must be validated with the provider's actual delivery/retry policy before use. These are authenticated intake foundations ONLY: applied=false. No PAN Lite asynchronous event schema was assumed; signed unknown callbacks never mark a check verified. Do not register unrelated Payments/Payout webhooks or claim this intake processes DigiLocker callbacks. Aadhaar, DigiLocker, OCR and bank verification remain unavailable, and no monetary transfer is initiated.

## Private documents and approved scanning

Employee portal supports private resume, education, signed-offer and employment document uploads: PDF/PNG/JPEG, 2 MiB maximum, matching extension/MIME/signature. Random nonpersonal object keys, request idempotency, digest, retention deadline and quarantined metadata are stored. There are no public download URLs. Scanner-cleared downloads stream server-side after tenant/membership/own-record or explicit scoped document-grant authorization, with no-store/attachment/nosniff. Aadhaar/identity-image categories are unavailable. File-header checks do not establish content safety, authenticity or identity.

Deploy an independently approved scanner with least-privilege read access to this private bucket, file-content validation and actual malware detection. No scanner is configured by this release. It must read uploaded quarantine metadata, scan the exact object digest and call /api/documents/scan with JSON {documentId,sha256,verdict:"clean"|"infected"}. Sign exact timestamp + raw JSON bytes with HMAC-SHA256/base64 using independent DOCUMENT_SCAN_CALLBACK_SECRET (minimum 32 characters), headers x-scan-timestamp/x-scan-signature. This is this application's internal protocol, not a Cashfree service. Receipt must match stored digest; only one final verdict, replay idempotency and audit are enforced. Missing scanner, invalid/stale receipt and uncertain/infected files remain nondownloadable. Do not fake a clean callback for real uploads.

The employee can explicitly delete their current documents; deletes are audited. Result reads expire at configured retention deadlines; documents default to 90 days. Automatic purge/object reconciliation, configurable document retention, HR document review/correction/replacement history and long-term legally reviewed retention are still pending. Do not claim automatic deletion or legal retention compliance.

## Acceptance and rollback

Synthetic migration/authorization tests run actual generated migrations on SQLite with foreign_keys enabled and integrity checks. They are not a restoration of production D1/R2. Live OTP, actual Cashfree sandbox/production, malware engine, real customer hostname, browser/accessibility/load tests, R2 exposure and backup/restore still require operator validation. The one high braces tooling advisory remains unresolved, not suppressed.

Before release: record previous live version, take an approved D1 backup and private-object inventory, verify a staging restore with synthetic data, then approve commercial rollout separately. This checkpoint's publication is not commercial acceptance. On failure, redeploy the previous saved version without deleting new tables/columns; old code ignores additive schema. Runtime environment revisions must be reconciled when rolling back. Do not DROP tables or rewrite migration history. If private objects were uploaded, preserve quarantine and audit until a retention/recovery decision. Disable integration/company settings before retiring any provider credential. Keep HRMS and ERP independently recoverable.
