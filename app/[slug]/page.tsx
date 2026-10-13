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
import { notFound, redirect } from "next/navigation";
import Workspace from "@/components/hrms-workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    bound = Boolean(tenantRequest()?.tenantId);
  const t = await resolveWorkspaceSlug(authConfig().db, slug);
  if (!t || t.status !== "active") notFound();
  if (tenantRequest()?.tenantId && tenantRequest()!.tenantId !== t.id)
    notFound();
  if (bound && tenantRequest()?.publicPath !== workspacePath(t.slug, "", true))
    redirect(workspacePath(t.slug, "", true));
  if (t.slug !== slug) redirect(workspacePath(t.slug, "", bound));
  await requireSession(workspacePath(t.slug, "", bound));
  try {
    await scope(await serverContext(), t.id, "");
  } catch {
    notFound();
  }
  return <Workspace initialSlug={t.slug} tenantBound={bound} />;
}
