import { z } from "zod";
import { AppError, assertEntitlement, phone } from "./domain.ts";
import {
  scope,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  organizationPredicate,
  assertOrganizationScope,
} from "./access.ts";
import type { Context } from "./access.ts";
import { resolveWorkspaceSlug } from "./workspace-links.ts";
export async function publicJobs(
  db: D1Database,
  slug: string,
  boundTenantId?: string,
) {
  const t = await resolveWorkspaceSlug(db, slug);
  if (!t || t.status !== "active" || (boundTenantId && boundTenantId !== t.id))
    throw new AppError(404, "Careers page unavailable.");
  const s = await first(
    db,
    "SELECT s.status,s.expires_at,p.modules FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=?",
    t.id,
  );
  if (!s) throw new AppError(404, "Careers page unavailable.");
  assertEntitlement(
    String(s.status),
    String(s.expires_at),
    JSON.parse(String(s.modules)),
    "recruitment",
  );
  return {
    tenant: {
      id: t.id,
      name: (await first(db, "SELECT name FROM tenants WHERE id=?", t.id))
        ?.name,
      slug: t.slug,
    },
    jobs: await all(
      db,
      "SELECT j.id,j.title,j.description,j.location FROM jobs j JOIN job_publications p ON p.job_id=j.id AND p.tenant_id=j.tenant_id WHERE j.tenant_id=? AND j.status='open' AND p.enabled=1 ORDER BY j.created_at DESC LIMIT 100",
      t.id,
    ),
  };
}
export async function publishJob(c: Context, tid: string, input: unknown) {
  const t = await scope(c, tid, "job.edit", "recruitment"),
    d = z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
    j = await first(
      c.db,
      "SELECT j.id,o.branch_id,o.department_id FROM jobs j LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id WHERE j.id=? AND j.tenant_id=?",
      d.id,
      tid,
    );
  if (!j) throw new AppError(404, "Job not found.");
  assertOrganizationScope(t, {
    branchId: j.branch_id as string | null,
    departmentId: j.department_id as string | null,
  });
  await c.db.batch([
    stmt(
      c.db,
      "INSERT INTO job_publications(job_id,tenant_id,enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at",
      d.id,
      tid,
      Number(d.enabled),
      now(),
    ),
    audit(c, tid, d.enabled ? "job.published" : "job.unpublished", d.id),
  ]);
  return { saved: true };
}
export async function publishedJobSettings(c: Context, tid: string) {
  const t = await scope(c, tid, "job.edit", "recruitment"),
    p = organizationPredicate(t, "o");
  return all(
    c.db,
    `SELECT j.id,j.title,j.status,coalesce(p.enabled,0) enabled FROM jobs j LEFT JOIN job_organization o ON o.job_id=j.id AND o.tenant_id=j.tenant_id LEFT JOIN job_publications p ON p.job_id=j.id AND p.tenant_id=j.tenant_id WHERE j.tenant_id=?${p.sql} ORDER BY j.created_at DESC LIMIT 100`,
    tid,
    ...p.args,
  );
}
export async function publicApplication(
  db: D1Database,
  slug: string,
  boundTenantId: string | undefined,
  input: unknown,
) {
  const d = z
      .object({
        jobId: z.string().uuid(),
        name: z.string().trim().min(2).max(160),
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        mobile: phone,
        consent: z.literal(true),
      })
      .strict()
      .parse(input),
    listing = await publicJobs(db, slug, boundTenantId);
  if (!listing.jobs.some((j) => j.id === d.jobId))
    throw new AppError(404, "Published opening unavailable.");
  const cid = id(),
    t = await first(
      db,
      "SELECT stages FROM tenants WHERE id=?",
      listing.tenant.id,
    ),
    stages = JSON.parse(String(t?.stages));
  if (!stages[0]?.id)
    throw new AppError(503, "Recruitment pipeline is not configured.");
  const committed = await db.batch([
    stmt(
      db,
      "INSERT INTO candidates(id,tenant_id,job_id,full_name,email,phone,source,stage,created_at) SELECT ?,?,?,?,?,?,'careers',?,? WHERE EXISTS(SELECT 1 FROM jobs j JOIN job_publications p ON p.job_id=j.id AND p.tenant_id=j.tenant_id WHERE j.id=? AND j.tenant_id=? AND j.status='open' AND p.enabled=1)",
      cid,
      listing.tenant.id,
      d.jobId,
      d.name,
      d.email,
      d.mobile,
      stages[0].id,
      now(),
      d.jobId,
      listing.tenant.id,
    ),
    stmt(
      db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,?,'public-careers','candidate.application_received',?,'{\"consentVersion\":\"careers-v1\"}',? WHERE changes()=1",
      id(),
      listing.tenant.id,
      cid,
      now(),
    ),
  ]);
  if (!committed[0].meta.changes)
    throw new AppError(409, "Opening changed. Reload before applying.");
  return { reference: cid, submitted: true };
}
