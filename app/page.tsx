import { tenantRequest } from "@/lib/hrms/tenant-context";
import CompanyPage from "@/app/[slug]/page";
import { authConfig, requireSession } from "@/lib/hrms/server-auth";
import { redirect } from "next/navigation";
import Workspace from "@/components/hrms-workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const bound = tenantRequest();
  if (bound?.tenantId)
    return CompanyPage({ params: Promise.resolve({ slug: bound.slug! }) });
  const params = await searchParams;
  const query =
    params.invite && params.invite.length <= 200
      ? `?invite=${encodeURIComponent(params.invite)}`
      : "";
  const session = await requireSession("/" + query);
  if (session.identity.mobile === authConfig().adminMobile)
    redirect("/super-admin" + query);
  return <Workspace />;
}
