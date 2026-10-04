import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import dgLogoUrl from "../../assets/dg-logo.svg";
import {
  LayoutDashboard, ChevronDown, ChevronLeft, ChevronRight, X,
  Bell, Activity, Building2, MapPin, Users, FileText, CalendarDays,
  ClipboardList, CheckSquare, Inbox, Wallet, Receipt, DollarSign,
  Package, UserCog, Settings as SettingsIcon, TrendingUp, MessageSquare,
  UserCheck, Target, ClipboardCheck, LayoutGrid, Navigation, Flag, BarChart3,
  PiggyBank, CalendarRange,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavGroup {
  label: string;
  roles?: string[];
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Alerts", to: "/alerts", icon: Bell },
      { label: "Site Coverage", to: "/site-coverage", icon: Activity },
      { label: "Messages", to: "/messages", icon: MessageSquare },
    ],
  },
  {
    label: "Workforce",
    roles: ["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL", "MARKETING"],
    items: [
      { label: "Clients", to: "/clients", icon: Building2 },
      { label: "Sites", to: "/sites", icon: MapPin },
      { label: "Employees", to: "/employees", icon: Users },
      { label: "Contracts", to: "/contracts", icon: FileText },
      { label: "Roster", to: "/roster", icon: CalendarDays },
    ],
  },
  {
    label: "Operations",
    roles: ["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL"],
    items: [
      { label: "Operations Records", to: "/operations", icon: ClipboardList },
      { label: "Weekly Plans", to: "/operations/weekly-plans", icon: CalendarRange },
      { label: "Attendance Calendar", to: "/operations/calendar", icon: CalendarDays },
      { label: "Field Receipts", to: "/operations/field-receipts", icon: Receipt },
      { label: "Deployment", to: "/deployment", icon: UserCheck },
      { label: "Inventory & Assets", to: "/inventory", icon: Package },
      { label: "Tasks", to: "/tasks", icon: CheckSquare },
      { label: "Department Requests", to: "/department-requests", icon: Inbox },
      { label: "Department Budgets", to: "/department-budgets", icon: PiggyBank },
    ],
  },
  {
    label: "Marketing",
    roles: ["ADMIN", "MANAGER", "MARKETING"],
    items: [
      { label: "Dashboard", to: "/marketing/dashboard", icon: LayoutGrid },
      { label: "Prospects", to: "/marketing/prospects", icon: Target },
      { label: "Activities", to: "/marketing/activities", icon: ClipboardCheck },
      { label: "Field Visits", to: "/marketing/field-visits", icon: Navigation },
      { label: "Tasks", to: "/tasks", icon: CheckSquare },
      { label: "Targets", to: "/marketing/targets", icon: Flag },
      { label: "Requests", to: "/department-requests", icon: Inbox },
      { label: "Budgets", to: "/department-budgets", icon: PiggyBank },
      { label: "Expenses", to: "/marketing/expenses", icon: DollarSign },
      { label: "Reports", to: "/marketing/reports", icon: FileText },
      { label: "Management View", to: "/marketing/management", icon: BarChart3 },
    ],
  },
  {
    label: "Finance",
    roles: ["ADMIN", "MANAGER", "PAYROLL"],
    items: [
      { label: "Finance Overview", to: "/finance", icon: TrendingUp },
      { label: "Department Budgets", to: "/department-budgets", icon: PiggyBank },
      { label: "Payroll", to: "/payroll", icon: Wallet },
      { label: "Salary Advances", to: "/finance/salary-advances", icon: ClipboardList },
      { label: "Invoices & Payments", to: "/invoices", icon: Receipt },
      { label: "Quotations", to: "/quotations", icon: FileText },
      { label: "Expenses & Costs", to: "/expenses", icon: DollarSign },
      { label: "Inventory & Assets", to: "/inventory", icon: Package },
    ],
  },
  {
    label: "Admin",
    roles: ["ADMIN"],
    items: [
      { label: "Users & Roles", to: "/users", icon: UserCog },
      { label: "Departments", to: "/departments", icon: Building2 },
      { label: "Settings", to: "/settings", icon: SettingsIcon },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = "dg_sidebar_collapsed";
const GROUPS_STORAGE_KEY   = "dg_sidebar_groups";

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const [railCollapsed, setRailCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, String(railCollapsed));
  }, [railCollapsed]);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveCollapsed = railCollapsed && !isMobile;

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    const defaults: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => { defaults[g.label] = true; });
    return defaults;
  });

  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) =>
      g.items.some((item) => location.pathname === item.to)
    );
    if (activeGroup) {
      setCollapsedGroups(() => {
        const next: Record<string, boolean> = {};
        NAV_GROUPS.forEach((g) => { next[g.label] = g.label !== activeGroup.label; });
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const isCurrentlyCollapsed = prev[label] ?? true;
      if (isCurrentlyCollapsed) {
        const next: Record<string, boolean> = {};
        NAV_GROUPS.forEach((g) => { next[g.label] = g.label !== label; });
        return next;
      }
      return { ...prev, [label]: true };
    });
  }

  const isDashboardActive = location.pathname === "/dashboard";
  const visibleGroups = NAV_GROUPS.filter((g) => !g.roles || g.roles.includes(role));

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(4,6,14,0.7)", backdropFilter: "blur(2px)" }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <nav
        className={cn(
          "flex flex-col overflow-y-auto overflow-x-hidden transition-all duration-200 flex-shrink-0",
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full",
          mobileOpen && "translate-x-0",
          "md:static md:inset-auto md:h-full md:translate-x-0",
          effectiveCollapsed ? "md:w-[62px]" : "md:w-56"
        )}
        style={{ background: "#080C18", borderRight: "1px solid #111A2C" }}
      >
        {/* ── Logo row ───────────────────────────────────────── */}
        <div
          className={cn(
            "flex items-center h-[60px] flex-shrink-0 px-4",
            effectiveCollapsed ? "md:justify-center md:px-0" : "justify-between"
          )}
          style={{ borderBottom: "1px solid #111A2C" }}
        >
          {!effectiveCollapsed && (
            <img
              src={dgLogoUrl}
              alt="Direct Guard"
              className="h-7 w-auto object-contain"
            />
          )}

          {/* Mobile close */}
          <button
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "#4A5E7A" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#E2EAF8"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4A5E7A"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title="Close menu"
          >
            <X size={16} />
          </button>

          {/* Desktop toggle */}
          <button
            onClick={() => setRailCollapsed((v) => !v)}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded-lg transition-colors flex-shrink-0"
            style={{ color: "#4A5E7A" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#E2EAF8"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4A5E7A"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {railCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* ── Navigation ─────────────────────────────────────── */}
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">

          {/* Dashboard — always first */}
          <NavLink
            to="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            isActive={isDashboardActive}
            collapsed={effectiveCollapsed}
          />

          {/* Section divider */}
          {!effectiveCollapsed && (
            <div className="pt-2 pb-1 px-1">
              <div style={{ height: 1, background: "#111A2C" }} />
            </div>
          )}
          {effectiveCollapsed && <div className="py-1.5" />}

          {/* Groups */}
          {visibleGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups[group.label] ?? true;
            return (
              <div key={group.label}>
                {/* Group header */}
                {!effectiveCollapsed ? (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors group"
                    style={{ color: "#3E4F6E" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#7B8CB0")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#3E4F6E")}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {group.label}
                    </span>
                    <ChevronDown
                      size={11}
                      className={cn("transition-transform duration-150", isGroupCollapsed && "-rotate-90")}
                    />
                  </button>
                ) : (
                  /* Collapsed: tiny divider between groups */
                  <div className="py-1 px-2">
                    <div style={{ height: 1, background: "#111A2C" }} />
                  </div>
                )}

                {/* Group items */}
                {(effectiveCollapsed || !isGroupCollapsed) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        icon={item.icon}
                        isActive={location.pathname === item.to}
                        collapsed={effectiveCollapsed}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Bottom spacer ──────────────────────────────────── */}
        <div style={{ height: 12 }} />
      </nav>
    </>
  );
}

/* ─── NavLink ──────────────────────────────────────────────────── */
interface NavLinkProps {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  collapsed: boolean;
}

function NavLink({ to, label, icon: Icon, isActive, collapsed }: NavLinkProps) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center gap-2.5 py-2 text-sm rounded-lg transition-all duration-100 select-none",
        collapsed ? "justify-center px-0 mx-0.5" : "px-3"
      )}
      style={
        isActive
          ? {
              background: "rgba(240,168,48,0.10)",
              color: "#F0A830",
            }
          : {
              color: "#5B7090",
            }
      }
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLAnchorElement).style.color = "#A8BEDC";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
          (e.currentTarget as HTMLAnchorElement).style.color = "#5B7090";
        }
      }}
    >
      {/* Active left accent bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full"
          style={{ height: "60%", background: "#F0A830" }}
        />
      )}
      <Icon size={15} />
      {!collapsed && <span className={cn("truncate font-medium", isActive ? "" : "font-normal")}>{label}</span>}
    </Link>
  );
}
