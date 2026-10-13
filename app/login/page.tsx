import { tenantRequest } from "@/lib/hrms/tenant-context";
import { workspacePath } from "@/lib/hrms/workspace-links";
import { publicBrand } from "@/lib/hrms/branding";
import { safeReturnTo } from "@/lib/hrms/auth";
import { currentSession, authConfig } from "@/lib/hrms/server-auth";
import { redirect } from "next/navigation";
import Login from "@/components/hrms-login";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; company?: string; reauth?: string }>;
}) {
  const params = await searchParams;
  const context = tenantRequest();
  const next = safeReturnTo(
    params.next ??
      (context?.tenantId
        ? "/"
        : params.company
          ? workspacePath(params.company)
          : "/"),
  );
  if (
    context?.tenantId &&
    next !== "/" &&
    !/^\/(admin|hr|manager|employee|recruiter|workspace|onboarding|join|verification)(?:[/?]|$)/.test(
      next,
    )
  )
    redirect("/login");
  if (params.reauth !== "1" && (await currentSession())) redirect(next);
  const slug =
    context?.slug ??
    params.company ??
    /^(?:\/company)?\/([a-z0-9-]+)(?:\/[a-z]+)?$/.exec(next)?.[1];
  const brand = slug ? await publicBrand(authConfig().db, slug) : null;
  return <Login next={next} brand={brand} />;
}
