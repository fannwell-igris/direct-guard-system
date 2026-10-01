import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import api from "@/api/client";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// Injected by MainActivity.kt into the WebView via addJavascriptInterface().
// Undefined on the plain website and in the Electron desktop app, so every
// call below is guarded and a complete no-op there.
declare global {
  interface Window {
    MagenBridge?: {
      getFcmToken: () => string;
      getPlatform: () => string;
    };
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

// ------------------------------------------------------------------ //
// Push-token helpers (no-ops outside the Android WebView)
// ------------------------------------------------------------------ //

/**
 * Registers this device's FCM token with the backend so the server can
 * send push notifications to it. Called after a successful login and on
 * startup when a stored session is restored.
 *
 * Works only inside the Android WebView (where window.MagenBridge is
 * present). Silently no-ops on the web browser and the Electron desktop
 * app, since those don't receive push notifications from FCM.
 */
async function registerFcmToken(): Promise<void> {
  const fcmToken = window.MagenBridge?.getFcmToken?.();
  if (!fcmToken) return;           // Not in Android app, or token not ready yet
  try {
    await api.post("/push-tokens", { token: fcmToken, platform: "android" });
  } catch {
    // Non-critical — if the backend call fails the user still logs in.
    // The token will be re-attempted on the next login.
  }
}

/**
 * Unregisters this device's FCM token on logout, so the backend stops
 * sending push notifications to a device that is no longer logged in.
 */
async function unregisterFcmToken(): Promise<void> {
  const fcmToken = window.MagenBridge?.getFcmToken?.();
  if (!fcmToken) return;
  try {
    await api.delete("/push-tokens", { data: { token: fcmToken } });
  } catch {
    // Non-critical.
  }
}

// ------------------------------------------------------------------ //

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("cms_token");
    const storedUser = localStorage.getItem("cms_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      // Re-register the FCM token on every startup so the backend always
      // has a current token for this device, even after FCM rotates it.
      registerFcmToken();
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { token: newToken, user: newUser } = res.data.data;
    localStorage.setItem("cms_token", newToken);
    localStorage.setItem("cms_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    // Register push token after login so the backend can send alerts to
    // this device. No-op outside the Android app.
    registerFcmToken();
  };

  const logout = () => {
    // Unregister before clearing credentials so the API call can still
    // carry the auth token (api client reads from localStorage).
    unregisterFcmToken();
    localStorage.removeItem("cms_token");
    localStorage.removeItem("cms_user");
    setToken(null);
    setUser(null);
    // No window.location.href redirect here — AppLayout's route guard
    // (<Navigate to="/login">) handles the redirect automatically once
    // `user` is null. Using window.location caused a full page reload
    // in the Electron desktop app, breaking logout there.
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
