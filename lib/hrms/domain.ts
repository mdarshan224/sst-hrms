import { z } from "zod";
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const permissions = [
  "employee.view",
  "employee.create",
  "employee.edit",
  "employee.archive",
  "employee.export",
  "employee.activate",
  "team.view",
  "candidate.view",
  "candidate.create",
  "candidate.transition",
  "job.view",
  "job.create",
  "job.edit",
  "role.manage",
  "company.settings.manage",
  "audit.view",
  "report.view",
] as const;
export const defaultStages = [
  { id: "applied", label: "Applied", next: ["screening", "rejected"] },
  {
    id: "screening",
    label: "Screening",
    next: ["interview", "hold", "rejected"],
  },
  {
    id: "interview",
    label: "Interview",
    next: ["selected", "hold", "rejected"],
  },
  {
    id: "hold",
    label: "On hold",
    next: ["screening", "interview", "rejected"],
  },
  { id: "selected", label: "Selected", next: ["rejected"] },
  { id: "rejected", label: "Rejected", next: [] },
];
export type Stage = (typeof defaultStages)[number];
const name = z.string().trim().min(2).max(160);
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const phone = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.");
export const tenantInput = z.object({
  name,
  slug: z.string().trim().default(""),
  adminEmail: email.or(z.literal("")).default(""),
  adminMobile: phone,
});
export const employeeInput = z.object({
  fullName: name,
  email,
  designation: name,
  departmentId: z.string().uuid().nullable().default(null),
  branchId: z.string().uuid().nullable().default(null),
  joiningDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        Number.isFinite(new Date(v + "T00:00:00Z").getTime()) &&
        new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
      "Invalid date",
    ),
});
export const jobInput = z.object({
  title: name,
  description: z.string().trim().min(20).max(10000),
  location: name,
  status: z.enum(["draft", "open", "closed"]),
  branchId: z.string().uuid().nullable().default(null),
  departmentId: z.string().uuid().nullable().default(null),
});
export const candidateInput = z.object({
  fullName: name,
  email,
  jobId: z.string().uuid(),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/),
  source: z.string().trim().min(2).max(80),
});
export const roleInput = z.object({
  name,
  permissions: z.array(z.enum(permissions)).min(1).max(permissions.length),
  branchId: z.string().uuid().nullable().default(null),
  departmentId: z.string().uuid().nullable().default(null),
});
export const inviteInput = z.object({
  email: email.or(z.literal("")).default(""),
  mobile: phone,
  roleId: z.string().uuid(),
});
export const brandingInput = z.object({
  name,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  employeePrefix: z.string().regex(/^[A-Z0-9]{2,10}$/),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  locale: z
    .string()
    .max(30)
    .refine((v) => {
      try {
        return Intl.getCanonicalLocales(v).length === 1;
      } catch {
        return false;
      }
    }, "Invalid locale")
    .optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  logoData: z.string().max(48000).nullable().optional(),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone"),
});
export function can(grants: string[], permission: string) {
  return grants.includes(permission);
}
export function assertPermission(grants: string[], permission: string) {
  if (!can(grants, permission))
    throw new AppError(403, "You do not have permission for this action.");
}
export function assertTransition(
  stages: Stage[],
  from: string,
  to: string,
  reason: string,
) {
  if (!stages.find((s) => s.id === from)?.next.includes(to))
    throw new AppError(409, "This stage transition is not allowed.");
  if (["rejected", "hold"].includes(to) && reason.trim().length < 3)
    throw new AppError(422, "A reason is required for rejection or hold.");
}
export function assertEntitlement(
  status: string,
  expires: string,
  modules: string[],
  module: string,
  now = new Date(),
) {
  if (
    !["trial", "active"].includes(status) ||
    !Number.isFinite(new Date(expires).getTime()) ||
    new Date(expires) <= now
  )
    throw new AppError(402, "The subscription is inactive or expired.");
  if (!modules.includes(module))
    throw new AppError(403, "This module is not included in your plan.");
}
export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new AppError(403, "Invalid request origin.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "JSON content required.");
}
export function assertInvite(
  email: string,
  inviteEmail: string,
  expiresAt: string,
  usedAt: string | null,
  revokedAt: string | null,
) {
  if (
    email.toLowerCase() !== inviteEmail.toLowerCase() ||
    usedAt ||
    revokedAt ||
    new Date(expiresAt) <= new Date()
  )
    throw new AppError(403, "Invitation is unavailable for this account.");
}

export const dashboardInput = z.object({
  title: z.string().trim().min(3).max(100),
  subtitle: z.string().trim().max(200),
  widgets: z
    .array(z.enum(["metrics", "recruitment", "actions", "people"]))
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length, "Choose each widget once."),
  density: z.enum(["comfortable", "compact"]),
  hero: z.enum(["gradient", "minimal"]),
});

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new AppError(413, "Request is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          throw new AppError(413, "Request is too large.");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(400, "Invalid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new AppError(422, "Invalid request.");
  return data as Record<string, unknown>;
}

export const employeeEditInput = employeeInput.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});
export const listInput = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "active", "archived"]).default("all"),
  sort: z.enum(["name", "code", "joining", "newest"]).default("newest"),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
