import { requireSession, serverContext } from "@/lib/hrms/server-auth";
import { scope } from "@/lib/hrms/access";
import {
  resolveWorkspaceSlug,
  workspacePath,
} from "@/lib/hrms/workspace-links";
import { tenantRequest } from "@/lib/hrms/tenant-context";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    bound = Boolean(tenantRequest()?.tenantId);
  await requireSession(workspacePath(slug, "hr", bound) + "/payroll");
  const c = await serverContext(),
    t = await resolveWorkspaceSlug(c.db, slug);
  if (!t) notFound();
  try {
    await scope(c, t.id, "");
  } catch {
    notFound();
  }
  return (
    <main className="login-form-side">
      <div className="login-form-wrap">
        <h1>Payroll is unavailable</h1>
        <p>
          Salary processing, statutory validation and approval workflows are not
          implemented. No payroll data or payment controls are enabled.
        </p>
      </div>
    </main>
  );
}
