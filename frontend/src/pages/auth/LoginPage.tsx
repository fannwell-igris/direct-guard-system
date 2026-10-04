import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import PasswordInput from "../../components/ui/PasswordInput";
import dgLogoUrl from "../../assets/dg-logo.svg";

// "Remember me" only ever stores the email locally, pre-filled on the next
// visit — never the password. Saving the password itself is left to the
// browser's own (encrypted, OS-level) password manager, which the
// autoComplete attributes below opt into.
const REMEMBERED_EMAIL_KEY = "cms_remembered_email";

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
      setError(err.response?.data?.message ?? "Login failed. Check your email and password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — brand ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] flex-shrink-0 px-14 py-12"
        style={{ background: "linear-gradient(160deg, #1a1f3c 0%, #0d1022 100%)" }}
      >
        {/* Logo */}
        <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-56" />

        {/* Centre copy */}
        <div>
          <p
            className="text-4xl font-bold leading-snug mb-4"
            style={{ color: "#EEA135" }}
          >
            Protecting People.<br />Securing Futures.
          </p>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            Centralised management for operations, workforce, finance, and client records — built for Direct Guard Limited.
          </p>
        </div>

        {/* Footer */}
        <p className="text-white/20 text-xs">
          © {new Date().getFullYear()} Direct Guard Limited. All rights reserved.
        </p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div
            className="lg:hidden flex items-center justify-center rounded-2xl px-8 py-5 mb-8"
            style={{ background: "#1a1f3c" }}
          >
            <img src={dgLogoUrl} alt="Direct Guard Limited" className="w-48" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-8">Sign in to the Direct Guard system</p>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
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
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ "--tw-ring-color": "#EEA135" } as React.CSSProperties}
                onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px #EEA13530, 0 0 0 1px #EEA135")}
                onBlur={(e) => (e.currentTarget.style.boxShadow = "")}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none transition"
                onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px #EEA13530, 0 0 0 1px #EEA135")}
                onBlur={(e) => (e.currentTarget.style.boxShadow = "")}
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-gray-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
                style={{ accentColor: "#EEA135" }}
              />
              Remember my email on this device
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 transition-opacity"
              style={{ background: isSubmitting ? "#c8852a" : "#EEA135" }}
              onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.background = "#c8852a")}
              onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.background = "#EEA135")}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
