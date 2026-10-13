import Link from "next/link";
import { requireSession } from "@/lib/hrms/server-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireSession("/verification/return");
  return (
    <main className="workflow-public">
      <h1>Continue your verification</h1>
      <p>
        A provider redirect does not confirm identity verification. Return to
        your authenticated workspace and request a status inquiry for the
        original consent flow.
      </p>
      <Link href="/onboarding">My onboarding</Link> ·{" "}
      <Link href="/">Workspace</Link>
    </main>
  );
}
