import { env } from "cloudflare:workers";
import { cashfreeConfig } from "./cashfree-config";
export const privateConfig = () => ({ dataKey: env.ONBOARDING_DATA_KEY });
export const jobConfig = () => ({
  bucket: env.BUCKET,
  scannerUrl: env.DOCUMENT_SCANNER_URL,
  scannerToken: env.DOCUMENT_SCANNER_TOKEN,
  scanSecret: env.DOCUMENT_SCAN_CALLBACK_SECRET,
  cashfree: cashfreeConfig(),
});
