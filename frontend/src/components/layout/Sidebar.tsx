import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ChevronDown, ChevronLeft, ChevronRight, X,
  Bell, Activity, Building2, MapPin, Users, FileText, CalendarDays,
  ClipboardList, CheckSquare, Inbox, Wallet, Receipt, DollarSign,
  Package, UserCog, Settings as SettingsIcon, TrendingUp, MessageSquare,
  UserCheck, Target, ClipboardCheck, LayoutGrid, Navigation, Flag, BarChart3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number }>;
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
      { label: "Attendance Calendar", to: "/operations/calendar", icon: CalendarDays },
      { label: "Deployment", to: "/deployment", icon: UserCheck },
      { label: "Tasks", to: "/tasks", icon: CheckSquare },
      { label: "Department Requests", to: "/department-requests", icon: Inbox },
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
      { label: "Payroll", to: "/payroll", icon: Wallet },
      { label: "Invoices & Payments", to: "/invoices", icon: Receipt },
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

const COLLAPSE_STORAGE_KEY = "cms_sidebar_collapsed";
const GROUPS_STORAGE_KEY = "cms_sidebar_groups";

interface SidebarProps {
  /** On phone/tablet widths the sidebar is an off-canvas drawer — this controls whether it's open. Ignored at md+ widths, where it's always visible. */
  mobileOpen: boolean;
  /** Called when the drawer should close (backdrop tap, nav link tap, or Escape) — mobile only. */
  onCloseMobile: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  // Close the mobile drawer automatically whenever the route changes, so
  // tapping a nav link takes you to the page instead of leaving the menu
  // open over it.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Rail collapsed — default true (icon-only rail). This is a desktop-only
  // preference; on phone/tablet the drawer always shows full labels
  // regardless of this setting (see `effectiveCollapsed` below) — an
  // icon-only sidebar makes no sense inside a full-width mobile drawer.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, String(railCollapsed));
  }, [railCollapsed]);

  // Track whether we're below the md breakpoint (Tailwind's md = 768px) so
  // the collapse/expand behavior can differ between the desktop rail and
  // the mobile drawer, in JS (needed for layout branching, not just CSS).
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveCollapsed = railCollapsed && !isMobile;

  // All groups collapsed by default
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    const defaults: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => { defaults[g.label] = true; });
    return defaults;
  });

  // Accordion: only the group containing the active page stays open —
  // navigating into a different group auto-closes whichever one was open
  // before, instead of every visited group staying expanded forever.
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

  // Same accordion rule for a manual click: opening a group closes every
  // other one; clicking the already-open group just closes it.
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
      {/* Mobile backdrop — tapping it closes the drawer. Desktop never renders this. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <nav
        className={cn(
          "py-4 overflow-y-auto transition-all duration-200 flex flex-col bg-magen-navy",
          // Mobile: fixed off-canvas drawer, slides in/out over the page.
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full",
          mobileOpen && "translate-x-0",
          // Desktop (md+): back to the normal static rail in the flex layout.
          "md:static md:inset-auto md:h-full md:flex-shrink-0 md:translate-x-0",
          effectiveCollapsed ? "md:w-16" : "md:w-56"
        )}
      >
        {/* Logo + close (mobile) / collapse toggle (desktop) */}
        <div className={cn("flex items-center mb-6 px-4 justify-between", effectiveCollapsed && "md:justify-center md:px-2")}>
          <div className={cn("text-white font-bold text-sm tracking-wide", effectiveCollapsed && "md:hidden")}>
            MAGEN SECURITY SYSTEM
          </div>
          {/* Mobile: closes the drawer */}
          <button
            onClick={onCloseMobile}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white flex-shrink-0 transition-colors md:hidden"
            title="Close menu"
          >
            <X size={16} />
          </button>
          {/* Desktop: collapses/expands the rail */}
          <button
            onClick={() => setRailCollapsed((v) => !v)}
            className="hidden md:flex w-7 h-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white flex-shrink-0 transition-colors"
            title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {railCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

      {/* Dashboard */}
      <ul className="space-y-0.5 mb-2 px-1.5">
        <li>
          <Link
            to="/dashboard"
            title="Dashboard"
            className={cn(
              "flex items-center gap-2 py-2 text-sm rounded-lg font-medium transition-colors",
              effectiveCollapsed ? "justify-center px-2" : "px-3",
              isDashboardActive
                ? "bg-magen-green text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <LayoutDashboard size={16} />
            {!effectiveCollapsed && "Dashboard"}
          </Link>
        </li>
      </ul>

      {/* Nav groups */}
      {visibleGroups.map((group) => {
        const isGroupCollapsed = collapsedGroups[group.label] ?? true;
        return (
          <div key={group.label} className="mb-0.5 px-1.5">
            {!effectiveCollapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors"
              >
                {group.label}
                <ChevronDown
                  size={12}
                  className={cn("transition-transform duration-150", isGroupCollapsed && "-rotate-90")}
                />
              </button>
            )}
            {(effectiveCollapsed || !isGroupCollapsed) && (
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        title={item.label}
                        className={cn(
                          "flex items-center gap-2.5 py-2 text-sm rounded-lg transition-colors",
                          effectiveCollapsed ? "justify-center px-2" : "px-3",
                          isActive
                            ? "bg-magen-green text-white font-medium"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Icon size={16} />
                        {!effectiveCollapsed && item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

        {/* Spacer */}
        <div className="flex-1" />
      </nav>
    </>
  );
}
