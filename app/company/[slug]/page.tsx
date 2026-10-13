import Page from "@/app/[slug]/page";
import {
  reservedSlugs,
  resolveWorkspaceSlug,
  workspacePath,
} from "@/lib/hrms/workspace-links";
import { authConfig } from "@/lib/hrms/server-auth";
import { redirect, notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Legacy(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params,
    t = await resolveWorkspaceSlug(authConfig().db, slug);
  if (!t) notFound();
  if (!reservedSlugs.has(t.slug)) redirect(workspacePath(t.slug));
  return Page(props);
}
