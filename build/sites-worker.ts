import {
  resolveTenantRequest,
  routingProof,
  tenantRouteRedirect,
} from "../lib/hrms/domains";
import { withTenantRequest } from "../lib/hrms/tenant-context";
import { AppError } from "../lib/hrms/domain";
import { withSecurityHeaders } from "../lib/hrms/security";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    if (!env.DB)
      return withSecurityHeaders(
        new Response("Database unavailable", { status: 503 }),
      );
    let tenant;
    try {
      const url = new URL(request.url);
      // Proof endpoint discloses no tenant data or session and signs only registered hosts.
      if (url.pathname === "/.well-known/sohansoft-hrms-domain") {
        if (
          url.protocol !== "https:" ||
          (request.headers.get("host") &&
            request.headers.get("host")!.toLowerCase() !==
              url.host.toLowerCase())
        )
          throw new AppError(400, "Invalid routing probe.");
        return withSecurityHeaders(
          await routingProof(request, env.DB, {
            syncSecret: env.HRMS_DOMAIN_SYNC_SECRET,
            deploymentVersion: env.HRMS_DEPLOYMENT_VERSION,
          }),
        );
      }
      tenant = await resolveTenantRequest(
        env.DB,
        request,
        import.meta.env.DEV,
        env.HRMS_DEPLOYMENT_VERSION ?? "unconfigured",
      );
      const redirect = await tenantRouteRedirect(env.DB, tenant, request);
      if (redirect)
        return withSecurityHeaders(Response.redirect(redirect, 307));
    } catch (error) {
      return withSecurityHeaders(
        new Response(
          error instanceof AppError
            ? error.message
            : "Tenant routing unavailable",
          { status: error instanceof AppError ? error.status : 503 },
        ),
      );
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await withTenantRequest(tenant, () =>
      runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)),
    );
    return withSecurityHeaders(response);
  },
};
