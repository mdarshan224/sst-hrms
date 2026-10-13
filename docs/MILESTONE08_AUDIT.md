# Milestone 08 source audit and implementation checklist

Source ZIP SHA-256: 813c4b78894b73177bd2eba10e1f02b839e6589382145c52ce4634661fea5633. All 220 tracked source files match commit 6e077b344540230fbf9c316544b435ebede6e5c0. Baseline frozen install, 150 tests, typecheck, lint and production build were independently rerun successfully. node_modules is deliberately not distributed in source archives; installation from the committed lockfile is required, not a missing source dependency.

Existing architecture and records are preserved: React 19/TypeScript/Vinext/Workers, D1/Drizzle migrations 0000–0009, 35 tables, Fast2SMS mobile sessions, role scopes, custom-host realms, fixed canonical links and private R2 binding. ERP is excluded from all edits.

Original gaps: linked-active-employee-only verification/documents; no pre-activation forms or approval gate; no case-level consent/check binding; indefinite ambiguous PAN lock; webhook hash-only intake; no document review, replacement/version lineage or object purge; no scanner dispatch/lease/retry; no candidate offer/interview handoff; no /join route. Native hosting attachment remains operator-controlled because account identifiers/credentials are unavailable.

Implementation checklist:
1. Add safe staged employee onboarding with existing hashed/mobile-bound invitations, encrypted configurable submissions, resumable claims, corrections, checklist, explicit HR permissions, transactional and idempotent activation.
2. Extend existing PAN checks into cases, preserve provider-vs-HR decisions, reconcile uncertain requests without repeated POSTs; implement documented hosted DigiLocker consent/status interfaces while account products remain gated.
3. Durable minimized webhook inbox and tenant-bound inquiry jobs; never trust browser callbacks or event success alone.
4. Add document review, replacement lineage, digest verification, correlated scanner jobs, bounded retries and explicit retention cleanup; fail closed without a real scanner.
5. Preserve domain evidence/realm controls, improve renewal diagnostics; no ERP/DNS/fallback mutation.
6. Run regression, migration preservation, authorization, failure/concurrency and build checks; package source and exact evidence.

Provider review: Cashfree PAN Lite is synchronous. The adjacent Get Status documentation is for PAN Bulk, not a documented PAN Lite inquiry. Do not send an uncertain PAN Lite request to that unrelated endpoint. DigiLocker POST /verification/digilocker and GET of the same path by verification_id are documented. AUTHENTICATED means logged-in consent, not independently verified retrieved documents. OCR and BAV require distinct documented contracts/account entitlement and remain unavailable until enabled and validated. Real Cashfree/scan/account acceptance cannot be fabricated by synthetic test fixtures.
