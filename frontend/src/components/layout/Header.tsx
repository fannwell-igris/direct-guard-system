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
interface ClientHit   { id: string; name: string; location: string | null }
interface SiteHit     { id: string; siteName: string; location: string | null }

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
    return () => { setPhotoSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return prev; }); };
  }, [loadPhoto]);

  const showPhoto = employee.photoFilename && photoSrc && !imgError;

  return (
    <div
      className="w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ background: "#FFF7E6", color: "#B45309" }}
    >
      {showPhoto
        ? <img src={photoSrc} alt={employee.fullName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        : initials(employee.fullName)
      }
    </div>
  );
}

interface HeaderProps { onMenuClick: () => void }

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
        api.get("/clients",   { params }).catch(() => null),
        api.get("/sites",     { params }).catch(() => null),
      ]);
      setResults({
        employees: employeesRes?.data.data ?? [],
        clients:   clientsRes?.data.data   ?? [],
        sites:     sitesRes?.data.data     ?? [],
      });
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const totalResults = results.employees.length + results.clients.length + results.sites.length;
  const showDropdown  = isOpen && query.trim().length >= MIN_QUERY_LENGTH;

  function goTo(path: string) {
    navigate(`${path}?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
    setIsOpen(false);
  }

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrator", MANAGER: "Manager", OPERATIONS: "Operations",
    HR: "HR", PAYROLL: "Payroll", MARKETING: "Marketing", STAFF: "Staff",
  };

  return (
    <header
      className="h-[60px] flex items-center justify-between px-4 gap-4 flex-shrink-0"
      style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ color: "#6B7280" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative w-full max-w-72 hidden sm:block" ref={searchBoxRef}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder="Search employees, clients, sites…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg transition-all outline-none"
            style={{
              background: "#F9FAFB",
              border: "1px solid #E5E7EB",
              color: "#111827",
            }}
            onFocusCapture={(e) => {
              (e.target as HTMLInputElement).style.background = "#FFFFFF";
              (e.target as HTMLInputElement).style.borderColor = "#F0A830";
              (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(240,168,48,0.12)";
            }}
            onBlurCapture={(e) => {
              (e.target as HTMLInputElement).style.background = "#F9FAFB";
              (e.target as HTMLInputElement).style.borderColor = "#E5E7EB";
              (e.target as HTMLInputElement).style.boxShadow = "none";
            }}
          />

          {showDropdown && (
            <div
              className="absolute left-0 right-0 mt-1.5 rounded-xl max-h-96 overflow-y-auto z-50"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              }}
            >
              {isSearching ? (
                <div className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>Searching…</div>
              ) : totalResults === 0 ? (
                <div className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>No matches for "{query.trim()}"</div>
              ) : (
                <>
                  {results.employees.length > 0 && (
                    <div className="py-2">
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Employees</div>
                      {results.employees.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => goTo("/employees")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left"
                          onMouseEnter={(el) => (el.currentTarget.style.background = "#FFFBEB")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <ResultAvatar employee={e} />
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#111827" }}>{e.fullName}</div>
                            <div className="text-xs truncate" style={{ color: "#6B7280" }}>{e.position ?? "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.clients.length > 0 && (
                    <div className="py-2" style={{ borderTop: "1px solid #F3F4F6" }}>
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Clients</div>
                      {results.clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => goTo("/clients")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left"
                          onMouseEnter={(el) => (el.currentTarget.style.background = "#FFFBEB")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#111827" }}>{c.name}</div>
                            {c.location && <div className="text-xs truncate" style={{ color: "#6B7280" }}>{c.location}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.sites.length > 0 && (
                    <div className="py-2" style={{ borderTop: "1px solid #F3F4F6" }}>
                      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Sites</div>
                      {results.sites.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => goTo("/sites")}
                          className="w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left"
                          onMouseEnter={(el) => (el.currentTarget.style.background = "#FFFBEB")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium" style={{ color: "#111827" }}>{s.siteName}</div>
                            {s.location && <div className="text-xs truncate" style={{ color: "#6B7280" }}>{s.location}</div>}
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

      {/* Right */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Link
          to="/alerts"
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "#6B7280" }}
          title="Alerts"
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#111827"; (e.currentTarget as HTMLAnchorElement).style.background = "#F9FAFB"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#6B7280"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
        >
          <Bell size={17} />
        </Link>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#111827" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
              style={{ background: "#F0A830", color: "#FFFFFF" }}
            >
              {user ? initials(user.fullName) : <User size={13} />}
            </div>
            <div className="text-left hidden sm:block leading-none">
              <div className="text-sm font-semibold leading-tight" style={{ color: "#111827" }}>
                {user?.fullName ?? "…"}
              </div>
              <div className="text-[11px] leading-tight mt-0.5" style={{ color: "#6B7280" }}>
                {roleLabel[user?.role ?? ""] ?? user?.role ?? ""}
              </div>
            </div>
            <ChevronDown size={13} style={{ color: "#9CA3AF" }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1.5 w-52 rounded-xl py-1.5 z-50"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              }}
            >
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #F3F4F6" }}>
                <div className="text-sm font-semibold truncate" style={{ color: "#111827" }}>
                  {user?.fullName}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: "#6B7280" }}>
                  {user?.email}
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm mt-0.5"
                style={{ color: "#DC2626" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
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
