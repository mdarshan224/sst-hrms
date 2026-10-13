import { authConfig, requireSession } from "@/lib/hrms/server-auth";
import { redirect } from "next/navigation";
import Workspace from "@/components/hrms-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await requireSession("/super-admin");
  if (s.identity.mobile !== authConfig().adminMobile) redirect("/");
  return <Workspace initialView="platform" />;
}
