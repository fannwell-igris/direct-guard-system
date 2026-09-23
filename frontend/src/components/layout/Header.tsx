import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Top header bar -- did not exist at all before this (2026-09-14).
 * Search is presentational only for now (no backend search endpoint
 * exists across modules yet -- wiring this up is a separate, larger
 * feature, not part of this visual pass). Alerts icon links to the
 * existing /alerts page rather than showing a live unread count, since
 * that would need a dedicated "unread count" concept the Alerts API
 * doesn't have (GET /api/alerts today just returns everything currently
 * true, with no read/unread state to count).
 */
interface HeaderProps {
  /** Opens the mobile sidebar drawer. The hamburger button that calls this only renders below the md breakpoint. */
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 gap-3 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onMenuClick}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-magen-navy flex-shrink-0 md:hidden"
          title="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="relative w-full max-w-80 hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            disabled
            title="Search isn't wired up to any endpoint yet"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-400 placeholder:text-gray-400 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <Link
          to="/alerts"
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-magen-navy"
          title="Alerts"
        >
          <Bell size={18} />
        </Link>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100"
          >
            <div className="w-8 h-8 rounded-full bg-magen-navy text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {user ? initials(user.fullName) : "?"}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium text-gray-900 leading-tight">{user?.fullName ?? "..."}</div>
              <div className="text-xs text-gray-400 leading-tight">{user?.role ?? ""}</div>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-sm font-medium text-gray-900 truncate">{user?.fullName}</div>
                <div className="text-xs text-gray-400 truncate">{user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
