import { AppError } from "./domain.ts";
import { HRMS_PROJECT_ID, hostname } from "./domains.ts";
export type HostingConfig = {
  token?: string;
  zoneId?: string;
  deploymentVersion?: string;
  fetcher?: typeof fetch;
};
export async function retrieveHosting(
  config: HostingConfig,
  providerId: string,
  expectedHost: string,
  tenantId: string,
) {
  if (!config.token || !config.zoneId || !config.deploymentVersion)
    throw new AppError(
      503,
      "Authenticated hosting retrieval is not configured. Offline exports cannot establish fresh provider status.",
    );
  if (
    !/^[a-f0-9]{32}$/.test(config.zoneId) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(providerId)
  )
    throw new AppError(
      422,
      "Use actual Cloudflare zone/custom-hostname identifiers; native Sites IDs are not Cloudflare IDs.",
    );
  const response = await (config.fetcher ?? fetch)(
    `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames/${providerId}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new AppError(
      502,
      "Authenticated hosting status retrieval failed. Check account scope and hostname attachment.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "Empty hosting response.");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 65536)
        throw new AppError(502, "Hosting response exceeded limit.");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError(502, "Malformed hosting response.");
  }
  const r = body.result,
    meta = r?.custom_metadata;
  if (
    body.success !== true ||
    r?.id !== providerId ||
    hostname(String(r?.hostname ?? "")) !== expectedHost ||
    meta?.hrms_project_id !== HRMS_PROJECT_ID ||
    meta?.hrms_tenant_id !== tenantId ||
    meta?.hrms_deployment_version !== config.deploymentVersion
  )
    throw new AppError(
      409,
      "Provider hostname/project/tenant/deployment association does not match.",
    );
  return {
    status: r.status === "active" ? "active" : "pending",
    providerStatus: r.status,
    sslStatus: r.ssl?.status ?? "unknown",
    providerDomainId: r.id,
    checkedAt: new Date().toISOString(),
    deploymentVersion: config.deploymentVersion,
  };
}
