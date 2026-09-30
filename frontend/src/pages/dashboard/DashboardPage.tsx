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
function invoiceStatusClass(status: string) {
  switch (status) {
    case "PAID":      return "bg-green-100 text-green-700";
    case "OVERDUE":   return "bg-red-100 text-red-700";
    case "SENT":      return "bg-blue-100 text-blue-700";
    case "CANCELLED": return "bg-gray-100 text-gray-500";
    default:          return "bg-yellow-100 text-yellow-700";
  }
}
function priorityClass(p: string) {
  switch (p) {
    case "CRITICAL": return "bg-red-100 text-red-700";
    case "HIGH":     return "bg-orange-100 text-orange-700";
    case "MEDIUM":   return "bg-yellow-100 text-yellow-700";
    default:         return "bg-gray-100 text-gray-600";
  }
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Revenue bar chart ────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: { month: string; revenue: number; expenses?: number }[] }) {
  const safeData = data.map((d) => ({ ...d, revenue: Number(d.revenue ?? 0), expenses: Number(d.expenses ?? 0) }));
  const max = Math.max(...safeData.flatMap((d) => [d.revenue, d.expenses]), 1);
  return (
    <div className="min-w-0 w-full">
      <div className="flex items-end justify-around h-40 overflow-x-auto">
        {safeData.map((d) => (
          <div key={d.month} className="flex flex-col items-center gap-1.5 flex-1">
            <div className="flex items-end gap-2 h-32 group justify-center">
              <div
                className="w-7 rounded-md opacity-85 group-hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max((d.revenue / max) * 120, 4)}px`, background: "linear-gradient(to top, #15803d, #4ade80)" }}
                title={`Revenue — ${d.month}: ${fmt(d.revenue)}`}
              />
              <div
                className="w-7 rounded-md opacity-85 group-hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max((d.expenses / max) * 120, 4)}px`, background: "linear-gradient(to top, #1d4ed8, #60a5fa)" }}
                title={`Expenses — ${d.month}: ${fmt(d.expenses)}`}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "linear-gradient(to top, #15803d, #4ade80)" }} /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "linear-gradient(to top, #1d4ed8, #60a5fa)" }} /> Expenses
        </span>
      </div>
    </div>
  );
}

// ── Gradient stat card ───────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, icon: Icon, gradient, to }: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label?: string } | null;
  icon: React.ElementType;
  gradient: string;   // e.g. "from-emerald-500 to-emerald-700"
  to?: string;
}) {
  const navigate = useNavigate();
  const clickable = !!to;
  const isUp = trend && trend.value >= 0;

  return (
    <div
      className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-md
        ${clickable ? "cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] transition-all duration-200" : ""}`}
      onClick={clickable ? () => navigate(to!) : undefined}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="bg-white/20 rounded-xl p-2.5">
          <Icon size={20} className="text-white" />
        </div>
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full
            ${isUp ? "bg-white/20 text-white" : "bg-white/20 text-white"}`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isUp ? "+" : ""}{trend.value}%
          </div>
        )}
        {clickable && !trend && (
          <ArrowRight size={15} className="text-white/60 mt-1" />
        )}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold tracking-tight leading-none">{value}</div>
        <div className="text-sm text-white/80 mt-1 font-medium">{label}</div>
        {sub && <div className="text-xs text-white/60 mt-0.5">{sub}</div>}
        {trend?.label && (
          <div className="text-xs text-white/60 mt-0.5">{trend.label}</div>
        )}
      </div>
    </div>
  );
}

// ── Finance metric card (white) ──────────────────────────────────────────────
function MetricCard({ label, value, sub, accent, trend, to }: {
  label: string; value: string; sub?: string;
  accent: string; trend?: { value: number } | null; to?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className={`bg-white border border-gray-100 rounded-2xl p-5 shadow-sm
        ${to ? "cursor-pointer hover:shadow-md hover:border-gray-200 transition-all duration-200" : ""}`}
      onClick={to ? () => navigate(to) : undefined}
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium
          ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {trend.value >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend.value >= 0 ? "+" : ""}{trend.value}% vs last month
        </div>
      )}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Alert pill ───────────────────────────────────────────────────────────────
function AlertPill({ text, color, to, navigate }: {
  text: string; color: string; to: string; navigate: (p: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${color} text-xs font-medium rounded-xl px-3.5 py-2
        cursor-pointer hover:brightness-95 transition-all`}
      onClick={() => navigate(to)}
    >
      <AlertTriangle size={13} />
      {text}
      <ArrowRight size={11} className="ml-0.5 opacity-60" />
    </div>
  );
}

// ── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {action && onAction && (
          <button onClick={onAction}
            className="text-xs text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-700">
            {action} <ArrowRight size={11} />
          </button>
        )}
      </div>
      {children}
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
    <div className="space-y-6">

      {/* ── Welcome header ── */}
      <div className="bg-gradient-to-r from-[#0f2d52] to-[#1a4a7a] rounded-2xl px-6 py-5 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60 font-medium">{greeting()},</p>
            <h1 className="text-2xl font-bold mt-0.5">{user?.fullName}</h1>
            <p className="text-sm text-white/50 mt-0.5">
              {role} · Magen Security System
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5">
            <Shield size={18} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white/90">
              {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150
              ${tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {tab === "overview" && (
        <>
          {mainLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              Loading dashboard…
            </div>
          ) : main ? (
            <div className="space-y-5">

              {/* Core stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Active Clients" value={main.counts.activeClients}
                  sub="Click to view all clients"
                  icon={Building2} gradient="from-emerald-500 to-emerald-700" to="/clients"
                />
                <StatCard
                  label="Active Sites" value={main.counts.activeSites}
                  sub="Click to manage sites"
                  icon={MapPin} gradient="from-blue-500 to-blue-700" to="/sites"
                />
                <StatCard
                  label="Active Employees" value={main.counts.activeEmployees}
                  sub="Click to view workforce"
                  icon={Users} gradient="from-violet-500 to-violet-700" to="/employees"
                />
              </div>

              {/* Finance metric cards */}
              {canSeeFinance && main.revenue && main.expenses && main.payroll && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    label="Revenue this month" value={fmt(main.revenue.thisMonth)}
                    accent="text-gray-900"
                    trend={main.revenue.changePercent !== null ? { value: main.revenue.changePercent } : null}
                    to="/invoices"
                  />
                  <MetricCard
                    label="Outstanding balance" value={fmt(main.outstandingBalance ?? 0)}
                    accent="text-red-600"
                    sub={main.alerts.overdueInvoices !== null
                      ? `${main.alerts.overdueInvoices} overdue invoice${main.alerts.overdueInvoices !== 1 ? "s" : ""}`
                      : undefined}
                    to="/invoices"
                  />
                  <MetricCard
                    label="Expenses this month" value={fmt(main.expenses.thisMonth)}
                    accent="text-orange-600"
                    sub="General + operational"
                    to="/expenses"
                  />
                  <MetricCard
                    label="Payroll paid" value={fmt(main.payroll.paidThisMonth)}
                    accent="text-gray-900"
                    sub="Net pay disbursed this month"
                    to="/payroll"
                  />
                </div>
              )}

              {/* Non-finance notice */}
              {!canSeeFinance && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <Briefcase size={15} className="text-gray-400 shrink-0" />
                  <p className="text-sm text-gray-500">Financial data is not available for your role.</p>
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
                      color="bg-red-50 border border-red-200 text-red-700"
                      to="/invoices" navigate={navigate}
                    />
                  )}
                  {main.alerts.expiringContracts > 0 && (
                    <AlertPill
                      text={`${main.alerts.expiringContracts} contract${main.alerts.expiringContracts !== 1 ? "s" : ""} expiring within 30 days`}
                      color="bg-amber-50 border border-amber-200 text-amber-700"
                      to="/contracts" navigate={navigate}
                    />
                  )}
                  {main.alerts.overdueTasks > 0 && (
                    <AlertPill
                      text={`${main.alerts.overdueTasks} overdue task${main.alerts.overdueTasks !== 1 ? "s" : ""}`}
                      color="bg-orange-50 border border-orange-200 text-orange-700"
                      to="/tasks" navigate={navigate}
                    />
                  )}
                </div>
              )}

              {/* Revenue chart + Recent invoices */}
              {canSeeFinance && main.monthlyRevenue && main.recentInvoices && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
                  <div className="lg:col-span-2 flex flex-col">
                    <SectionCard title="Revenue vs Expenses — last 3 months">
                      <div className="p-5 flex-1 flex items-end">
                        <RevenueChart data={main.monthlyRevenue} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="lg:col-span-3 flex flex-col">
                    <SectionCard title="Recent Invoices" action="View all" onAction={() => navigate("/invoices")}>
                      {main.recentInvoices.length === 0 ? (
                        <p className="text-xs text-gray-400 p-4">No invoices yet.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] tracking-wide">
                            <tr>
                              <th className="text-left px-5 py-2.5">Invoice</th>
                              <th className="text-left px-5 py-2.5">Client</th>
                              <th className="text-right px-5 py-2.5">Amount</th>
                              <th className="text-left px-5 py-2.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {main.recentInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-5 py-2.5 font-semibold text-gray-800">{inv.invoiceNumber}</td>
                                <td className="px-5 py-2.5 text-gray-500">{inv.client?.name ?? "—"}</td>
                                <td className="px-5 py-2.5 text-right font-medium text-gray-800">{fmt(Number(inv.amount))}</td>
                                <td className="px-5 py-2.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${invoiceStatusClass(inv.status)}`}>
                                    {inv.status}
                                  </span>
                                </td>
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
                    <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-2.5">Date</th>
                        <th className="text-left px-5 py-2.5">Client</th>
                        <th className="text-left px-5 py-2.5">Invoice</th>
                        <th className="text-left px-5 py-2.5">Method</th>
                        <th className="text-right px-5 py-2.5">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {main.recentPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-2.5 text-gray-500">{fmtDate(p.paymentDate)}</td>
                          <td className="px-5 py-2.5 text-gray-800">{p.invoice?.client?.name ?? "—"}</td>
                          <td className="px-5 py-2.5 text-gray-500">{p.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="px-5 py-2.5 text-gray-500">{p.paymentMethod}</td>
                          <td className="px-5 py-2.5 text-right font-semibold text-emerald-700">{fmt(Number(p.amount))}</td>
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
          {opsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              Loading…
            </div>
          ) : ops ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active Sites"         value={ops.roster.activeSitesTotal}    icon={MapPin}       gradient="from-blue-500 to-blue-700"     to="/sites"      />
                <StatCard label="Rostered Today"       value={ops.roster.sitesRosteredToday}  icon={CheckCircle}  gradient="from-emerald-500 to-emerald-700" to="/roster"    />
                <StatCard label="Officers on Duty"     value={ops.roster.officersOnDutyToday} icon={Users}        gradient="from-violet-500 to-violet-700"  to="/operations" />
                <StatCard label="Pending Review"       value={ops.operations.pendingReview}   icon={Clock}        gradient="from-orange-500 to-orange-700"  to="/operations" />
              </div>

              {ops.roster.sitesWithGapToday.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-red-700 mb-2">
                    Sites with no roster today ({ops.roster.sitesWithGapToday.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ops.roster.sitesWithGapToday.map((name) => (
                      <span key={name} className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-medium">{name}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <SectionCard title="Attendance this month">
                  <div className="p-4">
                    {Object.keys(ops.attendanceThisMonth).length === 0 ? (
                      <p className="text-xs text-gray-400">No records this month.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {Object.entries(ops.attendanceThisMonth).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 font-medium">{status.replace(/_/g, " ")}</span>
                            <span className="font-bold text-gray-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Recent Operations Records" action="View all" onAction={() => navigate("/operations")}>
                  {ops.recentOperations.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No records yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {ops.recentOperations.map((r) => (
                        <div key={r.id} className="px-5 py-3 flex items-center justify-between text-xs hover:bg-gray-50/50">
                          <div>
                            <p className="font-semibold text-gray-800">{r.site?.siteName ?? "—"}</p>
                            <p className="text-gray-400 mt-0.5">{fmtDate(r.date)} · {r.shiftType?.name ?? "—"}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            r.reviewStatus === "APPROVED" ? "bg-green-100 text-green-700" :
                            r.reviewStatus === "REJECTED" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"}`}>
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
          {hrLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              Loading…
            </div>
          ) : hr ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Active Employees"  value={hr.employees.active}     icon={Users} gradient="from-emerald-500 to-emerald-700" to="/employees" />
                <StatCard label="Inactive"           value={hr.employees.inactive}   icon={Users} gradient="from-gray-400 to-gray-600"       to="/employees" />
                <StatCard label="Terminated"         value={hr.employees.terminated} icon={Users} gradient="from-red-500 to-red-700"          to="/employees" />
              </div>

              {(hr.tasks.overdueCount > 0 || hr.openDepartmentRequests > 0) && (
                <div className="flex flex-wrap gap-2">
                  {hr.tasks.overdueCount > 0 && (
                    <AlertPill
                      text={`${hr.tasks.overdueCount} overdue task${hr.tasks.overdueCount !== 1 ? "s" : ""}`}
                      color="bg-orange-50 border border-orange-200 text-orange-700"
                      to="/tasks" navigate={navigate}
                    />
                  )}
                  {hr.openDepartmentRequests > 0 && (
                    <AlertPill
                      text={`${hr.openDepartmentRequests} open department request${hr.openDepartmentRequests !== 1 ? "s" : ""}`}
                      color="bg-blue-50 border border-blue-200 text-blue-700"
                      to="/department-requests" navigate={navigate}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <SectionCard title="Employees by department">
                  <div className="p-4">
                    {hr.byDepartment.length === 0 ? (
                      <p className="text-xs text-gray-400">No departments.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {hr.byDepartment.map((d) => (
                          <div key={d.department} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 font-medium">{d.department}</span>
                            <span className="font-bold text-gray-900">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title={`Contracts expiring within 30 days (${hr.expiringContracts.length})`}>
                  {hr.expiringContracts.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">None — all good.</p>
                  ) : (
                    <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                      {hr.expiringContracts.map((c) => (
                        <div key={c.id} className="px-5 py-3 flex items-center justify-between text-xs hover:bg-gray-50/50">
                          <div>
                            <p className="font-semibold text-gray-800">{c.employee?.fullName}</p>
                            <p className="text-gray-400 mt-0.5">{c.employee?.position ?? c.payType}</p>
                          </div>
                          <span className="text-amber-700 font-semibold">{fmtDate(c.endDate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SectionCard title={`Recent hires — last 30 days (${hr.recentHires.length})`} action="View all" onAction={() => navigate("/employees")}>
                  {hr.recentHires.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No new hires in the last 30 days.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {hr.recentHires.map((e) => (
                        <div key={e.id} className="px-5 py-3 flex items-center justify-between text-xs hover:bg-gray-50/50">
                          <div>
                            <p className="font-semibold text-gray-800">{e.fullName}</p>
                            <p className="text-gray-400 mt-0.5">{e.position ?? "—"}</p>
                          </div>
                          <span className="text-gray-400">{fmtDate(e.dateAdded)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title={`Top overdue tasks (${hr.tasks.overdueCount})`} action="View tasks" onAction={() => navigate("/tasks")}>
                  {hr.tasks.topOverdue.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No overdue tasks.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {hr.tasks.topOverdue.map((t) => (
                        <div key={t.id} className="px-5 py-3 text-xs hover:bg-gray-50/50">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-800">{t.title}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${priorityClass(t.priority)}`}>
                              {t.priority}
                            </span>
                          </div>
                          <p className="text-gray-400 mt-0.5">
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
