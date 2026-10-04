import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import PasswordInput from "../../components/ui/PasswordInput";
import dgLogoUrl from "../../assets/dg-logo.svg";
import { Shield, MapPin, Users, BarChart3 } from "lucide-react";

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

  const features = [
    { icon: Shield,   label: "Workforce Protection",  sub: "End-to-end officer management" },
    { icon: MapPin,   label: "Live Site Coverage",     sub: "Real-time deployment tracking" },
    { icon: Users,    label: "HR & Contracts",         sub: "Compliant employment records" },
    { icon: BarChart3,label: "Finance & Payroll",      sub: "Invoicing, expenses, payslips" },
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "#F5F6FA" }}>

      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] flex-shrink-0 px-14 py-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(140deg, #B45309 0%, #D97706 40%, #F0A830 100%)",
        }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, #FFFFFF 1px, transparent 1px), radial-gradient(circle at 80% 80%, #FFFFFF 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 80%, rgba(0,0,0,0.12) 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-48 brightness-0 invert" />
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <h1 className="text-4xl font-bold leading-tight mb-4 text-white">
            Protecting People.<br />Securing Futures.
          </h1>
          <p className="text-base leading-relaxed mb-10" style={{ color: "rgba(255,255,255,0.75)" }}>
            The complete operations platform for Direct Guard Limited — built for security professionals.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3">
            {features.map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
              >
                <Icon size={18} className="mb-2 text-white opacity-90" />
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs relative z-10" style={{ color: "rgba(255,255,255,0.5)" }}>
          © {new Date().getFullYear()} Direct Guard Limited. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-10">
            <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-44" />
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-8"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
          >
            {/* Heading */}
            <div className="mb-6">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "#FFF7E6" }}
              >
                <Shield size={20} style={{ color: "#D97706" }} />
              </div>
              <h2 className="text-2xl font-bold mb-1" style={{ color: "#111827" }}>
                Welcome back
              </h2>
              <p className="text-sm" style={{ color: "#6B7280" }}>
                Sign in to Direct Guard management
              </p>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2.5 text-sm rounded-lg px-4 py-3 mb-5"
                style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
              >
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium" style={{ color: "#374151" }}>
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
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm transition-all outline-none"
                  style={{
                    background: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "#FFFFFF";
                    e.currentTarget.style.borderColor = "#F0A830";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(240,168,48,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = "#F9FAFB";
                    e.currentTarget.style.borderColor = "#E5E7EB";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#374151" }}>
                  Password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-all"
                  style={{
                    background: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    color: "#111827",
                  } as React.CSSProperties}
                  onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                    e.currentTarget.style.background = "#FFFFFF";
                    e.currentTarget.style.borderColor = "#F0A830";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(240,168,48,0.15)";
                  }}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                    e.currentTarget.style.background = "#F9FAFB";
                    e.currentTarget.style.borderColor = "#E5E7EB";
                    e.currentTarget.style.boxShadow = "none";
                  }}
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
                <span className="text-sm" style={{ color: "#6B7280" }}>
                  Remember my email
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all mt-2"
                style={{
                  background: "#F0A830",
                  color: "#FFFFFF",
                  opacity: isSubmitting ? 0.65 : 1,
                  boxShadow: isSubmitting ? "none" : "0 4px 14px rgba(240,168,48,0.35)",
                }}
                onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = "#D97706"; }}
                onMouseLeave={(e) => { if (!isSubmitting) e.currentTarget.style.background = "#F0A830"; }}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
