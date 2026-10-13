"use client";
import BrandImage from "next/image";
import { useState } from "react";
import { platformBrand, accentText } from "@/lib/hrms/branding";
type Row = Record<string, string | number | null>;
export default function BrandingSettings({
  tenant,
  onSave,
}: {
  tenant: Row;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(String(tenant.name)),
    [primary, setPrimary] = useState(String(tenant.brand_color)),
    [accent, setAccent] = useState(
      String(tenant.accent_color ?? platformBrand.accent),
    ),
    [timezone, setTimezone] = useState(String(tenant.timezone)),
    [locale, setLocale] = useState(String(tenant.locale)),
    [currency, setCurrency] = useState(String(tenant.currency)),
    [prefix, setPrefix] = useState(String(tenant.employee_prefix)),
    [logo, setLogo] = useState<string | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const preview =
    logo === undefined
      ? String(tenant.logo_url ?? "")
      : logo
        ? "data:image/png;base64," + logo
        : "";
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (file.type !== "image/png" || file.size > 2 * 1024 * 1024)
        throw new Error("Choose a PNG image smaller than 2 MB.");
      const bytes = await file.arrayBuffer(),
        view = new DataView(bytes);
      if (
        bytes.byteLength < 24 ||
        view.getUint32(0) !== 0x89504e47 ||
        view.getUint32(4) !== 0x0d0a1a0a ||
        view.getUint32(16) > 2048 ||
        view.getUint32(20) > 2048
      )
        throw new Error("Use a PNG up to 2048 × 2048 pixels.");
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image could not be decoded."));
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        const factor = Math.min(1, 128 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * factor));
        canvas.height = Math.max(1, Math.round(img.height * factor));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image conversion unavailable.");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL("image/png").split(",")[1];
        if (encoded.length > 48000)
          throw new Error(
            "Choose a simpler logo; optimized image exceeds 36 KB.",
          );
        setLogo(encoded);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read logo.");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const values: Record<string, unknown> = {
        name,
        brandColor: primary,
        accentColor: accent,
        employeePrefix: prefix,
        timezone,
        locale,
        currency,
      };
      if (logo !== undefined) values.logoData = logo;
      await onSave(values);
      setSaved("Company branding saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save branding.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Company branding</h2>
          <p>
            Your logo is public on branded login pages. Upload company artwork
            only.
          </p>
        </div>
      </div>
      <div className="branding-editor">
        <form onSubmit={submit} className="branding-fields">
          <label className="form-field">
            Company name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <div className="branding-colors">
            <label className="form-field">
              Primary colour
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
            </label>
            <label className="form-field">
              Accent colour
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
            </label>
          </div>
          <label className="form-field">
            Company logo (PNG)
            <input
              type="file"
              accept="image/png"
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <small>
              Optimized to 128 pixels. Stored persistently as a validated public
              logo.
            </small>
          </label>
          <label className="form-field">
            Timezone
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            Locale
            <input
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
              pattern="[A-Z]{3}"
              maxLength={3}
            />
          </label>
          <label className="form-field">
            Employee ID prefix
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              required
              pattern="[A-Z0-9]{2,10}"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">{saved}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setPrimary(platformBrand.primary);
                setAccent(platformBrand.accent);
                setLogo(null);
                setSaved("");
              }}
            >
              Reset colours & logo
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save branding"}
            </button>
          </div>
        </form>
        <aside
          className="branding-preview"
          style={
            {
              "--brand": primary,
              "--accent": accent,
              "--accent-ink": accentText(accent),
            } as React.CSSProperties
          }
        >
          <span className="eyebrow">Live preview · not saved</span>
          {preview ? (
            <BrandImage
              unoptimized
              src={preview}
              alt="Company logo preview"
              width={72}
              height={72}
            />
          ) : (
            <span className="tenant-monogram">{name.slice(0, 1)}</span>
          )}
          <h3>{name}</h3>
          <p>People & Workforce Platform</p>
          <button className="primary" type="button" disabled>
            Primary colour preview
          </button>
          <span className="brand-accent-preview">Accent preview</span>
          <small>
            {timezone} · {locale} · {currency}
          </small>
        </aside>
      </div>
    </section>
  );
}
