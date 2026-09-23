import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ToastProvider } from "../../contexts/ToastContext";
import { ConfirmDialogProvider } from "../../contexts/ConfirmDialogContext";

/** Wraps <Outlet /> so every route change triggers a scale+fade transition. */
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-magen-green border-t-transparent animate-spin" />
          <span className="text-sm text-gray-400">Loading…</span>
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
        <div className="flex h-screen bg-gray-50">
          <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
          <div className="flex-1 flex flex-col min-w-0">
            <Header onMenuClick={() => setMobileNavOpen(true)} />
            <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto overflow-x-hidden">
              <AnimatedOutlet />
            </main>
          </div>
        </div>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
