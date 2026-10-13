# Private scanner gateway
Requires a real ClamAV clamd daemon; INSTREAM scanning never writes documents to disk. Missing, unrecognized or failed engine responses return503; Workers retain quarantine. This is malware inspection, not identity verification/OCR.

Provision a hardened service completely separate from ERP. Install supported ClamAV/freshclam and monitor signature freshness. Run clamd with a restricted Unix socket/resource limits. Run gateway unprivileged behind an approved HTTPS reverse proxy with request/concurrency limits and access restrictions. Do not expose clamd publicly. The gateway binds localhost.

Gateway secrets: SCAN_BEARER_TOKEN, SCAN_HMAC_SECRET(min32characters).
Settings: SCAN_RECEIPT_DB(private metadata-only SQLite), CLAMD_SOCKET, optional PORT=8080.
Worker: DOCUMENT_SCANNER_URL=https://approved-host/scan, DOCUMENT_SCANNER_TOKEN=same bearer, DOCUMENT_SCAN_CALLBACK_SECRET=same HMAC.
No endpoint/engine has been provisioned by this archive.

POST /scan: application/octet-stream <=2MiB. HMAC-SHA256 signs UTF8(timestamp+"\n"+documentUUID+"\n"+requestUUID+"\n"+sha256+"\n")+file bytes. Headers: x-scan-timestamp(milliseconds), x-scan-document, x-scan-request-id, x-scan-digest, x-scan-signature(base64). Bearer auth separate. Five-minute request freshness. Same requestUUID/different document or digest rejected. Metadata receipts retained30days.

Successful JSON contains documentId,requestId,sha256,verdict(clean/infected). Receipt HMAC is timestampText+rawJSON; x-scan-timestamp/x-scan-signature. Worker validates document/request/digest/time/signature/final-state conflicts before quarantine clearance. Never forge receipts to release files.

Run python server.py with configured environment.
Tests: python -m unittest discover -s integrations/scanner -p 'test_*.py'.
Tests cover authentication/digest/replay and synthetic protocol responses, not live detection. Operator acceptance needs an approved harmless antivirus test file on a real engine, clean scan, missing-engine failure and receipt replay/conflict tests. Monitor freshclam and engine readiness; stale signatures block operational rollout.
