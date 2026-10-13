import {
  authConfig,
  requireSession,
  serverContext,
} from "@/lib/hrms/server-auth";
import {
  resolveWorkspaceSlug,
  workspacePath,
} from "@/lib/hrms/workspace-links";
import { tenantRequest } from "@/lib/hrms/tenant-context";
import { scope } from "@/lib/hrms/access";
import { dashboardModes } from "@/lib/hrms/employee-portal";
import { notFound, redirect } from "next/navigation";
import Workspace from "@/components/hrms-workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; mode: string }>;
}) {
  const { slug, mode } = await params,
    bound = Boolean(tenantRequest()?.tenantId),
    t = await resolveWorkspaceSlug(authConfig().db, slug);
  if (!t || t.status !== "active") notFound();
  if (tenantRequest()?.tenantId && tenantRequest()!.tenantId !== t.id)
    notFound();
  if (
    bound &&
    tenantRequest()?.publicPath !== workspacePath(t.slug, mode, true)
  )
    redirect(workspacePath(t.slug, mode, true));
  if (t.slug !== slug) redirect(workspacePath(t.slug, mode, bound));
  await requireSession(workspacePath(t.slug, mode, bound));
  const c = await serverContext();
  try {
    const authorized = await scope(c, t.id, "");
    if (!(await dashboardModes(c, t.id, authorized)).includes(mode)) notFound();
  } catch {
    notFound();
  }
  return (
    <Workspace initialSlug={t.slug} initialMode={mode} tenantBound={bound} />
  );
}
