# Milestone08 implemented checkpoint
This advances the existing project; it is not a complete commercial HRMS.

Source: Milestone07 ZIP SHA256813c4b78894b73177bd2eba10e1f02b839e6589382145c52ce4634661fea5633;220 tracked files byte-matched source6e077b344540230fbf9c316644b435ebede6e5c0. Frozen install,150 baseline tests/type/lint/build independently reproduced.

Implemented and locally tested:
- Versioned personal-field/document/checklist/privacy templates; scoped queue, hashed mobile-bound expiring invitations, rotation/revocation/same-recipient reissue, resumable authenticated claim, AES-GCM drafts/submissions, correction/rejection and independent activation. Staged employee/account binding gated by mandatory PAN/current scanner+HR-approved documents/checklist/accepted offer; atomic D1 batch and DB triggers prevent duplicate activation.
- PAN case/purpose/name-hash/local similarity review aid, transport-uncertain original-request locking, independent audited support reconciliation. HR decision separate from provider result.
- Optional documented DigiLocker PAN hosted consent POST/original-ID GET, encrypted URL, account/mode gates, safe bounded transport; consent_received is not identity verified. No Aadhaar/full-document/OCR/bank integration claim.
- Signed deduplicated minimized webhook inbox: supported matching reference hints queue authoritative inquiries; bounded leased retries/conflicting-final-state/dead-letter handling. Unknown account envelopes remain unsupported.
- Private document versions/current slots, exact-byte download integrity, request-bound scanner jobs/quarantine, independent HR review/replacement and bounded retention purge. Real-clamd gateway source with auth/protocol tests; real service not provisioned.
- Explicit privacy/workflow grants, employee Verification/Documents tabs, joining portal, in-app notifications, platform jobs/inbox visibility.
- Persisted selected-candidate offer text/checker/employee acceptance; interviews/panel feedback; opt-in careers/contact applications. Recruitment remains partial: PDF/e-signature/calendar/messaging, extended applicant history, banking/education tables and scheduled reminders unfinished.
- Custom-host evidence matches current deployment; existing primary routing/ERP untouched. Independent provider retrieval, signatures/DNS/TLS/routing/expiry/realm protections preserved. Managed customer attachment externally blocked.

Database:0010/0011 additive;13 new tables35→48, workflow/privacy fields, case/check/document tenant constraints, outbox/inbox/leases.0000–0009 unchanged. No new migration drops/resets existing tables.

Routes:
Pages /join/[token], /onboarding, /verification/return, /[slug]/careers and custom-host /careers.
APIs /api/workflow (templates/cases/queue/reviews/invitations/tasks/recruitment/publication/hosted consent/notifications/document maintenance), /api/operations (platform metadata/retry and secret runner), /api/careers, /api/verification/hosted.
Existing verification/documents/webhook/domain APIs extended; company/role aliases and sessions preserved.

Final executed checks/logs are in delivered release-evidence.166 JavaScript tests plus3 Python scanner protocol/auth tests; actual fresh SQL/legacy upgrade/integrity/foreign-key checks and synthetic SQLite restoration. Synthetic transport fixtures/approved PAN example, no real employee identity fixtures. Not live Cashfree/malware/browser/production recovery acceptance.

Dependency audit: braces3.0.3 GHSA-vfj7-8cjw-p6xm remains1high advisory in trusted build/lint globs; executed audit lists no patch. Lockfile unchanged, advisory not suppressed. Paths:
eslint-config-next→@next/eslint-plugin-next→fast-glob→micromatch→braces
vinext→vite-plugin-commonjs→vite-plugin-dynamic-import→fast-glob→micromatch→braces
No user request fields become build globs. Temporary mitigation: trusted source/globs, isolated bounded builds/minimal credentials. Not vulnerability resolution/security certification; monitor upstream and review before launch.

Blockers: Cashfree VRS creds/products/RSA/IP/callback schemas, approved scanner deployment/signature freshness, job scheduler, messaging/calendar, managed custom-host account access/association, real OTP/browser/a11y/load/edge QA, D1+R2 restore and legal/privacy review. Absent attendance/leave/payroll/other modules remain disabled.

See MILESTONE08_DEPLOYMENT.md for setup/rollback, MILESTONE08_FILES.md for changed files. Older milestone documents remain historical; this checkpoint supersedes only the scope verified here.

Deployment compatibility: first native publication failed with SQLITE_ERROR incomplete input. New trigger statements were normalized to the existing single-line trigger convention, preserving guards. Retry outcome is recorded in delivered evidence; no database reset was performed.

A second native attempt also returned incomplete input. The deployment-safe SQL now expresses each validation as its own BEFORE...WHEN...SELECT RAISE trigger (the previously deployed convention), eliminating nested CASE/END blocks without removing approval gates. Actual final hosting outcome is recorded separately.
