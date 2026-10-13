# Milestone 06 rollback warning

See MILESTONE06_DOMAINS.md. Before deploying a pre-domain Worker, disable/detach customer hosts or retain the new trusted host/realm guard. Old code ignores domain realm and tenant pinning. Preserve additive schema/history; do not drop tables or reset session epochs. Production backup/restore remains unverified.

# Milestone 05 additive migration

Migration 0006 adds tenant_slug_aliases, an index/FK and triggers protecting current/historical ownership and redirect immutability. All existing records and migrations are preserved. Alias rows intentionally cannot be updated/deleted by ordinary SQL. A previous Worker remains schema-compatible, but its provisioning code does not know about reserved aliases; retain new code for provisioning after a rollback or disable tenant creation/renaming until a forward fix. Do not drop triggers or recycle old workspace links to recover a failed release.

# Migration and recovery procedure

Migrations 0000–0002 were already deployed. Append-only 0003 adds scoped roles, vacancy assignments, membership revocation and employment history; 0004 adds vacancy versioning and immutable employment-history triggers. Neither migration deletes records or rewrites applied SQL. Drizzle snapshots/journal are included.

Before production migration, verify the configured D1 database and capture a provider-supported backup/export under operator-controlled private storage. Restrict access, record backup timestamp and release version, and verify backup integrity in an isolated restore. Keep secrets and customer exports outside the source archive. Sites applies the included migrations before publishing the matching Worker.

The automated suite upgrades a populated schema from 0002, preserves existing employee rows, and checks PRAGMA integrity_check/foreign_key_check. A separate synthetic test uses SQLite VACUUM INTO, opens the snapshot, verifies employment records/history and immutable-history triggers. These tests do not demonstrate a production Cloudflare D1 restore.

For a failed application deployment after schema migration: inspect native deployment/migration state. The changes are additive; redeploy a compatible previous Worker against the extended schema when appropriate. Do not delete migration metadata, reverse history tables, or run guessed down-migrations. Repair through a new additive migration after inspection. A failed Worker deployment may still have successfully applied its migrations.

For actual data corruption: suspend writes, identify the incident window, retain evidence and arrange an operator-authorized provider restore into an isolated database. Verify counts, foreign keys, audit/history invariants, tenant isolation and authentication before switching traffic. Restoring authentication storage can resurrect sessions; revoke restored sessions and support grants before reopening access. Reconcile writes after the restore point and notify affected parties according to the incident policy.

Open work: production backup scheduling/retention, D1 Time Travel or export tooling under hosting permissions, an actual production restore drill, recovery objectives and incident-response ownership. No production backup/restore tool was invoked in this session.

Milestone 07 adds private BUCKET storage and additive migrations 0008/0009. Back up D1 metadata and quarantine objects together; test the real restoration independently. Rolling code back must retain new schema/object history. See MILESTONE07_DEPLOYMENT.md; no actual production restore was run this session.


## Milestone08 checkpoint
Read MILESTONE08_RELEASE.md and MILESTONE08_DEPLOYMENT.md for current scope, additive0010/0011 migrations, configuration and rollback. Prior reports are historical. Complete HRMS/payroll or commercial production readiness is not claimed.
