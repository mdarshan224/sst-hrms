import { ownEmployee } from "./employee-portal.ts";
import { caseEmployee } from "./onboarding-access.ts";
import type { Context } from "./access.ts";
export async function documentEmployee(
  c: Context,
  tid: string,
  caseId?: string,
  editable = false,
) {
  return caseId ? caseEmployee(c, tid, caseId, editable) : ownEmployee(c, tid);
}
