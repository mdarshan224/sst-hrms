import Link from "next/link";
import { requireSession, serverContext } from "@/lib/hrms/server-auth";
import { claimOnboarding } from "@/lib/hrms/onboarding";
import OnboardingPortal from "@/components/hrms-onboarding-portal";
import { AppError } from "@/lib/hrms/domain";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token))
    return (
      <main className="workflow-public">
        <h1>Invitation unavailable</h1>
        <p>Request a current onboarding link from HR.</p>
      </main>
    );
  await requireSession("/join/" + token);
  const c = await serverContext();
  let result: Awaited<ReturnType<typeof claimOnboarding>> | null = null,
    message = "";
  try {
    result = await claimOnboarding(c, token);
  } catch (error) {
    message =
      error instanceof AppError
        ? error.message
        : "Contact HR for a current invitation.";
  }
  if (result)
    return (
      <OnboardingPortal
        tenant={String(result.id)}
        caseId={String(result.caseId)}
      />
    );
  return (
    <main className="workflow-public">
      <h1>Invitation unavailable</h1>
      <p>{message}</p>
      <Link href="/">Return to workspace</Link>
    </main>
  );
}
