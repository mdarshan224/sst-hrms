import { AppError } from "./domain.ts";
export type PrivateConfig = { dataKey?: string };
async function key(config: PrivateConfig) {
  if (!config.dataKey || !/^[a-f0-9]{64}$/.test(config.dataKey))
    throw new AppError(503, "Encrypted onboarding storage is not configured.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(config.dataKey.match(/../g)!, (v) => parseInt(v, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(config: PrivateConfig, value: unknown, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      await key(config),
      new TextEncoder().encode(JSON.stringify(value)),
    );
  return (
    "v1." +
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
export async function unseal(
  config: PrivateConfig,
  cipher: string,
  aad: string,
) {
  try {
    const [version, iv, data] = cipher.split(".");
    if (version !== "v1") throw new Error("version");
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(atob(iv), (v) => v.charCodeAt(0)),
        additionalData: new TextEncoder().encode(aad),
      },
      await key(config),
      Uint8Array.from(atob(data), (v) => v.charCodeAt(0)),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      503,
      "Private data could not be authenticated. Contact the operator.",
    );
  }
}
export async function digestText(text: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
