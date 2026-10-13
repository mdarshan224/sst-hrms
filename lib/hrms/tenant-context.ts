import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantRequest } from "./domains.ts";
const context = new AsyncLocalStorage<TenantRequest>();
export const withTenantRequest = <T>(value: TenantRequest, run: () => T): T =>
  context.run(value, run);
export const tenantRequest = () => context.getStore();
