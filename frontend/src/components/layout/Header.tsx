import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../api/client";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface EmployeeHit { id: string; fullName: string; position: string | null; photoFilename: string | null }
interface ClientHit { id: string; name: string; location: string | null }
interface SiteHit { id: string; siteName: string; location: string | null }

interface SearchResults {
  employees: EmployeeHit[];
  clients: ClientHit[];
  sites: SiteHit[];
}

const EMPTY_RESULTS: SearchResults = { employees: [], clients: [], sites: [] };
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const RESULTS_PER_CATEGORY = 5;

/** Small photo thumbnail for an employee search hit, for quick recognition. */
function ResultAvatar({ employee }: { employee: EmployeeHit }) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const loadPhoto = useCallback(async () => {
    if (!employee.photoFilename) { setPhotoSrc(null); return; }
    try {
      const res = await api.get(`/employees/${employee.id}/photo`, { responseType: "blob" });
      setPhotoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(res.data as Blob);
      });
      setImgError(false);
    } catch {
      setImgError(true);
    }
  }, [employee.id, employee.photoFilename]);

  useEffect(() => {
    loadPhoto();
    return () => {
      setPhotoSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return prev; });
    };
  }, [loadPhoto]);

  const showPhoto = employee.photoFilename && photoSrc && !imgError;

  return (
    <div className="w-7 h-7 rounded-full bg-magen-green-light text-magen-green-dark text-[10px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
      {showPhoto ? (
        <img src={photoSrc} alt={employee.fullName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        initials(employee.fullName)
      )}
    </div>
  );
}

/**
 * Top header bar -- did not exist at all before this (2026-09-14).
 * Global search (2026-09-24): searches Employees, Clients, and Sites in
 * parallel via their existing `?search=` list filters (the only three
 * modules with server-side text search today -- Invoices/Contracts/etc.
 * don't support it yet, so they're left out of this pass rather than
 * silently returning nothing useful). Clicking a result navigates to that
 * module's list page as `?q=<term>`, which that page picks up on mount and
 * runs through its own existing search box -- see the matching `useEffect`
 * in EmployeesPage/ClientsPage/SitesPage. A user without permission to view
 * a given module (403) just gets an empty section for it, not an error.
 * Alerts icon links to the existing /alerts page rather than showing a
 * live unread count, since that would need a dedicated "unread count"
 * concept the Alerts API doesn't have (GET /api/alerts today just returns
 * everything currently true, with no read/unread state to count).
 */
interface HeaderProps {
  /** Opens the mobile sidebar drawer. The hamburger button that calls this only renders below the md breakpoint. */
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const params = { search: trimmed, pageSize: RESULTS_PER_CATEGORY, page: 1 };
      const [employeesRes, clientsRes, sitesRes] = await Promise.all([
        api.get("/employees", { params }).catch(() => null),
        api.get("/clients", { params }).catch(() => null),
        api.get("/sites", { params }).catch(() => null),
      ]);
      setResults({
        employees: employeesRes?.data.data ?? [],
        clients: clientsRes?.data.data ?? [],
        sites: sitesRes?.data.data ?? [],
      });
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const totalResults = results.employees.length + results.clients.length + results.sites.length;
  const showDropdown = isOpen && query.trim().length >= MIN_QUERY_LENGTH;

  function goTo(path: string) {
    navigate(`${path}?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
    setIsOpen(false);
  }

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

        <div className="relative w-full max-w-80 hidden sm:block" ref={searchBoxRef}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees, clients, sites..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-magen-green/40 focus:bg-white"
          />

          {showDropdown && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
              {isSearching ? (
                <div className="px-3 py-3 text-sm text-gray-400">Searching...</div>
              ) : totalResults === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400">No matches for "{query.trim()}"</div>
              ) : (
                <>
                  {results.employees.length > 0 && (
                    <div className="py-1.5">
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Employees</div>
                      {results.employees.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => goTo("/employees")}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                        >
                          <ResultAvatar employee={e} />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{e.fullName}</div>
                            <div className="text-xs text-gray-400 truncate">{e.position ?? "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.clients.length > 0 && (
                    <div className="py-1.5 border-t border-gray-100">
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Clients</div>
                      {results.clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goTo("/clients")}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{c.name}</div>
                            {c.location && <div className="text-xs text-gray-400 truncate">{c.location}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.sites.length > 0 && (
                    <div className="py-1.5 border-t border-gray-100">
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sites</div>
                      {results.sites.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => goTo("/sites")}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{s.siteName}</div>
                            {s.location && <div className="text-xs text-gray-400 truncate">{s.location}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
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
