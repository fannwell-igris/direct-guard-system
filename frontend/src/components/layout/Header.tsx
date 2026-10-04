import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, LogOut, Menu, User } from "lucide-react";
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
    <div
      className="w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ background: "#1A2840", color: "#F0A830" }}
    >
      {showPhoto ? (
        <img src={photoSrc} alt={employee.fullName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        initials(employee.fullName)
      )}
    </div>
  );
}

interface HeaderProps {
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

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrator",
    MANAGER: "Manager",
    OPERATIONS: "Operations",
    HR: "HR",
    PAYROLL: "Payroll",
    MARKETING: "Marketing",
    STAFF: "Staff",
  };

  return (
    <header
      className="h-[60px] flex items-center justify-between px-4 gap-4 flex-shrink-0"
      style={{
        background: "#0A0E1C",
        borderBottom: "1px solid #111A2C",
      }}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
          style={{ color: "#4A5E7A" }}
          title="Open menu"
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative w-full max-w-72 hidden sm:block" ref={searchBoxRef}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#3E4F6E" }} />
          <input
            type="text"
            placeholder="Search employees, clients, sites…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg transition-all"
            style={{
              background: "#0D1526",
              border: "1px solid #1C2A42",
              color: "#E2EAF8",
              outline: "none",
            }}
            onFocusCapture={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#F0A830";
              (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(240,168,48,0.12)";
            }}
            onBlurCapture={(e) => {
              (e.target as HTMLInputElement).style.borderColor = "#1C2A42";
              (e.target as HTMLInputElement).style.boxShadow = "none";
            }}
          />

          {showDropdown && (
            <div
              className="absolute left-0 right-0 mt-1.5 rounded-xl max-h-96 overflow-y-auto z-50"
              style={{
                background: "#0D1526",
                border: "1px solid #1C2A42",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              }}
            >
              {isSearching ? (
                <div className="px-4 py-3 text-sm" style={{ color: "#7B8CB0" }}>Searching…</div>
              ) : totalResults === 0 ? (
                <div className="px-4 py-3 text-sm" style={{ color: "#7B8CB0" }}>No matches for "{query.trim()}"</div>
              ) : (
                <>
                  {results.employees.length > 0 && (
                    <div className="py-2">
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#3E4F6E" }}>Employees</div>
                      {results.employees.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => goTo("/employees")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left transition-colors"
                          style={{ color: "#CBD5E8" }}
                          onMouseEnter={(el) => (el.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <ResultAvatar employee={e} />
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#E2EAF8" }}>{e.fullName}</div>
                            <div className="text-xs truncate" style={{ color: "#7B8CB0" }}>{e.position ?? "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.clients.length > 0 && (
                    <div className="py-2" style={{ borderTop: "1px solid #1C2A42" }}>
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#3E4F6E" }}>Clients</div>
                      {results.clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goTo("/clients")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left transition-colors"
                          style={{ color: "#CBD5E8" }}
                          onMouseEnter={(el) => (el.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#E2EAF8" }}>{c.name}</div>
                            {c.location && <div className="text-xs truncate" style={{ color: "#7B8CB0" }}>{c.location}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.sites.length > 0 && (
                    <div className="py-2" style={{ borderTop: "1px solid #1C2A42" }}>
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#3E4F6E" }}>Sites</div>
                      {results.sites.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => goTo("/sites")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left transition-colors"
                          style={{ color: "#CBD5E8" }}
                          onMouseEnter={(el) => (el.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#E2EAF8" }}>{s.siteName}</div>
                            {s.location && <div className="text-xs truncate" style={{ color: "#7B8CB0" }}>{s.location}</div>}
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

      {/* Right: bell + user */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Link
          to="/alerts"
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "#4A5E7A" }}
          title="Alerts"
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#E2EAF8"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#4A5E7A"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
        >
          <Bell size={17} />
        </Link>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#E2EAF8" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: "#1A2840", color: "#F0A830", border: "1px solid #243350" }}
            >
              {user ? initials(user.fullName) : <User size={13} />}
            </div>
            <div className="text-left hidden sm:block leading-none">
              <div className="text-sm font-medium leading-tight" style={{ color: "#E2EAF8" }}>
                {user?.fullName ?? "…"}
              </div>
              <div className="text-[11px] leading-tight mt-0.5" style={{ color: "#7B8CB0" }}>
                {roleLabel[user?.role ?? ""] ?? user?.role ?? ""}
              </div>
            </div>
            <ChevronDown size={13} style={{ color: "#4A5E7A" }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1.5 w-52 rounded-xl py-1.5 z-50"
              style={{
                background: "#0D1526",
                border: "1px solid #1C2A42",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              }}
            >
              {/* User info */}
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #1C2A42" }}>
                <div className="text-sm font-semibold truncate" style={{ color: "#E2EAF8" }}>
                  {user?.fullName}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: "#7B8CB0" }}>
                  {user?.email}
                </div>
              </div>
              {/* Logout */}
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors mt-0.5"
                style={{ color: "#F87171" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
