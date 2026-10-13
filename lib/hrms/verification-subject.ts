import { ownEmployee } from "./employee-portal.ts";
import { caseEmployee } from "./onboarding-access.ts";
import { AppError } from "./domain.ts";
import type { Context } from "./access.ts";
export async function verificationEmployee(
  c: Context,
  tid: string,
  caseId: unknown,
  editable = false,
) {
  if (caseId !== undefined && caseId !== null && caseId !== "") {
    if (typeof caseId !== "string")
      throw new AppError(422, "Invalid onboarding record.");
    return caseEmployee(c, tid, caseId, editable);
  }
  return ownEmployee(c, tid);
}
