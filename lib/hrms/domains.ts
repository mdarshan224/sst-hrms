import { workspacePath } from "./workspace-links.ts";
import { z } from "zod";
import { AppError, assertEntitlement } from "./domain.ts";
import {
  platform,
  requireFreshSession,
  audit,
  now,
  id,
  first,
  all,
  stmt,
} from "./access.ts";
import type { Context } from "./access.ts";
export const PLATFORM_HOSTS = [
  "hrms.sohansoft.in",
  "sohansoft-hrms.info756362.chatgpt.site",
];
export const HRMS_PROJECT_ID = "appgprj_6acc998779048191a144f8c871a17577";
export const MANAGED_CNAME = "custom-domains.chatgpt.site";
export type DomainConfig = {
  syncSecret?: string;
  fetcher?: typeof fetch;
  deploymentVersion?: string;
  retrieveProvider?: (
    id: string,
    host: string,
    tenant: string,
  ) => Promise<{
    status: string;
    providerStatus: string;
    sslStatus: string;
    providerDomainId: string;
    checkedAt: string;
    deploymentVersion: string;
  }>;
};
export function hostname(value: string) {
  const host = value.toLowerCase().replace(/\.$/, "");
  if (
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(
      host,
    )
  )
    throw new AppError(
      422,
      "Enter a DNS hostname without scheme, port, path or credentials.",
    );
  if (
    ["local", "localhost", "internal", "invalid", "test", "example"].some(
      (t) => host === t || host.endsWith("." + t),
    )
  )
    throw new AppError(422, "A public DNS hostname is required.");
  return host;
}
export function customerHostname(value: string) {
  const host = hostname(value);
  if (host.length > 237)
    throw new AppError(
      422,
      "Hostname is too long for the ownership TXT record.",
    );
  if (
    PLATFORM_HOSTS.includes(host) ||
    host === "sohansoft.in" ||
    host.endsWith(".sohansoft.in") ||
    host.endsWith(".chatgpt.site")
  )
    throw new AppError(
      422,
      "Platform and ERP hostnames cannot be registered as customer domains.",
    );
  return host;
}
const future = (value: unknown) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) > Date.now();
const fresh = (value: unknown, ms: number) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= Date.now() + 30000 &&
  Date.parse(value) > Date.now() - ms;
function secret(config: DomainConfig) {
  if (!config.syncSecret || config.syncSecret.length < 32)
    throw new AppError(
      503,
      "Managed-hosting sync is not configured. An operator must configure the independent HRMS_DOMAIN_SYNC_SECRET and attach this hostname to the HRMS Site.",
    );
  return config.syncSecret;
}
export async function domainMac(keyValue: string, text: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function validMac(keyValue: string, text: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature.match(/../g)!, (h) => parseInt(h, 16)),
    new TextEncoder().encode(text),
  );
}
export async function listDomains(c: Context, config: DomainConfig) {
  platform(c);
  return {
    rows: await all(
      c.db,
      "SELECT d.*,t.name tenant_name,t.slug tenant_slug FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id ORDER BY d.created_at DESC LIMIT 100",
    ),
    configured: Boolean(
      config.syncSecret &&
      config.syncSecret.length >= 32 &&
      config.retrieveProvider &&
      config.deploymentVersion,
    ),
    provider: "Managed Sites hosting; operator-attached hostnames only",
  };
}
async function update(
  c: Context,
  row: Record<string, unknown>,
  assignment: string,
  args: unknown[],
  action: string,
) {
  const at = now();
  const results = await c.db.batch([
    stmt(
      c.db,
      `UPDATE tenant_domains SET ${assignment},version=version+1,updated_at=? WHERE id=? AND version=?`,
      ...args,
      at,
      row.id,
      row.version,
    ),
    stmt(
      c.db,
      "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,NULL,?,?,?,?,? WHERE changes()=1",
      id(),
      c.identity.userId,
      action,
      row.id,
      JSON.stringify({ hostname: row.hostname, tenantId: row.tenant_id }),
      at,
    ),
  ]);
  if (!results[0].meta.changes)
    throw new AppError(409, "Domain changed. Refresh and retry.");
  return {};
}
export function dnsInstructions(row: Record<string, unknown>) {
  return {
    ownership: {
      type: "TXT",
      name: `_sohansoft-hrms.${row.hostname}`,
      value: `sohansoft-hrms-verification=${row.challenge}`,
    },
    cname: row.cname_target
      ? {
          type: "CNAME",
          name: row.hostname,
          value: row.cname_target,
          mode: "DNS-only",
        }
      : null,
    providerRecords: JSON.parse(String(row.provider_records ?? "[]")),
    note: "Ownership TXT is generated by this HRMS. Hosting/certificate records must come from the attached hostname's native provider result. DNS propagation may take time; refresh checks after propagation. A database registration does not provision hosting.",
  };
}
export async function dns(
  config: DomainConfig,
  name: string,
  type: "TXT" | "CNAME",
) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const r = await (config.fetcher ?? fetch)(url.toString(), {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!r.ok) throw new AppError(502, "DNS resolver unavailable. Retry later.");
  const payload = JSON.parse(await boundedText(r, 32768)) as {
    Status?: number;
    Answer?: { name: string; type: number; data: string }[];
  };
  if (payload.Status === 3) return [];
  if (
    payload.Status !== 0 ||
    (payload.Answer && !Array.isArray(payload.Answer))
  )
    throw new AppError(
      502,
      "DNS lookup failed. Existing verification remains until its lease expires.",
    );
  return (payload.Answer ?? [])
    .filter(
      (a) =>
        a.type === (type === "TXT" ? 16 : 5) &&
        a.name.toLowerCase().replace(/\.$/, "") === name.toLowerCase(),
    )
    .map((a) =>
      type === "TXT"
        ? (a.data.match(/"(?:[^"\\]|\\.)*"/g) ?? [])
            .map((p) => JSON.parse(p))
            .join("")
        : a.data.toLowerCase().replace(/\.$/, ""),
    );
}
const receiptSchema = z.object({
  domainId: z.string().uuid(),
  version: z.number().int().positive(),
  hostname: z.string(),
  projectId: z.literal(HRMS_PROJECT_ID),
  providerDomainId: z.string().min(5).max(160),
  status: z.enum(["pending", "active", "failed"]),
  providerStatus: z.string().max(60).nullable(),
  sslStatus: z.string().max(60).nullable(),
  cnameTarget: z.string(),
  validationRecords: z
    .array(
      z.object({
        record_type: z.enum(["TXT", "CNAME"]),
        name: z.string().max(253),
        value: z.string().max(1000),
      }),
    )
    .max(20),
  checkedAt: z.string().datetime(),
});
async function domainActionInternal(
  c: Context,
  config: DomainConfig,
  action: string,
  data: Record<string, unknown>,
) {
  platform(c);
  await requireFreshSession(c, "changing customer domains");
  if (action === "register") {
    const host = customerHostname(String(data.hostname ?? "")),
      tid = z.string().uuid().parse(data.tenantId);
    if (!(await first(c.db, "SELECT id FROM tenants WHERE id=?", tid)))
      throw new AppError(404, "Company not found.");
    const did = id(),
      challenge = (crypto.randomUUID() + crypto.randomUUID()).replaceAll(
        "-",
        "",
      ),
      at = now();
    await c.db.batch([
      stmt(
        c.db,
        "INSERT INTO tenant_domains(id,tenant_id,hostname,challenge,challenge_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        did,
        tid,
        host,
        challenge,
        new Date(Date.now() + 7 * 86400000).toISOString(),
        at,
        at,
      ),
      audit(c, null, "domain.registered", did, {
        hostname: host,
        tenantId: tid,
      }),
    ]);
    return { id: did };
  }
  const row = await first(
    c.db,
    "SELECT * FROM tenant_domains WHERE id=?",
    z.string().uuid().parse(data.id),
  );
  if (!row) throw new AppError(404, "Domain not found.");
  if (row.status === "removed")
    throw new AppError(
      409,
      "Removed domains remain reserved. They cannot be reassigned or reactivated.",
    );
  if (action === "disable" || action === "remove")
    return update(
      c,
      row,
      "status=?,is_primary=0,session_epoch=session_epoch+1,verified_until=NULL",
      [action === "remove" ? "removed" : "disabled"],
      `domain.${action}d`,
    );
  if (action === "rotate")
    return update(
      c,
      row,
      "challenge=?,challenge_expires_at=?,status='pending',ownership_status='pending',ownership_checked_at=NULL,routing_status='pending',routing_checked_at=NULL,is_primary=0,session_epoch=session_epoch+1,verified_until=NULL",
      [
        (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", ""),
        new Date(Date.now() + 7 * 86400000).toISOString(),
      ],
      "domain.challenge_rotated",
    );
  if (row.status === "disabled")
    throw new AppError(
      409,
      "Rotate the challenge to reopen this disabled domain for verification.",
    );
  if (action === "sync") {
    const payload = z.string().max(24000).parse(data.payload),
      signature = z.string().parse(data.signature);
    if (!(await validMac(secret(config), payload, signature)))
      throw new AppError(403, "Invalid hosting receipt signature.");
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new AppError(422, "Invalid hosting receipt JSON.");
    }
    const r = receiptSchema.parse(parsed);
    if (
      r.domainId !== row.id ||
      hostname(r.hostname) !== row.hostname ||
      r.version !== row.version ||
      hostname(r.cnameTarget) !== MANAGED_CNAME ||
      !fresh(r.checkedAt, 10 * 60000)
    )
      throw new AppError(
        409,
        "Hosting receipt is stale or belongs to a different domain/project/version.",
      );
    if (!config.retrieveProvider || !config.deploymentVersion)
      throw new AppError(
        503,
        "Authenticated hosting retrieval is required; an offline export cannot prove freshness.",
      );
    const fetched = await config.retrieveProvider(
      r.providerDomainId,
      String(row.hostname),
      String(row.tenant_id),
    );
    if (
      !fresh(fetched.checkedAt, 60000) ||
      fetched.deploymentVersion !== config.deploymentVersion ||
      fetched.providerDomainId !== r.providerDomainId
    )
      throw new AppError(409, "Provider retrieval is stale or mismatched.");
    // Status and time come from the authenticated server fetch, never the signed browser payload.
    r.status = fetched.status === "active" ? "active" : "pending";
    r.providerStatus = fetched.providerStatus;
    r.sslStatus = fetched.sslStatus;
    r.checkedAt = fetched.checkedAt;
    const keep =
      r.status === "active" &&
      r.providerStatus === "active" &&
      r.sslStatus === "active";
    return update(
      c,
      row,
      "provider_id=?,provider_status=?,tls_status=?,provider_checked_at=?,provider_deployment_version=?,cname_target=?,provider_records=?,status=?,routing_status=?,is_primary=?,verified_until=?,session_epoch=?",
      [
        r.providerDomainId,
        r.status === "active" && r.providerStatus === "active"
          ? "active"
          : r.status,
        r.sslStatus ?? "unknown",
        r.checkedAt,
        fetched.deploymentVersion,
        MANAGED_CNAME,
        "[]", // Offline DNS instructions cannot become provider evidence.

        keep ? row.status : "pending",
        keep ? row.routing_status : "pending",
        keep ? row.is_primary : 0,
        keep ? row.verified_until : null,
        Number(row.session_epoch) + (keep ? 0 : 1),
      ],
      "domain.hosting_synced",
    );
  }
  if (action === "verify") {
    if (Date.parse(String(row.challenge_expires_at)) <= Date.now())
      throw new AppError(409, "Ownership challenge expired. Rotate it first.");
    const txt = await dns(config, `_sohansoft-hrms.${row.hostname}`, "TXT");
    const owned = txt.includes(`sohansoft-hrms-verification=${row.challenge}`);
    return update(
      c,
      row,
      "ownership_status=?,ownership_checked_at=?,status=?,routing_status=?,is_primary=?,verified_until=?,session_epoch=?,last_error=?",
      [
        owned ? "verified" : "pending",
        now(),
        owned ? row.status : "pending",
        owned ? row.routing_status : "pending",
        owned ? row.is_primary : 0,
        owned ? row.verified_until : null,
        Number(row.session_epoch) + (owned ? 0 : 1),
        owned
          ? null
          : "Ownership TXT not found. Check exact name/value and DNS propagation.",
      ],
      "domain.ownership_checked",
    );
  }
  if (action === "activate") {
    secret(config);
    if (
      !config.deploymentVersion ||
      row.provider_deployment_version !== config.deploymentVersion ||
      row.ownership_status !== "verified" ||
      !fresh(row.ownership_checked_at, 15 * 60000) ||
      Date.parse(String(row.challenge_expires_at)) <= Date.now() ||
      row.provider_status !== "active" ||
      row.tls_status !== "active" ||
      !fresh(row.provider_checked_at, 10 * 60000)
    )
      throw new AppError(
        409,
        "Activation requires fresh ownership, active hosting and active TLS checks.",
      );
    if (
      !(await dns(config, String(row.hostname), "CNAME")).includes(
        MANAGED_CNAME,
      )
    )
      throw new AppError(
        409,
        "DNS does not point directly to the verified managed CNAME target. Use DNS-only mode.",
      );
    const nonce = crypto.randomUUID(),
      target = `https://${row.hostname}/.well-known/sohansoft-hrms-domain?nonce=${nonce}`;
    let proof: Response;
    try {
      proof = await (config.fetcher ?? fetch)(target, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
    } catch {
      throw new AppError(
        502,
        "HTTPS routing check failed; redirects are not accepted.",
      );
    }
    if (!proof.ok || Number(proof.headers.get("content-length") ?? 0) > 4096)
      throw new AppError(502, "HRMS routing proof unavailable.");
    const body = await boundedText(proof, 4096);
    if (body.length > 4096) throw new AppError(502, "Invalid routing proof.");
    let result: { proof?: string };
    try {
      result = JSON.parse(body);
      if (!result || typeof result.proof !== "string")
        throw new Error("Invalid proof");
    } catch {
      throw new AppError(502, "Invalid routing proof.");
    }
    if (
      !(await validMac(
        secret(config),
        `route\n${row.id}\n${row.hostname}\n${row.challenge}\n${nonce}`,
        result.proof ?? "",
      ))
    )
      throw new AppError(502, "Hostname does not route to this HRMS instance.");
    // Verified lease is short and fail-closed; operator must repeat current checks daily.
    return update(
      c,
      row,
      "status='active',routing_status='verified',routing_checked_at=?,verified_until=?,activated_at=?,last_error=NULL",
      [now(), new Date(Date.now() + 86400000).toISOString(), now()],
      "domain.activated",
    );
  }
  if (action === "primary") {
    if (
      row.status !== "active" ||
      Date.parse(String(row.verified_until)) <= Date.now()
    )
      throw new AppError(409, "Only a current active domain can be primary.");
    const results = await c.db.batch([
      stmt(
        c.db,
        "UPDATE tenant_domains SET is_primary=0,version=version+1 WHERE tenant_id=? AND id<>? AND is_primary=1 AND EXISTS(SELECT 1 FROM tenant_domains selected WHERE selected.id=? AND selected.version=? AND selected.status='active' AND selected.verified_until>?)",
        row.tenant_id,
        row.id,
        row.id,
        row.version,
        now(),
      ),
      stmt(
        c.db,
        "UPDATE tenant_domains SET is_primary=1,version=version+1 WHERE id=? AND version=? AND status='active' AND verified_until>?",
        row.id,
        row.version,
        now(),
      ),
      stmt(
        c.db,
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_id,details,created_at) SELECT ?,NULL,?,'domain.primary_changed',?,'{}',? WHERE changes()=1",
        id(),
        c.identity.userId,
        row.id,
        now(),
      ),
    ]);
    if (!results[1].meta.changes)
      throw new AppError(409, "Domain changed. Refresh and retry.");
    return {};
  }
  throw new AppError(404, "Unknown domain action.");
}
export async function routingProof(
  request: Request,
  db: D1Database,
  config: DomainConfig,
) {
  const url = new URL(request.url),
    nonce = url.searchParams.get("nonce") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(nonce)) throw new AppError(404, "Unavailable.");
  const host = hostname(url.hostname),
    row = await first(
      db,
      "SELECT * FROM tenant_domains WHERE hostname=? AND status IN('pending','active')",
      host,
    );
  if (
    !row ||
    !config.deploymentVersion ||
    row.provider_deployment_version !== config.deploymentVersion ||
    row.ownership_status !== "verified" ||
    row.provider_status !== "active" ||
    row.tls_status !== "active" ||
    !fresh(row.provider_checked_at, 10 * 60000) ||
    Date.parse(String(row.challenge_expires_at)) <= Date.now()
  )
    throw new AppError(404, "Unavailable.");
  return Response.json(
    {
      proof: await domainMac(
        secret(config),
        `route\n${row.id}\n${host}\n${row.challenge}\n${nonce}`,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export type TenantRequest = {
  hostname: string;
  tenantId?: string;
  slug?: string;
  realm: string;
  publicPath: string;
  domainId?: string;
};
export async function resolveTenantRequest(
  db: D1Database,
  request: Request,
  development = false,
  deploymentVersion?: string,
): Promise<TenantRequest> {
  const u = new URL(request.url);
  if (u.protocol !== "https:" && !development)
    throw new AppError(403, "HTTPS is required.");
  const host =
    development &&
    ["localhost", "127.0.0.1", "terminal.local"].includes(u.hostname)
      ? u.hostname
      : hostname(u.hostname);
  const supplied = request.headers.get("host");
  if (supplied && supplied.toLowerCase() !== u.host.toLowerCase())
    throw new AppError(400, "Request hostname mismatch.");
  if (
    PLATFORM_HOSTS.includes(host) ||
    (development && ["localhost", "127.0.0.1", "terminal.local"].includes(host))
  )
    return { hostname: host, realm: "platform", publicPath: u.pathname };
  const d = await first(
    db,
    "SELECT d.*,t.slug,t.status tenant_status,s.status subscription_status,s.expires_at,p.modules FROM tenant_domains d JOIN tenants t ON t.id=d.tenant_id JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE d.hostname=?",
    host,
  );
  if (
    !d ||
    d.status !== "active" ||
    (deploymentVersion !== undefined &&
      d.provider_deployment_version !== deploymentVersion) ||
    d.ownership_status !== "verified" ||
    d.tls_status !== "active" ||
    d.provider_status !== "active" ||
    d.routing_status !== "verified" ||
    !future(d.verified_until) ||
    d.tenant_status !== "active" ||
    !["active", "trial"].includes(String(d.subscription_status)) ||
    !future(d.expires_at) ||
    !JSON.parse(String(d.modules)).includes("core")
  )
    throw new AppError(404, "Hostname is unavailable.");
  return {
    hostname: host,
    tenantId: String(d.tenant_id),
    slug: String(d.slug),
    domainId: String(d.id),
    realm: `domain:${d.id}:${d.session_epoch}`,
    publicPath: u.pathname,
  };
}
export async function tenantUrl(
  db: D1Database,
  tenantId: string,
  path = "/",
  deploymentVersion?: string,
) {
  // Background jobs call this with their persisted tenant ID, never a request Host.
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path) ||
    new URL(path, "https://hrms.sohansoft.in").pathname !== path.split("?")[0]
  )
    throw new AppError(422, "Invalid link path.");
  const t = await first(
    db,
    "SELECT t.slug,s.status subscription_status,s.expires_at,p.modules FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id JOIN plans p ON p.id=s.plan_id WHERE t.id=? AND t.status='active'",
    tenantId,
  );
  if (!t) throw new AppError(404, "Company unavailable.");
  assertEntitlement(
    String(t.subscription_status),
    String(t.expires_at),
    JSON.parse(String(t.modules)),
    "core",
  );
  const d = await first(
    db,
    "SELECT hostname FROM tenant_domains WHERE tenant_id=? AND (? IS NULL OR provider_deployment_version=?) AND status='active' AND is_primary=1 AND ownership_status='verified' AND tls_status='active' AND provider_status='active' AND routing_status='verified' AND verified_until>?",
    tenantId,
    deploymentVersion ?? null,
    deploymentVersion ?? null,
    now(),
  );
  return d
    ? `https://${hostname(String(d.hostname))}${path}`
    : `https://hrms.sohansoft.in${workspacePath(String(t.slug))}${path === "/" ? "" : path}`;
}

async function boundedText(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > limit)
        throw new AppError(502, "Provider response exceeded safety limit.");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(bytes);
}

export async function tenantRouteRedirect(
  db: D1Database,
  context: TenantRequest,
  request: Request,
) {
  if (!context.tenantId) return null;
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/super-admin") ||
    url.pathname.startsWith("/api/domains")
  )
    throw new AppError(404, "Unavailable.");
  if (url.pathname.startsWith("/company/")) {
    const parts = url.pathname.split("/");
    const legacy = await first(
      db,
      "SELECT id FROM tenants WHERE slug=? UNION ALL SELECT tenant_id id FROM tenant_slug_aliases WHERE slug=? LIMIT 1",
      parts[2],
      parts[2],
    );
    if (legacy?.id !== context.tenantId)
      throw new AppError(404, "Unavailable.");
    const target = parts.slice(3).join("/");
    if (
      target &&
      !/^(admin|hr|manager|employee|recruiter|workspace)(?:\/payroll)?$/.test(
        target,
      )
    )
      throw new AppError(404, "Unavailable.");
    return `${url.origin}/${target}${url.search}`;
  }
  return null;
}

export async function domainAction(
  c: Context,
  config: DomainConfig,
  action: string,
  data: Record<string, unknown>,
) {
  try {
    return await domainActionInternal(c, config, action, data);
  } catch (error) {
    if (
      !c.boundTenantId &&
      c.identity.mobile === c.adminMobile &&
      typeof data.id === "string" &&
      /^[a-f0-9-]{36}$/.test(data.id)
    ) {
      const message =
        error instanceof AppError ? error.message : "Domain operation failed.";
      await c.db.batch([
        stmt(
          c.db,
          "UPDATE tenant_domains SET last_error=? WHERE id=? AND status IN('pending','active')",
          message,
          data.id,
        ),
        audit(c, null, "domain.operation_failed", data.id, {
          action: [
            "verify",
            "activate",
            "sync",
            "rotate",
            "disable",
            "remove",
            "primary",
          ].includes(action)
            ? action
            : "unknown",
          status: error instanceof AppError ? error.status : 500,
        }),
      ]);
    }
    throw error;
  }
}
