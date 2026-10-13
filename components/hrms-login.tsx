"use client";
import Link from "next/link";
import BrandImage from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Smartphone,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Users,
  Building2,
  Layers3,
} from "lucide-react";
type Brand = {
  name: string;
  slug: string;
  brand_color: string;
  accent_color: string;
  logo_url: string | null;
};
const platformLogo = "/brand/sohan-soft-tech-logo.png";
export default function Login({
  next,
  brand,
  roleLabel,
}: {
  next: string;
  brand: Brand | null;
  roleLabel?: string;
}) {
  const [mobile, setMobile] = useState(""),
    [otp, setOtp] = useState(""),
    [step, setStep] = useState<"mobile" | "otp">("mobile"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [countdown, setCountdown] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = brand?.logo_url ?? platformLogo;
  }, [brand?.logo_url]);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(
      () => setCountdown((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [countdown]);
  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", mobile }),
      });
      const result = (await response.json()) as {
        error?: string;
        accepted?: boolean;
        mobile: string;
      };
      if (!response.ok || !result.accepted)
        throw new Error(result.error ?? "The OTP request could not be sent.");
      setMobile(result.mobile);
      setStep("otp");
      setOtp("");
      setCountdown(60);
      setMessage("Your OTP request was accepted. Enter the code you receive.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to request OTP.");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", mobile, otp }),
      });
      const result = (await response.json()) as {
        error?: string;
        verified?: boolean;
      };
      if (!response.ok || !result.verified)
        throw new Error(result.error ?? "Verification failed.");
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify code.");
      setBusy(false);
    }
  }
  return (
    <div
      className="login-page"
      style={
        {
          "--brand": brand?.brand_color ?? "#176B50",
          "--accent": brand?.accent_color ?? "#D9A441",
        } as React.CSSProperties
      }
    >
      <section className="login-story">
        <Link href="/login" className="login-brand">
          <BrandImage
            unoptimized
            className="approved-logo"
            src={brand?.logo_url ?? platformLogo}
            alt=""
            width={44}
            height={44}
          />
          <div>
            {brand?.name ?? "Sohan Soft Tech"}
            <small>HRMS · PEOPLE & WORKFORCE</small>
          </div>
        </Link>
        <div className="login-story-content">
          <span className="login-label">
            <i /> BUILT AROUND YOUR PEOPLE
          </span>
          <h1>
            Your team.
            <br />
            Your culture.
            <br />
            <span>Your workspace.</span>
          </h1>
          <p>
            Bring people, hiring and company operations together in a workspace
            that feels like yours.
          </p>
          <div className="login-feature">
            <Users size={18} />
            <span>Independent company workspaces</span>
          </div>
          <div className="login-feature">
            <Layers3 size={18} />
            <span>One platform. Connected teams.</span>
          </div>
          <div className="login-feature">
            <ShieldCheck size={18} />
            <span>Verified mobile access. Audited actions.</span>
          </div>
        </div>
        <div className="login-story-bottom">
          <span>SohanSoft Technologies</span>
          <span>Designed for people. Built for trust.</span>
        </div>
        <div className="login-orbit one" />
        <div className="login-orbit two" />
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <BrandImage
              unoptimized
              className="approved-logo"
              src={brand?.logo_url ?? platformLogo}
              alt=""
              width={44}
              height={44}
            />
            {brand?.name ?? "Sohan Soft Tech HRMS"}
          </div>
          <div className="login-context">
            <Building2 size={15} />
            {brand ? brand.name : "SOHAN SOFT TECH HRMS"}
          </div>
          <span className="login-step">
            {step === "mobile"
              ? "01 / SECURE SIGN IN"
              : "02 / MOBILE VERIFICATION"}
          </span>
          <span className="login-form-icon">
            {step === "mobile" ? (
              <Smartphone size={25} />
            ) : (
              <KeyRound size={25} />
            )}
          </span>
          <h2>
            {step === "mobile"
              ? roleLabel
                ? `${roleLabel} sign in`
                : "Welcome to your workspace."
              : "A quick check. Then you’re in."}
          </h2>
          <p>
            {step === "mobile"
              ? "Sign in with your mobile number. We’ll send a one-time code to verify it."
              : `Enter the 6-digit code sent to +91 ${mobile.slice(0, 2)}••••${mobile.slice(-4)}. Your code expires in 5 minutes.`}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "mobile") void send();
              else void verify();
            }}
          >
            {step === "mobile" ? (
              <label className="login-field">
                <span>Mobile number</span>
                <div className="phone-input">
                  <span>+91</span>
                  <input
                    autoFocus
                    autoComplete="tel-national"
                    inputMode="tel"
                    type="tel"
                    aria-label="Mobile number"
                    placeholder="Enter your 10-digit number"
                    maxLength={16}
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
              </label>
            ) : (
              <label className="login-field">
                <span>Verification code</span>
                <input
                  autoFocus
                  className="otp-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  aria-label="Six digit OTP"
                  placeholder="000000"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {message && step === "otp" && !error && (
              <div className="otp-message" role="status">
                <CheckCircle2 size={15} />
                {message}
              </div>
            )}
            <button
              className="primary login-submit"
              disabled={busy || (step === "otp" && otp.length !== 6)}
            >
              {busy ? (
                <>
                  <RefreshCw className="spin" size={18} />
                  Please wait…
                </>
              ) : (
                <>
                  {step === "mobile"
                    ? "Send verification code"
                    : "Verify & sign in"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          {step === "otp" && (
            <div className="login-secondary">
              <button
                disabled={busy}
                onClick={() => {
                  setStep("mobile");
                  setError("");
                  setMessage("");
                }}
              >
                <ArrowLeft size={14} />
                Change number
              </button>
              <button
                disabled={busy || countdown > 0}
                onClick={() => void send()}
              >
                {countdown ? `Resend in ${countdown}s` : "Resend code"}
              </button>
            </div>
          )}
          <div className="login-security">
            <ShieldCheck size={17} />
            <p>
              Only verified numbers can sign in. Company records remain
              protected by membership and role permissions.
            </p>
          </div>
          <div className="login-powered">
            Secure verification powered by Fast2SMS SmartOTP
          </div>
        </div>
        <footer className="login-footer">
          <span>© {new Date().getFullYear()} SohanSoft</span>
          <span>Your workspace, securely connected.</span>
        </footer>
      </section>
    </div>
  );
}
