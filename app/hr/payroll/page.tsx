import { tenantRequest } from "@/lib/hrms/tenant-context";
import PayrollPage from "@/app/[slug]/hr/payroll/page";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const bound = tenantRequest();
  if (!bound?.tenantId || !bound.slug) notFound();
  return PayrollPage({ params: Promise.resolve({ slug: bound.slug }) });
}
