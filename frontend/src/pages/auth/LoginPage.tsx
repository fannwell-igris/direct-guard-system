import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import PasswordInput from "../../components/ui/PasswordInput";
import dgLogoUrl from "../../assets/dg-logo.svg";
import { Shield } from "lucide-react";

const REMEMBERED_EMAIL_KEY = "dg_remembered_email";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /* shared input style handlers */
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#F0A830";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(240,168,48,0.14)";
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#1C2A42";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#070912" }}>

      {/* ── Left brand panel ──────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[44%] flex-shrink-0 px-14 py-12 relative overflow-hidden"
        style={{ background: "#080C18", borderRight: "1px solid #111A2C" }}
      >
        {/* Subtle radial accent */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 30% 60%, rgba(240,168,48,0.05) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-52 relative z-10" />

        {/* Headline copy */}
        <div className="relative z-10">
          {/* Shield icon accent */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-8"
            style={{ background: "rgba(240,168,48,0.10)", border: "1px solid rgba(240,168,48,0.20)" }}
          >
            <Shield size={22} style={{ color: "#F0A830" }} />
          </div>

          <h1
            className="text-3xl font-bold leading-tight mb-4"
            style={{ color: "#E2EAF8" }}
          >
            Protecting People.<br />
            <span style={{ color: "#F0A830" }}>Securing Futures.</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: "#4A5E7A" }}>
            Centralised operations management for Direct Guard Limited — workforce, clients, finance, and field operations in one secure platform.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {["Workforce Management", "Live Site Coverage", "Finance & Payroll", "Field Operations"].map((f) => (
              <span
                key={f}
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: "#111A2C", color: "#7B8CB0", border: "1px solid #1C2A42" }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs relative z-10" style={{ color: "#2A3D58" }}>
          © {new Date().getFullYear()} Direct Guard Limited. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-10">
            <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-44" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1" style={{ color: "#E2EAF8" }}>
              Sign in
            </h2>
            <p className="text-sm" style={{ color: "#4A5E7A" }}>
              Access the Direct Guard management system
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-3 text-sm rounded-lg px-4 py-3 mb-6"
              style={{ background: "#2D0A0A", color: "#F87171", border: "1px solid #7F1D1D" }}
            >
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium" style={{ color: "#A8BEDC" }}>
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@directguardlimited.com"
                onFocus={inputFocus}
                onBlur={inputBlur}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm transition-all outline-none"
                style={{
                  background: "#0A1020",
                  border: "1px solid #1C2A42",
                  color: "#E2EAF8",
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#A8BEDC" }}>
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={inputFocus}
                onBlur={inputBlur}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: "#0A1020",
                  border: "1px solid #1C2A42",
                  color: "#E2EAF8",
                } as React.CSSProperties}
              />
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: "#F0A830" }}
              />
              <span className="text-sm" style={{ color: "#4A5E7A" }}>
                Remember my email on this device
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all"
              style={{
                background: "#F0A830",
                color: "#070912",
                opacity: isSubmitting ? 0.65 : 1,
                boxShadow: isSubmitting ? "none" : "0 4px 16px rgba(240,168,48,0.28)",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = "#D4912B";
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = "#F0A830";
              }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
