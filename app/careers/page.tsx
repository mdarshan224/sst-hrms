import Page from "@/app/[slug]/careers/page";
import { tenantRequest } from "@/lib/hrms/tenant-context";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default function CustomCareers() {
  const c = tenantRequest();
  if (!c?.tenantId || !c.slug) notFound();
  return Page({ params: Promise.resolve({ slug: c.slug }) });
}
