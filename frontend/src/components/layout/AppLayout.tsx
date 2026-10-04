import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ToastProvider } from "../../contexts/ToastContext";
import { ConfirmDialogProvider } from "../../contexts/ConfirmDialogContext";

function AnimatedOutlet() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-transition">
      <Outlet />
    </div>
  );
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#070912" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#1C2A42", borderTopColor: "#F0A830" }}
          />
          <span className="text-sm" style={{ color: "#7B8CB0" }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <div className="flex h-screen" style={{ background: "#070912" }}>
          <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
          <div className="flex-1 flex flex-col min-w-0">
            <Header onMenuClick={() => setMobileNavOpen(true)} />
            <main
              className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden"
              style={{ background: "#070912" }}
            >
              <AnimatedOutlet />
            </main>
          </div>
        </div>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
