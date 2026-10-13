import { tenantRequest } from "@/lib/hrms/tenant-context";
import CompanyMode from "@/app/[slug]/[mode]/page";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const bound = tenantRequest();
  if (!bound?.tenantId || !bound.slug) notFound();
  return CompanyMode({
    params: Promise.resolve({ slug: bound.slug, mode: "employee" }),
  });
}
