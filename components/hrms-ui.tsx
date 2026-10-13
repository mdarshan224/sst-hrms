import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </header>
  );
}

export function StatusItem({
  label,
  status,
  tone = "neutral",
  children,
}: {
  label: string;
  status: string;
  tone?: "neutral" | "ready" | "warning" | "error";
  children?: ReactNode;
}) {
  return (
    <div className="status-item">
      <h3>{label}</h3>
      <span className={`status-badge ${tone}`}>{status}</span>
      {children && <p>{children}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>
        <strong>{title}</strong>
      </p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Feedback({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
