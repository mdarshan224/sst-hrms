import { stmt, id, now } from "./access.ts";
export function outbox(
  db: D1Database,
  tid: string,
  kind: string,
  resource: string,
  key: string,
  condition = "1",
  args: unknown[] = [],
) {
  return stmt(
    db,
    `INSERT OR IGNORE INTO workflow_jobs(id,tenant_id,kind,resource_id,dedupe_key,available_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${condition}`,
    id(),
    tid,
    kind,
    resource,
    key,
    now(),
    now(),
    now(),
    ...args,
  );
}
export function guardedAudit(
  db: D1Database,
  tid: string,
  actor: string,
  action: string,
  resource: string,
  condition: string,
  args: unknown[] = [],
  details: unknown = {},
) {
  return stmt(
    db,
    `INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,?,?,?,?,? WHERE ${condition}`,
    id(),
    tid,
    actor,
    action,
    resource,
    JSON.stringify(details),
    now(),
    ...args,
  );
}
