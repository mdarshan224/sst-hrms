"use client";
import { useJsonResource } from "./use-json-resource";
export async function workflowAction(
  action: string,
  tenant: string,
  data: Record<string, unknown>,
) {
  const r = await fetch("/api/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tenant, data }),
    }),
    body = (await r.json()) as Record<string, unknown>;
  if (!r.ok)
    throw new Error(String(body.error ?? "Workflow operation failed."));
  return body;
}
export function useWorkflow<T>(
  view: string,
  tenant = "",
  args: Record<string, string> = {},
  enabled = true,
) {
  const encoded = new URLSearchParams({ view, tenant, ...args }).toString();
  return useJsonResource<T>("/api/workflow?" + encoded, enabled);
}
