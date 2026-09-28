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

// Present only inside the Android app's WebView (see mobile/android's
// MainActivity.kt) — undefined on the plain website and in the desktop
// app, so every call below is guarded and a complete no-op there.
declare global {
  interface Window {
    AndroidNative?: {
      onLoggedIn?: (token: string) => void;
      onLoggedOut?: () => void;
    };
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

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
    // Lets the Android app register this device for push notifications
    // right at login, since its WebView doesn't reload the page here to
    // notice the new token any other way. No-op on web/desktop.
    window.AndroidNative?.onLoggedIn?.(newToken);
  };

  const logout = () => {
    localStorage.removeItem("cms_token");
    localStorage.removeItem("cms_user");
    setToken(null);
    setUser(null);
    // Stops push notifications to this device before the user (and
    // possibly a different one next) navigates to /login. No-op on
    // web/desktop.
    window.AndroidNative?.onLoggedOut?.();
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

