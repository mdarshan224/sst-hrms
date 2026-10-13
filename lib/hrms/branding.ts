import { AppError } from "./domain.ts";
import { first } from "./access.ts";
export const platformBrand = {
  name: "Sohan Soft Tech HRMS",
  company: "SohanSoft Technologies Private Limited",
  primary: "#176B50",
  accent: "#D9A441",
  logo: "/brand/sohan-soft-tech-logo.png",
  positioning: "People & Workforce Platform",
};
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) =>
      v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function primaryContrast(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}
export function accentText(hex: string) {
  return primaryContrast(hex) >= 4.5
    ? "#fff"
    : (luminance(hex) + 0.05) / (luminance("#173D30") + 0.05) >= 4.5
      ? "#173D30"
      : "#000";
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateLogo(encoded: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 48000)
    throw new AppError(422, "Use a PNG logo smaller than 36 KB.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw new AppError(422, "Invalid PNG logo.");
  }
  const fail = () => {
    throw new AppError(422, "Upload a valid PNG logo, up to 512 × 512 pixels.");
  };
  if (
    bytes.length < 57 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)
  )
    return fail();
  const view = new DataView(bytes.buffer);
  let offset = 8,
    count = 0,
    idat = false,
    ended = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return fail();
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) return fail();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (
      ![
        "IHDR",
        "IDAT",
        "IEND",
        "PLTE",
        "tRNS",
        "gAMA",
        "sRGB",
        "pHYs",
      ].includes(type)
    )
      return fail();
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
      view.getUint32(offset + 8 + length)
    )
      return fail();
    if (count++ === 0) {
      if (type !== "IHDR" || length !== 13) return fail();
      const w = view.getUint32(offset + 8),
        h = view.getUint32(offset + 12);
      if (w < 1 || h < 1 || w > 512 || h > 512) return fail();
    } else if (type === "IHDR") return fail();
    if (type === "IDAT") idat = true;
    if (type === "IEND") {
      if (length !== 0 || offset + 12 !== bytes.length) return fail();
      ended = true;
    }
    offset += 12 + length;
  }
  if (!idat || !ended) return fail();
  return bytes;
}
export async function publicBrand(db: D1Database, slug: string) {
  const b = await first(
    db,
    "SELECT t.name,t.slug,t.brand_color,t.locale,t.currency,t.timezone,b.accent_color,b.version,CASE WHEN b.logo_data IS NOT NULL THEN 1 ELSE 0 END has_logo FROM tenants t LEFT JOIN tenant_branding b ON b.tenant_id=t.id WHERE t.slug=? AND t.status='active'",
    slug,
  );
  if (!b) return null;
  return {
    name: String(b.name),
    slug: String(b.slug),
    brand_color: String(b.brand_color),
    locale: String(b.locale),
    currency: String(b.currency),
    timezone: String(b.timezone),
    branding_version: Number(b.version ?? 0),
    accent_color: String(b.accent_color ?? platformBrand.accent),
    logo_url: b.has_logo
      ? `/api/branding?company=${encodeURIComponent(String(b.slug))}&v=${b.version}`
      : null,
  };
}
export async function logoResponse(db: D1Database, slug: string) {
  const b = await first(
    db,
    "SELECT b.logo_data FROM tenant_branding b JOIN tenants t ON t.id=b.tenant_id WHERE t.slug=? AND t.status='active'",
    slug,
  );
  if (!b?.logo_data)
    return new Response("Logo not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  return new Response(validateLogo(String(b.logo_data)).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
