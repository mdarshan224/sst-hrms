import { tenantRequest } from "@/lib/hrms/tenant-context";
import { workspacePath } from "@/lib/hrms/workspace-links";
import { authConfig, currentSession } from "@/lib/hrms/server-auth";
import {
  resolveWorkspaceSlug,
  roleDestination,
  roleLinks,
} from "@/lib/hrms/workspace-links";
import { publicBrand } from "@/lib/hrms/branding";
import { notFound, redirect } from "next/navigation";
import Login from "@/components/hrms-login";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; mode: string }>;
}) {
  const { slug, mode: role } = await params;
  if (!Object.hasOwn(roleLinks, role)) notFound();
  const tenant = await resolveWorkspaceSlug(authConfig().db, slug);
  if (!tenant || tenant.status !== "active") notFound();
  const bound = tenantRequest();
  if (bound?.tenantId && bound.tenantId !== tenant.id) notFound();
  if (bound?.tenantId && bound.publicPath !== `/${role}/login`)
    redirect(`/${role}/login`);
  const next = roleDestination(tenant.slug, role);
  const destination =
    next && bound?.tenantId
      ? workspacePath(
          tenant.slug,
          roleLinks[role as keyof typeof roleLinks].mode ?? "",
          true,
        )
      : next;
  if (!next)
    return (
      <main className="login-form-side">
        <div className="login-form-wrap">
          <h1>Payroll is not available yet</h1>
          <p>
            Payroll processing and statutory validation must be completed before
            this workspace can be enabled.
          </p>
          <a href={`/${tenant.slug}`}>Return to company workspace</a>
        </div>
      </main>
    );
  if (slug !== tenant.slug) redirect(`/${tenant.slug}/${role}/login`);
  // This is a sign-in destination, never a role grant. Destination authorization is server-side.
  if (await currentSession()) redirect(destination!);
  return (
    <Login
      next={destination!}
      brand={await publicBrand(authConfig().db, tenant.slug)}
      roleLabel={roleLinks[role as keyof typeof roleLinks].label}
    />
  );
}
