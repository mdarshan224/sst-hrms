import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page panel section-card">
      <span className="eyebrow">Sohan Soft Tech HRMS</span>
      <h1>Page not found</h1>
      <p>
        This address is unavailable. Check your company’s workspace link or
        return to your workspace.
      </p>
      <Link className="primary" href="/">
        Return to workspace
      </Link>
    </main>
  );
}
