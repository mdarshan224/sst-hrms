import { z } from "zod";
import {
  scope,
  first,
  all,
  stmt,
  audit,
  id,
  now,
  scopedCandidate,
  organizationPredicate,
} from "./access.ts";
import type { Context } from "./access.ts";
import { AppError } from "./domain.ts";
import { privacyScope } from "./privacy.ts";
import { guardedAudit } from "./outbox.ts";
export async function recruitmentRead(c: Context, tid: string) {
  const t = await scope(c, tid, "candidate.view", "recruitment"),
    p = organizationPredicate(t, "o");
  return {
    offers: (await first(
      c.db,
      "SELECT role_id FROM verification_role_grants WHERE tenant_id=? AND role_id IN (SELECT role_id FROM memberships WHERE tenant_id=? AND user_id=?) AND (can_manage_onboarding=1 OR can_approve_onboarding=1)",
      tid,
      tid,
      c.identity.userId,
    ))
      ? await all(
          c.db,
          `SELECT f.*,c.full_name FROM recruitment_offers f JOIN candidates c ON c.id=f.candidate_id AND c.tenant_id=f.tenant_id LEFT JOIN job_organization o ON o.job_id=c.job_id AND o.tenant_id=c.tenant_id WHERE f.tenant_id=?${p.sql} ORDER BY f.created_at DESC LIMIT 100`,
          tid,
          ...p.args,
        )
      : [],
    interviews: await all(
      c.db,
      `SELECT i.*,c.full_name FROM recruitment_interviews i JOIN candidates c ON c.id=i.candidate_id AND c.tenant_id=i.tenant_id LEFT JOIN job_organization o ON o.job_id=c.job_id AND o.tenant_id=c.tenant_id WHERE i.tenant_id=?${p.sql} ORDER BY i.scheduled_at DESC LIMIT 100`,
      tid,
      ...p.args,
    ),
  };
}
export async function recruitmentAction(
  c: Context,
  tid: string,
  action: string,
  input: unknown,
) {
  const t = await scope(c, tid, "candidate.transition", "recruitment");
  if (action === "offer.create") {
    await privacyScope(c, tid, "onboarding", "onboarding");
    const d = z
        .object({
          candidateId: z.string().uuid(),
          terms: z.string().trim().min(50).max(10000),
          joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          expiresAt: z.string().datetime(),
        })
        .parse(input),
      candidate = await scopedCandidate(c, tid, t, d.candidateId);
    if (candidate.stage !== "selected" || Date.parse(d.expiresAt) <= Date.now())
      throw new AppError(
        422,
        "Selected candidate and future expiry are required.",
      );
    if (
      !Number.isFinite(Date.parse(d.joiningDate)) ||
      new Date(d.joiningDate).toISOString().slice(0, 10) !== d.joiningDate
    )
      throw new AppError(422, "Joining date is invalid.");
    const fid = id();
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO recruitment_offers(id,tenant_id,candidate_id,terms,joining_date,expires_at,maker_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
        fid,
        tid,
        d.candidateId,
        d.terms,
        d.joiningDate,
        d.expiresAt,
        c.identity.userId,
        now(),
      ),
      audit(c, tid, "offer.drafted", fid),
    ]);
    return { id: fid };
  }
  if (action === "offer.approve") {
    await privacyScope(c, tid, "onboardingApproval", "onboarding");
    const d = z
        .object({ id: z.string().uuid(), version: z.number().int().min(1) })
        .parse(input),
      r = await first(
        c.db,
        "SELECT * FROM recruitment_offers WHERE tenant_id=? AND id=?",
        tid,
        d.id,
      );
    if (!r) throw new AppError(404, "Offer not found.");
    await scopedCandidate(c, tid, t, String(r.candidate_id));
    if (r.maker_id === c.identity.userId)
      throw new AppError(
        403,
        "The offer maker cannot approve their own offer.",
      );
    const result = await c.db.batch([
      stmt(
        c.db,
        "UPDATE recruitment_offers SET status='approved',checker_id=?,approved_at=?,version=version+1 WHERE id=? AND tenant_id=? AND status='draft' AND version=? AND expires_at>?",
        c.identity.userId,
        now(),
        d.id,
        tid,
        d.version,
        now(),
      ),
      guardedAudit(
        c.db,
        tid,
        c.identity.userId,
        "offer.approved",
        d.id,
        "changes()=1",
      ),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "Offer changed or expired.");
    return { approved: true };
  }
  if (action === "interview.schedule") {
    const d = z
      .object({
        candidateId: z.string().uuid(),
        scheduledAt: z.string().datetime(),
        durationMinutes: z.number().int().min(15).max(240),
        panel: z
          .array(z.string().uuid())
          .min(1)
          .max(10)
          .refine((v) => new Set(v).size === v.length),
      })
      .parse(input);
    await scopedCandidate(c, tid, t, d.candidateId);
    if (Date.parse(d.scheduledAt) <= Date.now())
      throw new AppError(422, "Schedule a future interview.");
    for (const uid of d.panel)
      if (
        !(await first(
          c.db,
          "SELECT m.id FROM memberships m WHERE tenant_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM membership_revocations rv WHERE rv.membership_id=m.id AND rv.restored_at IS NULL)",
          tid,
          uid,
        ))
      )
        throw new AppError(
          422,
          "Interviewers must have active memberships in this company.",
        );
    const iid = id();
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO recruitment_interviews(id,tenant_id,candidate_id,scheduled_at,duration_minutes,panel,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
        iid,
        tid,
        d.candidateId,
        d.scheduledAt,
        d.durationMinutes,
        JSON.stringify(d.panel),
        c.identity.userId,
        now(),
      ),
      audit(c, tid, "interview.scheduled", iid),
    ]);
    return { id: iid, calendarDelivery: "not_configured" };
  }
  throw new AppError(404, "Recruitment action not found.");
}
export async function submitInterviewFeedback(
  c: Context,
  tid: string,
  input: unknown,
) {
  await scope(c, tid, "", "recruitment");
  const d = z
      .object({
        id: z.string().uuid(),
        score: z.number().int().min(1).max(5),
        decision: z.enum(["proceed", "reject", "hold"]),
        notes: z.string().trim().min(10).max(2000),
      })
      .parse(input),
    r = await first(
      c.db,
      "SELECT * FROM recruitment_interviews WHERE id=? AND tenant_id=?",
      d.id,
      tid,
    );
  if (!r || !JSON.parse(String(r.panel)).includes(c.identity.userId))
    throw new AppError(404, "Assigned interview not found.");
  await c.db.batch([
    stmt(
      c.db,
      "INSERT INTO interview_feedback(id,tenant_id,interview_id,user_id,score,decision,notes,created_at) VALUES(?,?,?,?,?,?,?,?)",
      id(),
      tid,
      d.id,
      c.identity.userId,
      d.score,
      d.decision,
      d.notes,
      now(),
    ),
    audit(c, tid, "interview.feedback_submitted", d.id),
  ]);
  return { submitted: true };
}
