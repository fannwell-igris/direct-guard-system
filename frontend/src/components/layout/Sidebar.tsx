import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import dgLogoUrl from "../../assets/dg-logo.svg";
import {
  LayoutDashboard, X,
  Bell, Activity, Building2, MapPin, Users, FileText, CalendarDays,
  ClipboardList, CheckSquare, Inbox, Wallet, Receipt, DollarSign,
  Package, UserCog, Settings as SettingsIcon, TrendingUp, MessageSquare,
  UserCheck, Target, ClipboardCheck, LayoutGrid, Navigation, Flag, BarChart3,
  PiggyBank, CalendarRange, Shield,
} from "lucide-react";
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
      { label: "Alerts",        to: "/alerts",        icon: Bell },
      { label: "Site Coverage", to: "/site-coverage", icon: Activity },
      { label: "Messages",      to: "/messages",      icon: MessageSquare },
    ],
  },
  {
    label: "Workforce",
    roles: ["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL", "MARKETING"],
    items: [
      { label: "Clients",   to: "/clients",   icon: Building2 },
      { label: "Sites",     to: "/sites",     icon: MapPin },
      { label: "Employees", to: "/employees", icon: Users },
      { label: "Contracts", to: "/contracts", icon: FileText },
      { label: "Roster",    to: "/roster",    icon: CalendarDays },
    ],
  },
  {
    label: "Operations",
    roles: ["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL"],
    items: [
      { label: "Operations Records",   to: "/operations",                icon: ClipboardList },
      { label: "Weekly Plans",         to: "/operations/weekly-plans",   icon: CalendarRange },
      { label: "Attendance Calendar",  to: "/operations/calendar",       icon: CalendarDays },
      { label: "Field Receipts",       to: "/operations/field-receipts", icon: Receipt },
      { label: "Deployment",           to: "/deployment",                icon: UserCheck },
      { label: "Inventory & Assets",   to: "/inventory",                 icon: Package },
      { label: "Tasks",                to: "/tasks",                     icon: CheckSquare },
      { label: "Department Requests",  to: "/department-requests",       icon: Inbox },
      { label: "Department Budgets",   to: "/department-budgets",        icon: PiggyBank },
    ],
  },
  {
    label: "Marketing",
    roles: ["ADMIN", "MANAGER", "MARKETING"],
    items: [
      { label: "Dashboard",       to: "/marketing/dashboard",    icon: LayoutGrid },
      { label: "Prospects",       to: "/marketing/prospects",    icon: Target },
      { label: "Activities",      to: "/marketing/activities",   icon: ClipboardCheck },
      { label: "Field Visits",    to: "/marketing/field-visits", icon: Navigation },
      { label: "Tasks",           to: "/tasks",                  icon: CheckSquare },
      { label: "Targets",         to: "/marketing/targets",      icon: Flag },
      { label: "Requests",        to: "/department-requests",    icon: Inbox },
      { label: "Budgets",         to: "/department-budgets",     icon: PiggyBank },
      { label: "Expenses",        to: "/marketing/expenses",     icon: DollarSign },
      { label: "Reports",         to: "/marketing/reports",      icon: FileText },
      { label: "Management View", to: "/marketing/management",   icon: BarChart3 },
    ],
  },
  {
    label: "Finance",
    roles: ["ADMIN", "MANAGER", "PAYROLL"],
    items: [
      { label: "Finance Overview",     to: "/finance",                 icon: TrendingUp },
      { label: "Department Budgets",   to: "/department-budgets",      icon: PiggyBank },
      { label: "Payroll",              to: "/payroll",                 icon: Wallet },
      { label: "Salary Advances",      to: "/finance/salary-advances", icon: ClipboardList },
      { label: "Invoices & Payments",  to: "/invoices",                icon: Receipt },
      { label: "Quotations",           to: "/quotations",              icon: FileText },
      { label: "Expenses & Costs",     to: "/expenses",                icon: DollarSign },
      { label: "Inventory & Assets",   to: "/inventory",               icon: Package },
    ],
  },
  {
    label: "Admin",
    roles: ["ADMIN"],
    items: [
      { label: "Users & Roles", to: "/users",       icon: UserCog },
      { label: "Departments",   to: "/departments", icon: Building2 },
      { label: "Settings",      to: "/settings",    icon: SettingsIcon },
    ],
  },
];

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

  const isDashboardActive = location.pathname === "/dashboard";
  const visibleGroups = NAV_GROUPS.filter((g) => !g.roles || g.roles.includes(role));

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <nav
        className={[
          "flex flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden",
          "fixed inset-y-0 left-0 z-40 w-56 -translate-x-full transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "",
          "md:static md:inset-auto md:h-full md:translate-x-0 md:w-56",
        ].join(" ")}
        style={{ background: "#FFFFFF" }}
      >
        {/* Logo row */}
        <div className="flex items-center justify-between h-[64px] px-5 flex-shrink-0">
          <img src={dgLogoUrl} alt="Direct Guard" className="h-7 w-auto object-contain" />
          <button
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "#9CA3AF" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB";
              (e.currentTarget as HTMLButtonElement).style.color = "#374151";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {/* Dashboard — always first */}
          <NavLink to="/dashboard" label="Dashboard" icon={LayoutDashboard} isActive={isDashboardActive} />

          {/* Groups — always expanded, no collapse */}
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p
                className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "#9CA3AF" }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to + item.label}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    isActive={location.pathname === item.to}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom brand card */}
        <div className="px-3 pb-4 pt-2 flex-shrink-0">
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: "#1A1D2E" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(67,97,238,0.3)" }}
            >
              <Shield size={16} style={{ color: "#818CF8" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">Direct Guard Ltd</p>
              <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                Security Management
              </p>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

/* ── NavLink ──────────────────────────────────────────────────── */
interface NavLinkProps {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
}

function NavLink({ to, label, icon: Icon, isActive }: NavLinkProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-100 select-none"
      style={
        isActive
          ? { background: "#4361EE", color: "#FFFFFF", fontWeight: 600 }
          : { color: "#6B7280", fontWeight: 400 }
      }
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = "#EEF2FF";
          (e.currentTarget as HTMLAnchorElement).style.color = "#374151";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
          (e.currentTarget as HTMLAnchorElement).style.color = "#6B7280";
        }
      }}
    >
      <Icon size={15} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
