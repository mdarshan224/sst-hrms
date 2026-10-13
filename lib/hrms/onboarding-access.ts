import { z } from "zod";
import { scope, first, scopedEmployee, now } from "./access.ts";
import type { Context } from "./access.ts";
import { AppError } from "./domain.ts";
export async function ownedCase(
  c: Context,
  tid: string,
  caseId: string,
  editable = false,
) {
  await scope(c, tid, "", "onboarding");
  const row = await first(
    c.db,
    "SELECT o.*,i.expires_at,i.revoked_at,e.full_name,e.email,e.status employee_status FROM onboarding_cases o JOIN invitations i ON i.id=o.invitation_id AND i.tenant_id=o.tenant_id JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id WHERE o.tenant_id=? AND o.id=? AND o.user_id=?",
    tid,
    z.string().uuid().parse(caseId),
    c.identity.userId,
  );
  if (!row) throw new AppError(404, "Onboarding record not found.");
  if (
    ["revoked", "rejected"].includes(String(row.status)) ||
    row.revoked_at ||
    (row.status !== "approved" && String(row.expires_at) <= now())
  )
    throw new AppError(
      410,
      "The onboarding invitation has expired or was closed. Contact HR.",
    );
  if (
    row.status === "approved" &&
    !(await first(
      c.db,
      "SELECT employee_id FROM employee_accounts WHERE tenant_id=? AND employee_id=? AND user_id=? AND revoked_at IS NULL",
      tid,
      row.employee_id,
      c.identity.userId,
    ))
  )
    throw new AppError(404, "Onboarding record not found.");
  if (row.status !== "approved" && row.employee_status !== "onboarding")
    throw new AppError(409, "Employee onboarding is unavailable.");
  if (
    editable &&
    !["in_progress", "correction_required"].includes(String(row.status))
  )
    throw new AppError(409, "This submission is locked for HR review.");
  return row;
}
export async function caseEmployee(
  c: Context,
  tid: string,
  caseId: string,
  editable = false,
) {
  const row = await ownedCase(c, tid, caseId, editable),
    e = await first(
      c.db,
      "SELECT * FROM employees WHERE tenant_id=? AND id=?",
      tid,
      row.employee_id,
    );
  if (!e) throw new AppError(404, "Employee not found.");
  return e;
}
export async function adminCase(
  c: Context,
  tid: string,
  caseId: string,
  t: Record<string, unknown>,
) {
  const row = await first(
    c.db,
    "SELECT * FROM onboarding_cases WHERE tenant_id=? AND id=?",
    tid,
    z.string().uuid().parse(caseId),
  );
  if (!row) throw new AppError(404, "Onboarding record not found.");
  await scopedEmployee(c, tid, t, String(row.employee_id));
  return row;
}
