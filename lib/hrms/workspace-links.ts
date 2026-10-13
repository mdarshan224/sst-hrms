import { z } from "zod";
import { AppError } from "./domain.ts";
// Reserve application roots, including modules planned in the supplied requirements.
export const reservedSlugs = new Set([
  "api",
  "app",
  "assets",
  "brand",
  "company",
  "login",
  "logout",
  "join",
  "onboarding",
  "verification",
  "super-admin",
  "admin",
  "hr",
  "payroll",
  "employee",
  "manager",
  "recruiter",
  "careers",
  "jobs",
  "setup",
  "health",
  "favicon",
  "robots",
  "sitemap",
  "_next",
]);
const slugSyntax = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9-]{2,59}$/,
    "Use 3–60 lowercase letters, digits or hyphens, starting with a letter.",
  );
export const workspaceSlug = slugSyntax.refine(
  (v) => !reservedSlugs.has(v),
  "This workspace identifier is reserved.",
);
export function slugFromName(name: string) {
  let base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) base = "company";
  if (!/^[a-z]/.test(base)) base = "company-" + base;
  base = base.slice(0, 60).replace(/-+$/g, "");
  if (base.length < 3 || reservedSlugs.has(base)) base = "company-" + base;
  return base;
}
export function slugCandidate(base: string, attempt: number) {
  const suffix = attempt ? `-${attempt + 1}` : "";
  return base.slice(0, 60 - suffix.length).replace(/-+$/g, "") + suffix;
}
export const roleLinks = {
  admin: { label: "Company administrator", mode: "admin" },
  hr: { label: "HR manager", mode: "hr" },
  manager: { label: "Reporting manager", mode: "manager" },
  recruiter: { label: "Recruiter", mode: "recruiter" },
  employee: { label: "Employee", mode: "employee" },
  payroll: { label: "Payroll and finance", mode: null },
} as const;
export function roleDestination(slug: string, role: string) {
  slugSyntax.parse(slug);
  if (!Object.hasOwn(roleLinks, role))
    throw new AppError(404, "Unknown workspace role.");
  const mode = roleLinks[role as keyof typeof roleLinks].mode;
  return mode ? workspacePath(slug, mode) : null;
}
export function workspaceLinks(slug: string) {
  slugSyntax.parse(slug);
  // Canonical platform hostname is configured in source, never inferred from Host headers.
  const legacy = reservedSlugs.has(slug);
  const base = `https://hrms.sohansoft.in/${legacy ? "company/" : ""}${slug}`;
  return {
    workspace: base,
    roles: Object.entries(roleLinks).map(([role, info]) => ({
      role,
      label: info.label,
      available: info.mode !== null,
      url:
        info.mode === null
          ? null
          : legacy
            ? `https://hrms.sohansoft.in/login?company=${slug}&next=${encodeURIComponent(roleDestination(slug, role)!)}`
            : `${base}/${role}/login`,
    })),
  };
}
export async function resolveWorkspaceSlug(db: D1Database, slug: string) {
  if (!slugSyntax.safeParse(slug).success) return null;
  return db
    .prepare(
      `SELECT id,slug,status FROM tenants WHERE slug=?
    UNION ALL SELECT t.id,t.slug,t.status FROM tenant_slug_aliases a
    JOIN tenants t ON t.id=a.tenant_id WHERE a.slug=? LIMIT 1`,
    )
    .bind(slug, slug)
    .first<{ id: string; slug: string; status: string }>();
}

export function workspacePath(slug: string, mode = "", tenantBound = false) {
  slugSyntax.parse(slug);
  if (mode && !/^[a-z-]+$/.test(mode))
    throw new AppError(422, "Invalid workspace mode.");
  const base = tenantBound
    ? ""
    : `${reservedSlugs.has(slug) ? "/company" : ""}/${slug}`;
  return base + (mode && mode !== "overview" ? `/${mode}` : "") || "/";
}
