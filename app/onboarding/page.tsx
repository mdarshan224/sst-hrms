import { requireSession } from "@/lib/hrms/server-auth";
import OnboardingHome from "@/components/hrms-onboarding-home";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireSession("/onboarding");
  return <OnboardingHome />;
}
