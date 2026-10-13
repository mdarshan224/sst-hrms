"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-page panel section-card">
      <span className="eyebrow">Sohan Soft Tech HRMS</span>
      <h1>This page could not load</h1>
      <p role="alert">
        Your request could not be completed. Retry, or return to your workspace.
        Submitted operations may already have been recorded; check their status
        before submitting again.
      </p>
      <div className="form-actions">
        <button className="primary" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="secondary" href="/">
          Return to workspace
        </Link>
      </div>
    </main>
  );
}
