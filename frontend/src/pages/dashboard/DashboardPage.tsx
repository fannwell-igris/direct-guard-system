import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, MapPin, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, ArrowRight,
  Briefcase, Shield,
} from "lucide-react";
import api from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

// ── Role gates ───────────────────────────────────────────────
const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);
const OPS_ROLES     = new Set(["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL"]);
const HR_ROLES      = new Set(["ADMIN", "MANAGER", "HR", "PAYROLL"]);

// ── Types ────────────────────────────────────────────────────
interface MainDashboard {
  counts: { activeClients: number; activeSites: number; activeEmployees: number };
  revenue: { thisMonth: number; lastMonth: number; changePercent: number | null } | null;
  outstandingBalance: number | null;
  expenses: { thisMonth: number } | null;
  payroll: { paidThisMonth: number } | null;
  alerts: { overdueInvoices: number | null; expiringContracts: number; overdueTasks: number };
  recentInvoices: {
    id: string; invoiceNumber: string; amount: string; status: string;
    dueDate: string | null; dateCreated: string; client?: { name: string };
  }[] | null;
  recentPayments: {
    id: string; amount: string; paymentDate: string; paymentMethod: string;
    invoice?: { invoiceNumber: string; client?: { name: string } };
  }[] | null;
  monthlyRevenue: { month: string; revenue: number; expenses: number }[] | null;
}

interface OperationsDashboard {
  roster: {
    activeSitesTotal: number; sitesRosteredToday: number;
    sitesWithGapToday: string[]; officersOnDutyToday: number;
  };
  operations: { pendingReview: number };
  attendanceThisMonth: Record<string, number>;
  recentOperations: {
    id: string; date: string; reviewStatus: string;
    site?: { siteName: string }; shiftType?: { name: string };
  }[];
}

interface HRDashboard {
  employees: { active: number; inactive: number; terminated: number };
  expiringContracts: {
    id: string; endDate: string; payType: string;
    employee?: { fullName: string; position: string | null };
  }[];
  byDepartment: { department: string; count: number }[];
  recentHires: { id: string; fullName: string; position: string | null; dateAdded: string; employmentStatus: string }[];
  tasks: {
    overdueCount: number;
    topOverdue: {
      id: string; title: string; priority: string; dueDate: string; status: string;
      assignedToEmployee?: { fullName: string }; department?: { name: string };
    }[];
  };
  openDepartmentRequests: number;
}

type Tab = "overview" | "operations" | "hr";

// ── Helpers ──────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  const val = Number(n ?? 0);
  return `K ${(isNaN(val) ? 0 : val).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Donut chart ──────────────────────────────────────────────
interface DonutSegment { value: number; color: string; label: string }

function DonutChart({ segments, centerLabel, centerSub }: {
  segments: DonutSegment[]; centerLabel?: string; centerSub?: string;
}) {
  const r = 42, cx = 60, cy = 60, sw = 14;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: "#9CA3AF" }}>
        No data
      </div>
    );
  }

  let accumulated = 0;
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {segments.map((seg, i) => {
        const fraction = seg.value / total;
        const dash = fraction * circumference;
        const offset = circumference * (1 - accumulated);
        const el = (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color}
            strokeWidth={sw}
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
          />
        );
        accumulated += fraction;
        return el;
      })}
      {centerLabel && (
        <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
          fontSize="15" fontWeight="700" fill="#111827">{centerLabel}</text>
      )}
      {centerSub && (
        <text x={cx} y={cy + 11} textAnchor="middle"
          fontSize="8.5" fill="#9CA3AF">{centerSub}</text>
      )}
    </svg>
  );
}

// ── Bar chart ────────────────────────────────────────────────
function RevenueChart({ data }: { data: { month: string; revenue: number; expenses?: number }[] }) {
  const safe = data.map((d) => ({ ...d, revenue: Number(d.revenue ?? 0), expenses: Number(d.expenses ?? 0) }));
  const max = Math.max(...safe.flatMap((d) => [d.revenue, d.expenses]), 1);
  return (
    <div className="w-full">
      <div className="flex items-end justify-around h-32">
        {safe.map((d) => (
          <div key={d.month} className="flex flex-col items-center gap-1.5 flex-1">
            <div className="flex items-end gap-1 h-28 justify-center">
              <div
                className="w-5 rounded-t-md"
                style={{
                  height: `${Math.max((d.revenue / max) * 112, 4)}px`,
                  background: "linear-gradient(to top, #3451C7, #4361EE)",
                }}
                title={`Revenue: ${fmt(d.revenue)}`}
              />
              <div
                className="w-5 rounded-t-md"
                style={{
                  height: `${Math.max((d.expenses / max) * 112, 4)}px`,
                  background: "linear-gradient(to top, #C7D2FE, #E0E7FF)",
                }}
                title={`Expenses: ${fmt(d.expenses)}`}
              />
            </div>
            <span className="text-[9px] font-medium whitespace-nowrap" style={{ color: "#9CA3AF" }}>{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-5 mt-4 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6B7280" }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#4361EE" }} />
          Revenue
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6B7280" }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#C7D2FE" }} />
          Expenses
        </span>
      </div>
    </div>
  );
}

// ── Invoice badge ────────────────────────────────────────────
function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    PAID:      { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
    OVERDUE:   { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    SENT:      { bg: "#EEF2FF", color: "#4361EE", border: "#C7D2FE" },
    CANCELLED: { bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
    DRAFT:     { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
  };
  const s = map[status] ?? map.DRAFT;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

// ── Priority badge ───────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    CRITICAL: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    HIGH:     { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA" },
    MEDIUM:   { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
    LOW:      { bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
  };
  const s = map[priority] ?? map.LOW;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {priority}
    </span>
  );
}

// ── Section card ─────────────────────────────────────────────
function SectionCard({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid #F3F4F6" }}>
        <p className="text-sm font-semibold" style={{ color: "#111827" }}>{title}</p>
        {action && onAction && (
          <button onClick={onAction}
            className="flex items-center gap-1 text-xs font-semibold transition-colors"
            style={{ color: "#4361EE" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#3451C7")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#4361EE")}
          >
            {action} <ArrowRight size={11} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Featured blue card (primary revenue card) ────────────────
function BlueFeaturedCard({ label, value, sub, trend, to }: {
  label: string; value: string | number; sub?: string;
  trend?: { value: number; label?: string } | null; to?: string;
}) {
  const navigate = useNavigate();
  const isUp = trend && trend.value >= 0;
  return (
    <div
      className="rounded-2xl p-5 cursor-pointer transition-all duration-150"
      style={{
        background: "linear-gradient(135deg, #3D5BE0 0%, #7A97FF 100%)",
        boxShadow: "0 4px 20px rgba(67,97,238,0.35)",
      }}
      onClick={to ? () => navigate(to) : undefined}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px rgba(67,97,238,0.45)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(67,97,238,0.35)"; }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <TrendingUp size={18} style={{ color: "#FFFFFF" }} />
        </div>
        {trend !== undefined && trend !== null && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
            style={isUp
              ? { background: "rgba(255,255,255,0.25)", color: "#FFFFFF" }
              : { background: "rgba(255,255,255,0.2)", color: "#FFFFFF" }
            }
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isUp ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{sub}</p>}
      {trend?.label && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{trend.label}</p>}
    </div>
  );
}

// ── White stat card ──────────────────────────────────────────
function StatCard({ label, value, sub, trend, to, icon: Icon, iconBg, iconColor }: {
  label: string; value: string | number; sub?: string;
  trend?: { value: number } | null;
  to?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  const navigate = useNavigate();
  const isUp = trend && trend.value >= 0;
  return (
    <div
      className="rounded-2xl p-5 cursor-pointer transition-all duration-150"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}
      onClick={to ? () => navigate(to) : undefined}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)"; }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        {trend !== undefined && trend !== null && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
            style={isUp
              ? { background: "#ECFDF5", color: "#059669" }
              : { background: "#FEF2F2", color: "#DC2626" }
            }
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isUp ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>{value}</p>
      <p className="text-sm mt-1" style={{ color: "#6B7280" }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{sub}</p>}
    </div>
  );
}

// ── Count card (small) ───────────────────────────────────────
function CountCard({ label, value, icon: Icon, iconBg, iconColor, to }: {
  label: string; value: number; icon: React.ElementType;
  iconBg: string; iconColor: string; to?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3.5 cursor-pointer transition-all"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}
      onClick={to ? () => navigate(to) : undefined}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)"; }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={18} style={{ color: iconColor }} />
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: "#111827" }}>{value}</p>
        <p className="text-xs" style={{ color: "#6B7280" }}>{label}</p>
      </div>
    </div>
  );
}

// ── General stat card (for ops/hr) ───────────────────────────
function FeaturedCard({ label, value, sub, trend, icon: Icon, accentBg, accentColor, to }: {
  label: string; value: string | number; sub?: string;
  trend?: { value: number; label?: string } | null;
  icon: React.ElementType; accentBg: string; accentColor: string; to?: string;
}) {
  const navigate = useNavigate();
  const isUp = trend && trend.value >= 0;
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-150 cursor-pointer"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}
      onClick={to ? () => navigate(to) : undefined}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)"; }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accentBg }}>
          <Icon size={18} style={{ color: accentColor }} />
        </div>
        {trend !== undefined && trend !== null && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
            style={isUp
              ? { background: "#ECFDF5", color: "#059669" }
              : { background: "#FEF2F2", color: "#DC2626" }
            }
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isUp ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>{value}</p>
      <p className="text-sm mt-1" style={{ color: "#6B7280" }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{sub}</p>}
      {trend?.label && <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{trend.label}</p>}
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center gap-2.5 text-sm py-10 justify-center" style={{ color: "#9CA3AF" }}>
      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: "#E5E7EB", borderTopColor: "#4361EE" }} />
      Loading…
    </div>
  );
}

// ── Alert pill ───────────────────────────────────────────────
function AlertPill({ text, bg, color, border, to, navigate }: {
  text: string; bg: string; color: string; border: string;
  to: string; navigate: (p: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 text-xs font-semibold rounded-xl px-3.5 py-2 cursor-pointer transition-all"
      style={{ background: bg, color, border: `1px solid ${border}` }}
      onClick={() => navigate(to)}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = "0.8")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
    >
      <AlertTriangle size={12} />
      {text}
      <ArrowRight size={11} style={{ opacity: 0.6 }} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const role      = user?.role ?? "STAFF";

  const canSeeFinance = FINANCE_ROLES.has(role);
  const canSeeOps     = OPS_ROLES.has(role);
  const canSeeHR      = HR_ROLES.has(role);

  const defaultTab: Tab = !canSeeFinance && !canSeeHR && canSeeOps ? "operations" : "overview";
  const [tab, setTab] = useState<Tab>(defaultTab);

  const [main, setMain] = useState<MainDashboard | null>(null);
  const [ops,  setOps]  = useState<OperationsDashboard | null>(null);
  const [hr,   setHr]   = useState<HRDashboard | null>(null);

  const [mainLoading, setMainLoading] = useState(true);
  const [opsLoading,  setOpsLoading]  = useState(false);
  const [hrLoading,   setHrLoading]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    setMainLoading(true);
    api.get("/dashboard/main")
      .then((res) => setMain(res.data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Failed to load dashboard."))
      .finally(() => setMainLoading(false));

    if (defaultTab === "operations") {
      setOpsLoading(true);
      api.get("/dashboard/operations")
        .then((res) => setOps(res.data.data))
        .catch(() => {})
        .finally(() => setOpsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(t: Tab) {
    setTab(t);
    if (t === "operations" && !ops) {
      setOpsLoading(true);
      api.get("/dashboard/operations").then((res) => setOps(res.data.data)).catch(() => {}).finally(() => setOpsLoading(false));
    }
    if (t === "hr" && !hr) {
      setHrLoading(true);
      api.get("/dashboard/hr").then((res) => setHr(res.data.data)).catch(() => {}).finally(() => setHrLoading(false));
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview",   label: "Overview" },
    ...(canSeeOps ? [{ key: "operations" as Tab, label: "Operations" }] : []),
    ...(canSeeHR  ? [{ key: "hr"         as Tab, label: "HR"         }] : []),
  ];

  // Invoice donut segments
  const invoiceDonut: DonutSegment[] = (() => {
    if (!main?.recentInvoices) return [];
    const tally: Record<string, number> = {};
    main.recentInvoices.forEach((inv) => { tally[inv.status] = (tally[inv.status] ?? 0) + 1; });
    const colors: Record<string, string> = {
      PAID: "#059669", SENT: "#4361EE", OVERDUE: "#DC2626", DRAFT: "#D97706", CANCELLED: "#9CA3AF",
    };
    return Object.entries(tally).map(([label, value]) => ({ label, value, color: colors[label] ?? "#9CA3AF" }));
  })();

  return (
    <div className="max-w-7xl">

      {/* ── Page header ── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: "#9CA3AF" }}>{todayLabel()}</p>
      </div>

      {error && (
        <div className="text-sm rounded-xl px-4 py-3 mb-4"
          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 w-fit rounded-xl p-1 mb-5"
        style={{ background: "#FFFFFF", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-150"
            style={
              tab === t.key
                ? { background: "#4361EE", color: "#FFFFFF", boxShadow: "0 2px 8px rgba(67,97,238,0.3)" }
                : { color: "#6B7280" }
            }
            onMouseEnter={(e) => { if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.background = "#EEF2FF"; }}
            onMouseLeave={(e) => { if (tab !== t.key) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {tab === "overview" && (
        mainLoading ? <Spinner /> : main ? (
          <div className="flex gap-5 items-start">

            {/* ── Left main column ── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Alert pills */}
              {((canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0) ||
                main.alerts.expiringContracts > 0 ||
                main.alerts.overdueTasks > 0) && (
                <div className="flex flex-wrap gap-2">
                  {canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0 && (
                    <AlertPill text={`${main.alerts.overdueInvoices} overdue invoice${main.alerts.overdueInvoices !== 1 ? "s" : ""}`}
                      bg="#FEF2F2" color="#DC2626" border="#FECACA" to="/invoices" navigate={navigate} />
                  )}
                  {main.alerts.expiringContracts > 0 && (
                    <AlertPill text={`${main.alerts.expiringContracts} contract${main.alerts.expiringContracts !== 1 ? "s" : ""} expiring soon`}
                      bg="#FFFBEB" color="#D97706" border="#FDE68A" to="/contracts" navigate={navigate} />
                  )}
                  {main.alerts.overdueTasks > 0 && (
                    <AlertPill text={`${main.alerts.overdueTasks} overdue task${main.alerts.overdueTasks !== 1 ? "s" : ""}`}
                      bg="#FFF7ED" color="#EA580C" border="#FED7AA" to="/tasks" navigate={navigate} />
                  )}
                </div>
              )}

              {/* 2×2 stat cards */}
              {canSeeFinance && main.revenue ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Featured blue card */}
                  <BlueFeaturedCard
                    label="Revenue this month"
                    value={fmt(main.revenue.thisMonth)}
                    trend={main.revenue.changePercent !== null ? { value: main.revenue.changePercent, label: "vs last month" } : null}
                    to="/invoices"
                  />
                  {/* Outstanding balance */}
                  <StatCard
                    label="Outstanding balance"
                    value={fmt(main.outstandingBalance ?? 0)}
                    sub={main.alerts.overdueInvoices ? `${main.alerts.overdueInvoices} overdue` : undefined}
                    icon={AlertTriangle} iconBg="#FEF2F2" iconColor="#DC2626"
                    to="/invoices"
                  />
                  {/* Expenses */}
                  {main.expenses ? (
                    <StatCard
                      label="Expenses this month"
                      value={fmt(main.expenses.thisMonth)}
                      sub="General + operational"
                      icon={Briefcase} iconBg="#F3F4F6" iconColor="#6B7280"
                      to="/expenses"
                    />
                  ) : (
                    <StatCard
                      label="Active Clients"
                      value={main.counts.activeClients}
                      icon={Building2} iconBg="#ECFDF5" iconColor="#059669"
                      to="/clients"
                    />
                  )}
                  {/* Payroll */}
                  {main.payroll ? (
                    <StatCard
                      label="Payroll paid this month"
                      value={fmt(main.payroll.paidThisMonth)}
                      sub="Net pay"
                      icon={Users} iconBg="#EEF2FF" iconColor="#4361EE"
                      to="/payroll"
                    />
                  ) : (
                    <StatCard
                      label="Active Sites"
                      value={main.counts.activeSites}
                      icon={MapPin} iconBg="#EEF2FF" iconColor="#4361EE"
                      to="/sites"
                    />
                  )}
                </div>
              ) : (
                /* No finance access — show count cards in a 3-col */
                <div className="grid grid-cols-3 gap-4">
                  <CountCard label="Active Clients"   value={main.counts.activeClients}   icon={Building2} iconBg="#ECFDF5" iconColor="#059669" to="/clients"   />
                  <CountCard label="Active Sites"     value={main.counts.activeSites}     icon={MapPin}    iconBg="#EEF2FF" iconColor="#4361EE" to="/sites"     />
                  <CountCard label="Active Employees" value={main.counts.activeEmployees} icon={Users}     iconBg="#F3F4F6" iconColor="#6B7280" to="/employees" />
                </div>
              )}

              {/* Bar chart */}
              {canSeeFinance && main.monthlyRevenue && (
                <SectionCard title="Revenue vs Expenses — last 6 months">
                  <div className="p-5">
                    <RevenueChart data={main.monthlyRevenue} />
                  </div>
                </SectionCard>
              )}

              {/* Recent invoices */}
              {canSeeFinance && main.recentInvoices && main.recentInvoices.length > 0 && (
                <SectionCard title="Recent invoices" action="View all" onAction={() => navigate("/invoices")}>
                  <table className="w-full text-xs">
                    <thead style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                      <tr>
                        {["Invoice", "Client", "Amount", "Status"].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider ${i === 2 ? "text-right" : "text-left"}`}
                            style={{ color: "#6B7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {main.recentInvoices.map((inv, i) => (
                        <tr key={inv.id}
                          style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#EEF2FF")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")}
                        >
                          <td className="px-5 py-3 font-semibold" style={{ color: "#111827" }}>{inv.invoiceNumber}</td>
                          <td className="px-5 py-3" style={{ color: "#6B7280" }}>{inv.client?.name ?? "—"}</td>
                          <td className="px-5 py-3 text-right font-semibold" style={{ color: "#374151" }}>{fmt(Number(inv.amount))}</td>
                          <td className="px-5 py-3"><InvoiceBadge status={inv.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {/* Recent payments */}
              {canSeeFinance && main.recentPayments && main.recentPayments.length > 0 && (
                <SectionCard title="Recent payments" action="View invoices" onAction={() => navigate("/invoices")}>
                  <table className="w-full text-xs">
                    <thead style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                      <tr>
                        {["Date", "Client", "Invoice", "Method", "Amount"].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`}
                            style={{ color: "#6B7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {main.recentPayments.map((p, i) => (
                        <tr key={p.id}
                          style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#EEF2FF")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")}
                        >
                          <td className="px-5 py-3" style={{ color: "#6B7280" }}>{fmtDate(p.paymentDate)}</td>
                          <td className="px-5 py-3" style={{ color: "#374151" }}>{p.invoice?.client?.name ?? "—"}</td>
                          <td className="px-5 py-3" style={{ color: "#6B7280" }}>{p.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="px-5 py-3" style={{ color: "#6B7280" }}>{p.paymentMethod}</td>
                          <td className="px-5 py-3 text-right font-semibold" style={{ color: "#059669" }}>{fmt(Number(p.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}

              {!canSeeFinance && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                  <Briefcase size={14} style={{ color: "#9CA3AF" }} />
                  <p className="text-sm" style={{ color: "#6B7280" }}>Financial data is not available for your role.</p>
                </div>
              )}
            </div>

            {/* ── Right panel ── */}
            <div className="w-72 flex-shrink-0 space-y-5 hidden xl:flex xl:flex-col">

              {/* Company banner */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "linear-gradient(135deg, #1A1D2E 0%, #2A3050 100%)", boxShadow: "0 1px 8px rgba(0,0,0,0.12)" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(67,97,238,0.3)" }}>
                    <Shield size={16} style={{ color: "#818CF8" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Direct Guard Ltd</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>Security Management</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { label: "Clients",   value: main.counts.activeClients,   to: "/clients"   },
                    { label: "Sites",     value: main.counts.activeSites,     to: "/sites"     },
                    { label: "Employees", value: main.counts.activeEmployees, to: "/employees" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl p-2.5 text-center cursor-pointer transition-all"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                      onClick={() => navigate(item.to)}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.14)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.08)")}
                    >
                      <p className="text-lg font-bold text-white">{item.value}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invoice breakdown */}
              {canSeeFinance && invoiceDonut.length > 0 && (
                <SectionCard title="Invoice breakdown">
                  <div className="p-5 flex flex-col items-center gap-4">
                    <div style={{ width: 140, height: 140 }}>
                      <DonutChart
                        segments={invoiceDonut}
                        centerLabel={String(main.recentInvoices?.length ?? 0)}
                        centerSub="invoices"
                      />
                    </div>
                    <div className="w-full space-y-2">
                      {invoiceDonut.map((seg) => (
                        <div key={seg.label} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5" style={{ color: "#6B7280" }}>
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: seg.color }} />
                            {seg.label}
                          </span>
                          <span className="font-semibold" style={{ color: "#111827" }}>{seg.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              )}

              {/* Quick links */}
              <SectionCard title="Quick access">
                <div className="p-3 space-y-1">
                  {[
                    { label: "View Clients",   to: "/clients",   color: "#4361EE", bg: "#EEF2FF" },
                    { label: "View Sites",     to: "/sites",     color: "#059669", bg: "#ECFDF5" },
                    { label: "View Employees", to: "/employees", color: "#4361EE", bg: "#EEF2FF" },
                    ...(canSeeFinance ? [
                      { label: "Invoices",     to: "/invoices",  color: "#D97706", bg: "#FFFBEB" },
                    ] : []),
                  ].map((item) => (
                    <button
                      key={item.to}
                      onClick={() => navigate(item.to)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ color: item.color, background: "transparent" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = item.bg; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      {item.label}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        ) : null
      )}

      {/* ══ OPERATIONS TAB ══ */}
      {tab === "operations" && canSeeOps && (
        opsLoading ? <Spinner /> : ops ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <FeaturedCard label="Active Sites"     value={ops.roster.activeSitesTotal}    icon={MapPin}      accentBg="#EEF2FF" accentColor="#4361EE" to="/sites"      />
              <FeaturedCard label="Rostered Today"   value={ops.roster.sitesRosteredToday}  icon={CheckCircle} accentBg="#ECFDF5" accentColor="#059669" to="/roster"     />
              <FeaturedCard label="Officers on Duty" value={ops.roster.officersOnDutyToday} icon={Users}       accentBg="#F3F4F6" accentColor="#6B7280" to="/operations" />
              <FeaturedCard label="Pending Review"   value={ops.operations.pendingReview}   icon={Clock}       accentBg="#FFFBEB" accentColor="#D97706" to="/operations" />
            </div>

            {ops.roster.sitesWithGapToday.length > 0 && (
              <div className="rounded-xl px-4 py-3"
                style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "#DC2626" }}>
                  Sites with no roster today ({ops.roster.sitesWithGapToday.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {ops.roster.sitesWithGapToday.map((name) => (
                    <span key={name} className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Site coverage today">
                <div className="p-5 flex items-center gap-6">
                  <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                    <DonutChart
                      segments={[
                        { label: "Rostered", value: ops.roster.sitesRosteredToday, color: "#059669" },
                        { label: "Gaps", value: Math.max(ops.roster.activeSitesTotal - ops.roster.sitesRosteredToday, 0), color: "#F3F4F6" },
                      ]}
                      centerLabel={`${ops.roster.activeSitesTotal > 0
                        ? Math.round((ops.roster.sitesRosteredToday / ops.roster.activeSitesTotal) * 100)
                        : 0}%`}
                      centerSub="covered"
                    />
                  </div>
                  <div className="space-y-3 flex-1">
                    {[
                      { label: "Rostered",        value: ops.roster.sitesRosteredToday, color: "#059669" },
                      { label: "With gaps",        value: Math.max(ops.roster.activeSitesTotal - ops.roster.sitesRosteredToday, 0), color: "#DC2626" },
                      { label: "Officers on duty", value: ops.roster.officersOnDutyToday, color: "#4361EE" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2" style={{ color: "#6B7280" }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                          {row.label}
                        </span>
                        <span className="font-bold" style={{ color: "#111827" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Recent Operations Records" action="View all" onAction={() => navigate("/operations")}>
                {ops.recentOperations.length === 0 ? (
                  <p className="text-xs p-5" style={{ color: "#6B7280" }}>No records yet.</p>
                ) : (
                  <div>
                    {ops.recentOperations.map((r, i) => (
                      <div key={r.id} className="px-5 py-3 flex items-center justify-between text-xs"
                        style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#EEF2FF")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                      >
                        <div>
                          <p className="font-semibold" style={{ color: "#111827" }}>{r.site?.siteName ?? "—"}</p>
                          <p className="mt-0.5" style={{ color: "#9CA3AF" }}>{fmtDate(r.date)} · {r.shiftType?.name ?? "—"}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={
                            r.reviewStatus === "APPROVED" ? { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" } :
                            r.reviewStatus === "REJECTED" ? { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" } :
                            { background: "#EEF2FF", color: "#4361EE", border: "1px solid #C7D2FE" }
                          }
                        >
                          {r.reviewStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard title="Attendance this month">
              <div className="p-5">
                {Object.keys(ops.attendanceThisMonth).length === 0 ? (
                  <p className="text-xs" style={{ color: "#6B7280" }}>No records this month.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {Object.entries(ops.attendanceThisMonth).map(([status, count]) => (
                      <div key={status} className="rounded-xl p-3 text-center"
                        style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                        <p className="text-xl font-bold" style={{ color: "#111827" }}>{count}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{status.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        ) : null
      )}

      {/* ══ HR TAB ══ */}
      {tab === "hr" && canSeeHR && (
        hrLoading ? <Spinner /> : hr ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FeaturedCard label="Active Employees" value={hr.employees.active}     icon={Users} accentBg="#ECFDF5" accentColor="#059669" to="/employees" />
              <FeaturedCard label="Inactive"          value={hr.employees.inactive}   icon={Users} accentBg="#F9FAFB" accentColor="#6B7280" to="/employees" />
              <FeaturedCard label="Terminated"        value={hr.employees.terminated} icon={Users} accentBg="#FEF2F2" accentColor="#DC2626" to="/employees" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SectionCard title="Workforce breakdown">
                <div className="p-5 flex flex-col items-center gap-4">
                  <div style={{ width: 140, height: 140 }}>
                    <DonutChart
                      segments={[
                        { label: "Active",     value: hr.employees.active,     color: "#059669" },
                        { label: "Inactive",   value: hr.employees.inactive,   color: "#4361EE" },
                        { label: "Terminated", value: hr.employees.terminated, color: "#DC2626" },
                      ]}
                      centerLabel={String(hr.employees.active + hr.employees.inactive + hr.employees.terminated)}
                      centerSub="total"
                    />
                  </div>
                  <div className="w-full space-y-2">
                    {[
                      { label: "Active",     value: hr.employees.active,     color: "#059669" },
                      { label: "Inactive",   value: hr.employees.inactive,   color: "#4361EE" },
                      { label: "Terminated", value: hr.employees.terminated, color: "#DC2626" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5" style={{ color: "#6B7280" }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                          {row.label}
                        </span>
                        <span className="font-semibold" style={{ color: "#111827" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <div className="lg:col-span-2">
                <SectionCard title="Employees by department">
                  <div className="p-5">
                    {hr.byDepartment.length === 0 ? (
                      <p className="text-xs" style={{ color: "#6B7280" }}>No departments.</p>
                    ) : (
                      <div className="space-y-3">
                        {hr.byDepartment.map((d) => {
                          const max = Math.max(...hr.byDepartment.map((x) => x.count), 1);
                          const pct = (d.count / max) * 100;
                          return (
                            <div key={d.department}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span style={{ color: "#374151" }}>{d.department}</span>
                                <span className="font-bold" style={{ color: "#111827" }}>{d.count}</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#4361EE" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            </div>

            {(hr.tasks.overdueCount > 0 || hr.openDepartmentRequests > 0) && (
              <div className="flex flex-wrap gap-2">
                {hr.tasks.overdueCount > 0 && (
                  <AlertPill text={`${hr.tasks.overdueCount} overdue task${hr.tasks.overdueCount !== 1 ? "s" : ""}`}
                    bg="#FFF7ED" color="#EA580C" border="#FED7AA" to="/tasks" navigate={navigate} />
                )}
                {hr.openDepartmentRequests > 0 && (
                  <AlertPill text={`${hr.openDepartmentRequests} open department request${hr.openDepartmentRequests !== 1 ? "s" : ""}`}
                    bg="#EEF2FF" color="#4361EE" border="#C7D2FE" to="/department-requests" navigate={navigate} />
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title={`Contracts expiring within 30 days (${hr.expiringContracts.length})`}>
                {hr.expiringContracts.length === 0 ? (
                  <p className="text-xs p-5" style={{ color: "#6B7280" }}>None — all clear.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto">
                    {hr.expiringContracts.map((c, i) => (
                      <div key={c.id} className="px-5 py-3 flex items-center justify-between text-xs"
                        style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#EEF2FF")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                      >
                        <div>
                          <p className="font-semibold" style={{ color: "#111827" }}>{c.employee?.fullName}</p>
                          <p className="mt-0.5" style={{ color: "#9CA3AF" }}>{c.employee?.position ?? c.payType}</p>
                        </div>
                        <span className="font-semibold" style={{ color: "#D97706" }}>{fmtDate(c.endDate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Top overdue tasks" action="View tasks" onAction={() => navigate("/tasks")}>
                {hr.tasks.topOverdue.length === 0 ? (
                  <p className="text-xs p-5" style={{ color: "#6B7280" }}>No overdue tasks.</p>
                ) : (
                  <div>
                    {hr.tasks.topOverdue.map((t, i) => (
                      <div key={t.id} className="px-5 py-3 text-xs"
                        style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#EEF2FF")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold" style={{ color: "#111827" }}>{t.title}</p>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <p className="mt-0.5" style={{ color: "#9CA3AF" }}>
                          {t.assignedToEmployee?.fullName ?? t.department?.name ?? "Unassigned"} · Due {fmtDate(t.dueDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard title={`Recent hires — last 30 days (${hr.recentHires.length})`}
              action="View all" onAction={() => navigate("/employees")}>
              {hr.recentHires.length === 0 ? (
                <p className="text-xs p-5" style={{ color: "#6B7280" }}>No new hires in the last 30 days.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {hr.recentHires.map((e, i) => (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-xs"
                      style={{ borderTop: i >= 1 ? "1px solid #F9FAFB" : undefined }}
                      onMouseEnter={(el) => ((el.currentTarget as HTMLDivElement).style.background = "#EEF2FF")}
                      onMouseLeave={(el) => ((el.currentTarget as HTMLDivElement).style.background = "transparent")}
                    >
                      <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
                        style={{ background: "#EEF2FF", color: "#4361EE" }}>
                        {e.fullName.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: "#111827" }}>{e.fullName}</p>
                        <p className="truncate" style={{ color: "#9CA3AF" }}>{e.position ?? "—"} · {fmtDate(e.dateAdded)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null
      )}
    </div>
  );
}
