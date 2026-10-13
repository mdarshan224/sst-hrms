import { env } from "cloudflare:workers";
import type { HostedConfig } from "./hosted-verification";
export function cashfreeConfig(): HostedConfig {
  return {
    sandboxProducts: (env.CASHFREE_SECUREID_SANDBOX_PRODUCTS ?? "")
      .split(",")
      .filter(Boolean),
    productionProducts: (env.CASHFREE_SECUREID_PRODUCTION_PRODUCTS ?? "")
      .split(",")
      .filter(Boolean),
    productionHostedHostname: env.CASHFREE_DIGILOCKER_PRODUCTION_HOSTNAME,
    sandbox: {
      clientId: env.CASHFREE_SECUREID_SANDBOX_CLIENT_ID,
      clientSecret: env.CASHFREE_SECUREID_SANDBOX_CLIENT_SECRET,
      publicKey: env.CASHFREE_SECUREID_SANDBOX_PUBLIC_KEY,
    },
    production: {
      clientId: env.CASHFREE_SECUREID_PRODUCTION_CLIENT_ID,
      clientSecret: env.CASHFREE_SECUREID_PRODUCTION_CLIENT_SECRET,
      publicKey: env.CASHFREE_SECUREID_PRODUCTION_PUBLIC_KEY,
    },
    productionApproved: env.CASHFREE_SECUREID_PRODUCTION_APPROVED === "true",
  };
}
