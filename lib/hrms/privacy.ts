import { scope, first } from "./access.ts";
import type { Context } from "./access.ts";
import { AppError } from "./domain.ts";
const columns = {
  view: "can_view",
  review: "can_review",
  documents: "can_view_documents",
  documentReview: "can_review_documents",
  onboarding: "can_manage_onboarding",
  onboardingApproval: "can_approve_onboarding",
} as const;
export async function privacyScope(
  c: Context,
  tid: string,
  flag: keyof typeof columns,
  module = "core",
) {
  const t = await scope(c, tid, "", module),
    r = await first(
      c.db,
      `SELECT g.${columns[flag]} allowed FROM verification_role_grants g JOIN memberships m ON m.tenant_id=g.tenant_id AND m.role_id=g.role_id WHERE m.user_id=? AND g.tenant_id=?`,
      c.identity.userId,
      tid,
    );
  if (!r?.allowed)
    throw new AppError(
      403,
      "An explicit privacy/workflow permission is required.",
    );
  return t;
}
