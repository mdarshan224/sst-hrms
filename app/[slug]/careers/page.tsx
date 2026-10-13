import { authConfig } from "@/lib/hrms/server-auth";
import { publicJobs } from "@/lib/hrms/careers";
import { tenantRequest } from "@/lib/hrms/tenant-context";
import Careers from "@/components/hrms-careers";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let listing;
  try {
    listing = await publicJobs(
      authConfig().db,
      slug,
      tenantRequest()?.tenantId,
    );
  } catch {
    notFound();
  }
  return (
    <Careers
      slug={listing.tenant.slug}
      name={String(listing.tenant.name)}
      jobs={
        listing.jobs as {
          id: string;
          title: string;
          description: string;
          location: string;
        }[]
      }
    />
  );
}
