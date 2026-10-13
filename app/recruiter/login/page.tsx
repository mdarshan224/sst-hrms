import { tenantRequest } from "@/lib/hrms/tenant-context";
import CompanyLogin from "@/app/[slug]/[mode]/login/page";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const bound = tenantRequest();
  if (!bound?.tenantId || !bound.slug) notFound();
  return CompanyLogin({
    params: Promise.resolve({ slug: bound.slug, mode: "recruiter" }),
  });
}
