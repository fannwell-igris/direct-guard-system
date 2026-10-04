import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, MapPin, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock,
  ArrowRight, Briefcase, Shield,
} from "lucide-react";
import api from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

// ── Role constants ──────────────────────────────────────────────────────────
const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);
const OPS_ROLES     = new Set(["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL"]);
const HR_ROLES      = new Set(["ADMIN", "MANAGER", "HR", "PAYROLL"]);

// ── Types ───────────────────────────────────────────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  const val = Number(n ?? 0);
  return `K ${(isNaN(val) ? 0 : val).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Invoice status badge ─────────────────────────────────────────────────────
function InvoiceBadge({ status }: { status: string }) {
  const style: Record<string, React.CSSProperties> = {
    PAID:      { background: "#052E16", color: "#4ADE80", border: "1px solid #14532D" },
    OVERDUE:   { background: "#2D0A0A", color: "#F87171", border: "1px solid #7F1D1D" },
    SENT:      { background: "#0C1A40", color: "#60A5FA", border: "1px solid #1D3A6E" },
    CANCELLED: { background: "#0F1626", color: "#6B7A9A", border: "1px solid #1C2A42" },
    DRAFT:     { background: "#2D1A00", color: "#FCD34D", border: "1px solid #78350F" },
  };
  const s = style[status] ?? style.DRAFT;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={s}>
      {status}
    </span>
  );
}

// ── Priority badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const style: Record<string, React.CSSProperties> = {
    CRITICAL: { background: "#2D0A0A", color: "#F87171", border: "1px solid #7F1D1D" },
    HIGH:     { background: "#2A1500", color: "#FB923C", border: "1px solid #7C2D12" },
    MEDIUM:   { background: "#2D1A00", color: "#FCD34D", border: "1px solid #78350F" },
    LOW:      { background: "#0F1626", color: "#6B7A9A", border: "1px solid #1C2A42" },
  };
  const s = style[priority] ?? style.LOW;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={s}>
      {priority}
    </span>
  );
}

// ── Revenue bar chart ────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: { month: string; revenue: number; expenses?: number }[] }) {
  const safeData = data.map((d) => ({
    ...d,
    revenue:  Number(d.revenue  ?? 0),
    expenses: Number(d.expenses ?? 0),
  }));
  const max = Math.max(...safeData.flatMap((d) => [d.revenue, d.expenses]), 1);
  return (
    <div className="min-w-0 w-full">
      <div className="flex items-end justify-around h-36">
        {safeData.map((d) => (
          <div key={d.month} className="flex flex-col items-center gap-2 flex-1">
            <div className="flex items-end gap-1.5 h-28 justify-center">
              <div
                className="w-6 rounded-md"
                style={{
                  height: `${Math.max((d.revenue / max) * 112, 4)}px`,
                  background: "linear-gradient(to top, #064E3B, #10B981)",
                  opacity: 0.9,
                }}
                title={`Revenue — ${d.month}: ${fmt(d.revenue)}`}
              />
              <div
                className="w-6 rounded-md"
                style={{
                  height: `${Math.max((d.expenses / max) * 112, 4)}px`,
                  background: "linear-gradient(to top, #1E3A6E, #3B82F6)",
                  opacity: 0.9,
                }}
                title={`Expenses — ${d.month}: ${fmt(d.expenses)}`}
              />
            </div>
            <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "#3E4F6E" }}>{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-5 mt-4" style={{ borderTop: "1px solid #1C2A42", paddingTop: "12px" }}>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#7B8CB0" }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "linear-gradient(to top, #064E3B, #10B981)" }} />
          Revenue
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#7B8CB0" }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "linear-gradient(to top, #1E3A6E, #3B82F6)" }} />
          Expenses
        </span>
      </div>
    </div>
  );
}

// ── Gradient stat card ───────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, icon: Icon, accentColor, to }: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label?: string } | null;
  icon: React.ElementType;
  accentColor: string;  // hex
  to?: string;
}) {
  const navigate = useNavigate();
  const clickable = !!to;
  const isUp = trend && trend.value >= 0;

  return (
    <div
      className={`rounded-2xl p-5 transition-all duration-200 ${clickable ? "cursor-pointer" : ""}`}
      style={{
        background: "#0D1526",
        border: "1px solid #1C2A42",
        boxShadow: clickable ? undefined : "0 4px 16px rgba(0,0,0,0.2)",
      }}
      onClick={clickable ? () => navigate(to!) : undefined}
      role={clickable ? "button" : undefined}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.borderColor = accentColor + "40";
          (e.currentTarget as HTMLDivElement).style.background = "#111E30";
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "#1C2A42";
          (e.currentTarget as HTMLDivElement).style.background = "#0D1526";
        }
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accentColor + "18", border: `1px solid ${accentColor}28` }}
        >
          <Icon size={18} style={{ color: accentColor }} />
        </div>
        {trend !== undefined && trend !== null && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
            style={isUp
              ? { background: "rgba(16,185,129,0.12)", color: "#10B981" }
              : { background: "rgba(248,113,113,0.12)", color: "#F87171" }
            }
          >
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isUp ? "+" : ""}{trend.value}%
          </div>
        )}
        {clickable && trend === undefined && (
          <ArrowRight size={14} style={{ color: "#3E4F6E" }} />
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight" style={{ color: "#E2EAF8" }}>{value}</div>
      <div className="text-sm font-medium mt-1" style={{ color: "#7B8CB0" }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "#3E4F6E" }}>{sub}</div>}
      {trend?.label && <div className="text-xs mt-0.5" style={{ color: "#3E4F6E" }}>{trend.label}</div>}
    </div>
  );
}

// ── Finance metric card ──────────────────────────────────────────────────────
function MetricCard({ label, value, sub, valueColor, trend, to }: {
  label: string; value: string; sub?: string;
  valueColor?: string; trend?: { value: number } | null; to?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-150 cursor-pointer"
      style={{ background: "#0D1526", border: "1px solid #1C2A42" }}
      onClick={to ? () => navigate(to) : undefined}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#243350";
        (e.currentTarget as HTMLDivElement).style.background = "#111E30";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#1C2A42";
        (e.currentTarget as HTMLDivElement).style.background = "#0D1526";
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#3E4F6E" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: valueColor ?? "#E2EAF8" }}>{value}</p>
      {trend !== undefined && trend !== null && (
        <div className="flex items-center gap-1 mt-1.5 text-xs font-semibold"
          style={{ color: trend.value >= 0 ? "#10B981" : "#F87171" }}>
          {trend.value >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend.value >= 0 ? "+" : ""}{trend.value}% vs last month
        </div>
      )}
      {sub && <p className="text-xs mt-1" style={{ color: "#4A5E7A" }}>{sub}</p>}
    </div>
  );
}

// ── Alert pill ───────────────────────────────────────────────────────────────
function AlertPill({ text, bg, color, border, to, navigate }: {
  text: string; bg: string; color: string; border: string; to: string; navigate: (p: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 text-xs font-semibold rounded-xl px-3.5 py-2 cursor-pointer transition-all"
      style={{ background: bg, color, border: `1px solid ${border}` }}
      onClick={() => navigate(to)}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <AlertTriangle size={12} />
      {text}
      <ArrowRight size={11} style={{ opacity: 0.6 }} />
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#0D1526", border: "1px solid #1C2A42" }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid #1C2A42" }}
      >
        <p className="text-sm font-semibold" style={{ color: "#CBD5E8" }}>{title}</p>
        {action && onAction && (
          <button
            onClick={onAction}
            className="flex items-center gap-1 text-xs font-semibold transition-colors"
            style={{ color: "#F0A830" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#D4912B")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#F0A830")}
          >
            {action} <ArrowRight size={11} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Loading spinner ──────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center gap-2.5 text-sm py-10 justify-center" style={{ color: "#4A5E7A" }}>
      <div
        className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: "#1C2A42", borderTopColor: "#F0A830" }}
      />
      Loading…
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const role      = user?.role ?? "STAFF";

  const canSeeFinance = FINANCE_ROLES.has(role);
  const canSeeOps     = OPS_ROLES.has(role);
  const canSeeHR      = HR_ROLES.has(role);

  const defaultTab: Tab = !canSeeFinance && !canSeeHR && canSeeOps ? "operations" : "overview";
  const [tab, setTab]   = useState<Tab>(defaultTab);

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
      api.get("/dashboard/operations")
        .then((res) => setOps(res.data.data))
        .catch(() => {})
        .finally(() => setOpsLoading(false));
    }
    if (t === "hr" && !hr) {
      setHrLoading(true);
      api.get("/dashboard/hr")
        .then((res) => setHr(res.data.data))
        .catch(() => {})
        .finally(() => setHrLoading(false));
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview",   label: "Overview"   },
    ...(canSeeOps ? [{ key: "operations" as Tab, label: "Operations" }] : []),
    ...(canSeeHR  ? [{ key: "hr"         as Tab, label: "HR"         }] : []),
  ];

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Welcome banner ── */}
      <div
        className="rounded-2xl px-6 py-5 relative overflow-hidden"
        style={{
          background: "#0D1526",
          border: "1px solid #1C2A42",
        }}
      >
        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 100% at 85% 50%, rgba(240,168,48,0.04) 0%, transparent 70%)" }}
        />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <p className="text-sm font-medium" style={{ color: "#4A5E7A" }}>{greeting()},</p>
            <h1 className="text-xl font-bold mt-0.5" style={{ color: "#E2EAF8" }}>{user?.fullName}</h1>
            <p className="text-xs mt-0.5" style={{ color: "#3E4F6E" }}>
              {role} · Direct Guard Limited
            </p>
          </div>
          <div
            className="hidden sm:flex items-center gap-2.5 rounded-xl px-4 py-2.5"
            style={{ background: "#080C18", border: "1px solid #1C2A42" }}
          >
            <Shield size={16} style={{ color: "#F0A830" }} />
            <span className="text-sm font-semibold" style={{ color: "#CBD5E8" }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="text-sm rounded-xl px-4 py-3"
          style={{ background: "#2D0A0A", color: "#F87171", border: "1px solid #7F1D1D" }}
        >
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 w-fit rounded-xl p-1"
        style={{ background: "#0A0E1C", border: "1px solid #111A2C" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-150"
            style={
              tab === t.key
                ? { background: "#0D1526", color: "#E2EAF8", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }
                : { color: "#4A5E7A" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {tab === "overview" && (
        <>
          {mainLoading ? <Spinner /> : main ? (
            <div className="space-y-5">

              {/* Core stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Active Clients" value={main.counts.activeClients}
                  icon={Building2} accentColor="#10B981" to="/clients"
                />
                <StatCard
                  label="Active Sites" value={main.counts.activeSites}
                  icon={MapPin} accentColor="#3B82F6" to="/sites"
                />
                <StatCard
                  label="Active Employees" value={main.counts.activeEmployees}
                  icon={Users} accentColor="#8B5CF6" to="/employees"
                />
              </div>

              {/* Finance metric cards */}
              {canSeeFinance && main.revenue && main.expenses && main.payroll && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    label="Revenue this month" value={fmt(main.revenue.thisMonth)}
                    trend={main.revenue.changePercent !== null ? { value: main.revenue.changePercent } : null}
                    to="/invoices"
                  />
                  <MetricCard
                    label="Outstanding balance" value={fmt(main.outstandingBalance ?? 0)}
                    valueColor="#F87171"
                    sub={main.alerts.overdueInvoices !== null
                      ? `${main.alerts.overdueInvoices} overdue invoice${main.alerts.overdueInvoices !== 1 ? "s" : ""}`
                      : undefined}
                    to="/invoices"
                  />
                  <MetricCard
                    label="Expenses this month" value={fmt(main.expenses.thisMonth)}
                    valueColor="#FB923C"
                    sub="General + operational"
                    to="/expenses"
                  />
                  <MetricCard
                    label="Payroll paid" value={fmt(main.payroll.paidThisMonth)}
                    sub="Net pay disbursed this month"
                    to="/payroll"
                  />
                </div>
              )}

              {/* Non-finance notice */}
              {!canSeeFinance && (
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: "#0A0E1C", border: "1px solid #111A2C" }}
                >
                  <Briefcase size={14} style={{ color: "#3E4F6E" }} />
                  <p className="text-sm" style={{ color: "#4A5E7A" }}>
                    Financial data is not available for your role.
                  </p>
                </div>
              )}

              {/* Alert pills */}
              {((canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0) ||
                main.alerts.expiringContracts > 0 ||
                main.alerts.overdueTasks > 0) && (
                <div className="flex flex-wrap gap-2">
                  {canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0 && (
                    <AlertPill
                      text={`${main.alerts.overdueInvoices} overdue invoice${main.alerts.overdueInvoices !== 1 ? "s" : ""}`}
                      bg="#2D0A0A" color="#F87171" border="#7F1D1D"
                      to="/invoices" navigate={navigate}
                    />
                  )}
                  {main.alerts.expiringContracts > 0 && (
                    <AlertPill
                      text={`${main.alerts.expiringContracts} contract${main.alerts.expiringContracts !== 1 ? "s" : ""} expiring within 30 days`}
                      bg="#2D1A00" color="#FCD34D" border="#78350F"
                      to="/contracts" navigate={navigate}
                    />
                  )}
                  {main.alerts.overdueTasks > 0 && (
                    <AlertPill
                      text={`${main.alerts.overdueTasks} overdue task${main.alerts.overdueTasks !== 1 ? "s" : ""}`}
                      bg="#2A1500" color="#FB923C" border="#7C2D12"
                      to="/tasks" navigate={navigate}
                    />
                  )}
                </div>
              )}

              {/* Revenue chart + Recent invoices */}
              {canSeeFinance && main.monthlyRevenue && main.recentInvoices && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2">
                    <SectionCard title="Revenue vs Expenses">
                      <div className="p-5">
                        <RevenueChart data={main.monthlyRevenue} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="lg:col-span-3">
                    <SectionCard title="Recent Invoices" action="View all" onAction={() => navigate("/invoices")}>
                      {main.recentInvoices.length === 0 ? (
                        <p className="text-xs p-5" style={{ color: "#4A5E7A" }}>No invoices yet.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead style={{ background: "#080C18", borderBottom: "1px solid #1C2A42" }}>
                            <tr>
                              <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#3E4F6E" }}>Invoice</th>
                              <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#3E4F6E" }}>Client</th>
                              <th className="text-right px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#3E4F6E" }}>Amount</th>
                              <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#3E4F6E" }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {main.recentInvoices.map((inv, i) => (
                              <tr
                                key={inv.id}
                                style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                <td className="px-5 py-3 font-semibold" style={{ color: "#E2EAF8" }}>{inv.invoiceNumber}</td>
                                <td className="px-5 py-3" style={{ color: "#7B8CB0" }}>{inv.client?.name ?? "—"}</td>
                                <td className="px-5 py-3 text-right font-semibold" style={{ color: "#CBD5E8" }}>{fmt(Number(inv.amount))}</td>
                                <td className="px-5 py-3"><InvoiceBadge status={inv.status} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </SectionCard>
                  </div>
                </div>
              )}

              {/* Recent payments */}
              {canSeeFinance && main.recentPayments && main.recentPayments.length > 0 && (
                <SectionCard title="Recent Payments" action="View invoices" onAction={() => navigate("/invoices")}>
                  <table className="w-full text-xs">
                    <thead style={{ background: "#080C18", borderBottom: "1px solid #1C2A42" }}>
                      <tr>
                        {["Date", "Client", "Invoice", "Method", "Amount"].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`} style={{ color: "#3E4F6E" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {main.recentPayments.map((p, i) => (
                        <tr
                          key={p.id}
                          style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td className="px-5 py-3" style={{ color: "#7B8CB0" }}>{fmtDate(p.paymentDate)}</td>
                          <td className="px-5 py-3" style={{ color: "#CBD5E8" }}>{p.invoice?.client?.name ?? "—"}</td>
                          <td className="px-5 py-3" style={{ color: "#7B8CB0" }}>{p.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="px-5 py-3" style={{ color: "#7B8CB0" }}>{p.paymentMethod}</td>
                          <td className="px-5 py-3 text-right font-semibold" style={{ color: "#10B981" }}>{fmt(Number(p.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* ══ OPERATIONS TAB ══ */}
      {tab === "operations" && canSeeOps && (
        <>
          {opsLoading ? <Spinner /> : ops ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active Sites"     value={ops.roster.activeSitesTotal}    icon={MapPin}       accentColor="#3B82F6" to="/sites"       />
                <StatCard label="Rostered Today"   value={ops.roster.sitesRosteredToday}  icon={CheckCircle}  accentColor="#10B981" to="/roster"      />
                <StatCard label="Officers on Duty" value={ops.roster.officersOnDutyToday} icon={Users}        accentColor="#8B5CF6" to="/operations"  />
                <StatCard label="Pending Review"   value={ops.operations.pendingReview}   icon={Clock}        accentColor="#F59E0B" to="/operations"  />
              </div>

              {ops.roster.sitesWithGapToday.length > 0 && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: "#2D0A0A", border: "1px solid #7F1D1D" }}
                >
                  <p className="text-sm font-semibold mb-2" style={{ color: "#F87171" }}>
                    Sites with no roster today ({ops.roster.sitesWithGapToday.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ops.roster.sitesWithGapToday.map((name) => (
                      <span
                        key={name}
                        className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: "#3D0D0D", color: "#FCA5A5", border: "1px solid #991B1B" }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <SectionCard title="Attendance this month">
                  <div className="p-5">
                    {Object.keys(ops.attendanceThisMonth).length === 0 ? (
                      <p className="text-xs" style={{ color: "#4A5E7A" }}>No records this month.</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(ops.attendanceThisMonth).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between text-xs">
                            <span style={{ color: "#7B8CB0" }}>{status.replace(/_/g, " ")}</span>
                            <span className="font-bold" style={{ color: "#E2EAF8" }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Recent Operations Records" action="View all" onAction={() => navigate("/operations")}>
                  {ops.recentOperations.length === 0 ? (
                    <p className="text-xs p-5" style={{ color: "#4A5E7A" }}>No records yet.</p>
                  ) : (
                    <div>
                      {ops.recentOperations.map((r, i) => (
                        <div
                          key={r.id}
                          className="px-5 py-3 flex items-center justify-between text-xs"
                          style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div>
                            <p className="font-semibold" style={{ color: "#E2EAF8" }}>{r.site?.siteName ?? "—"}</p>
                            <p className="mt-0.5" style={{ color: "#4A5E7A" }}>{fmtDate(r.date)} · {r.shiftType?.name ?? "—"}</p>
                          </div>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={
                              r.reviewStatus === "APPROVED" ? { background: "#052E16", color: "#4ADE80", border: "1px solid #14532D" } :
                              r.reviewStatus === "REJECTED" ? { background: "#2D0A0A", color: "#F87171", border: "1px solid #7F1D1D" } :
                              { background: "#2D1A00", color: "#FCD34D", border: "1px solid #78350F" }
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
            </div>
          ) : null}
        </>
      )}

      {/* ══ HR TAB ══ */}
      {tab === "hr" && canSeeHR && (
        <>
          {hrLoading ? <Spinner /> : hr ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Active Employees"  value={hr.employees.active}     icon={Users} accentColor="#10B981" to="/employees" />
                <StatCard label="Inactive"           value={hr.employees.inactive}   icon={Users} accentColor="#7B8CB0" to="/employees" />
                <StatCard label="Terminated"         value={hr.employees.terminated} icon={Users} accentColor="#F87171" to="/employees" />
              </div>

              {(hr.tasks.overdueCount > 0 || hr.openDepartmentRequests > 0) && (
                <div className="flex flex-wrap gap-2">
                  {hr.tasks.overdueCount > 0 && (
                    <AlertPill
                      text={`${hr.tasks.overdueCount} overdue task${hr.tasks.overdueCount !== 1 ? "s" : ""}`}
                      bg="#2A1500" color="#FB923C" border="#7C2D12"
                      to="/tasks" navigate={navigate}
                    />
                  )}
                  {hr.openDepartmentRequests > 0 && (
                    <AlertPill
                      text={`${hr.openDepartmentRequests} open department request${hr.openDepartmentRequests !== 1 ? "s" : ""}`}
                      bg="#0C1A40" color="#60A5FA" border="#1D3A6E"
                      to="/department-requests" navigate={navigate}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <SectionCard title="Employees by department">
                  <div className="p-5">
                    {hr.byDepartment.length === 0 ? (
                      <p className="text-xs" style={{ color: "#4A5E7A" }}>No departments.</p>
                    ) : (
                      <div className="space-y-3">
                        {hr.byDepartment.map((d) => (
                          <div key={d.department} className="flex items-center justify-between text-xs">
                            <span style={{ color: "#7B8CB0" }}>{d.department}</span>
                            <span className="font-bold" style={{ color: "#E2EAF8" }}>{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title={`Contracts expiring within 30 days (${hr.expiringContracts.length})`}>
                  {hr.expiringContracts.length === 0 ? (
                    <p className="text-xs p-5" style={{ color: "#4A5E7A" }}>None — all good.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto">
                      {hr.expiringContracts.map((c, i) => (
                        <div
                          key={c.id}
                          className="px-5 py-3 flex items-center justify-between text-xs"
                          style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div>
                            <p className="font-semibold" style={{ color: "#E2EAF8" }}>{c.employee?.fullName}</p>
                            <p className="mt-0.5" style={{ color: "#4A5E7A" }}>{c.employee?.position ?? c.payType}</p>
                          </div>
                          <span className="font-semibold" style={{ color: "#FCD34D" }}>{fmtDate(c.endDate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SectionCard
                  title={`Recent hires — last 30 days (${hr.recentHires.length})`}
                  action="View all" onAction={() => navigate("/employees")}
                >
                  {hr.recentHires.length === 0 ? (
                    <p className="text-xs p-5" style={{ color: "#4A5E7A" }}>No new hires in the last 30 days.</p>
                  ) : (
                    <div>
                      {hr.recentHires.map((e, i) => (
                        <div
                          key={e.id}
                          className="px-5 py-3 flex items-center justify-between text-xs"
                          style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                          onMouseEnter={(el) => (el.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}
                        >
                          <div>
                            <p className="font-semibold" style={{ color: "#E2EAF8" }}>{e.fullName}</p>
                            <p className="mt-0.5" style={{ color: "#4A5E7A" }}>{e.position ?? "—"}</p>
                          </div>
                          <span style={{ color: "#4A5E7A" }}>{fmtDate(e.dateAdded)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title={`Top overdue tasks (${hr.tasks.overdueCount})`}
                  action="View tasks" onAction={() => navigate("/tasks")}
                >
                  {hr.tasks.topOverdue.length === 0 ? (
                    <p className="text-xs p-5" style={{ color: "#4A5E7A" }}>No overdue tasks.</p>
                  ) : (
                    <div>
                      {hr.tasks.topOverdue.map((t, i) => (
                        <div
                          key={t.id}
                          className="px-5 py-3 text-xs"
                          style={{ borderTop: i > 0 ? "1px solid rgba(28,42,66,0.6)" : undefined }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold" style={{ color: "#E2EAF8" }}>{t.title}</p>
                            <PriorityBadge priority={t.priority} />
                          </div>
                          <p className="mt-0.5" style={{ color: "#4A5E7A" }}>
                            {t.assignedToEmployee?.fullName ?? t.department?.name ?? "Unassigned"} · Due {fmtDate(t.dueDate)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
