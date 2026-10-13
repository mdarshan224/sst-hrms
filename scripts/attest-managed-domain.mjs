// Signs a selection envelope, NOT provider evidence. The server MUST independently
// retrieve current authenticated provider data. No DNS/Worker mutations occur here.
import { createHmac } from "node:crypto";
const args = Object.fromEntries(
  process.argv.slice(2).map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i), x.slice(i + 1)];
  }),
);
const secret = process.env.HRMS_DOMAIN_SYNC_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "Configure the independent HRMS sync secret securely. Never reuse the ERP secret.",
  );
if (
  !/^[a-f0-9-]{36}$/.test(args.providerDomainId ?? "") ||
  !/^\d+$/.test(args.version ?? "") ||
  Number(args.version) < 1 ||
  !args.domainId ||
  !args.hostname
)
  throw new Error(
    "Supply current registry domainId/version/hostname and an ACTUAL Cloudflare Custom Hostname UUID. Sites IDs and offline exports are not provider evidence.",
  );
const payload = JSON.stringify({
  domainId: args.domainId,
  version: Number(args.version),
  hostname: args.hostname,
  projectId: "appgprj_6acc998779048191a144f8c871a17577",
  providerDomainId: args.providerDomainId,
  status: "pending",
  providerStatus: "pending",
  sslStatus: "unknown",
  cnameTarget: "custom-domains.chatgpt.site",
  validationRecords: [],
  checkedAt: new Date().toISOString(),
});
console.log(
  JSON.stringify({
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  }),
);
