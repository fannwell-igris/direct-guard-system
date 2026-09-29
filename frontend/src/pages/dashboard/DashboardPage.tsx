import { useEffect, useState } from "react";
import { Users, Building2, MapPin, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, DollarSign } from "lucide-react";
import api from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

// ---- Role constants ----

const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);
const OPS_ROLES = new Set(["ADMIN", "MANAGER", "OPERATIONS", "HR", "PAYROLL"]);
const HR_ROLES = new Set(["ADMIN", "MANAGER", "HR", "PAYROLL"]);

// ---- Types ----

interface MainDashboard {
  counts: { activeClients: number; activeSites: number; activeEmployees: number; activeGuards: number };
  revenue: { thisMonth: number; lastMonth: number; changePercent: number | null } | null;
  outstandingBalance: number | null;
  expenses: { thisMonth: number } | null;
  payroll: { paidThisMonth: number } | null;
  alerts: {
    overdueInvoices: number | null;
    expiringContracts: number;
    overdueTasks: number;
  };
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

// ---- Helpers ----

function fmt(n: number | null | undefined) {
  const val = Number(n ?? 0);
  return `K ${(isNaN(val) ? 0 : val).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function invoiceStatusClass(status: string) {
  switch (status) {
    case "PAID": return "bg-green-100 text-green-700";
    case "OVERDUE": return "bg-red-100 text-red-700";
    case "SENT": return "bg-blue-100 text-blue-700";
    case "CANCELLED": return "bg-gray-100 text-gray-500";
    default: return "bg-yellow-100 text-yellow-700";
  }
}

function priorityClass(p: string) {
  switch (p) {
    case "CRITICAL": return "bg-red-100 text-red-700";
    case "HIGH": return "bg-orange-100 text-orange-700";
    case "MEDIUM": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

// ---- Mini revenue vs expenses bar chart (pure CSS) — last 3 months ----
function RevenueChart({ data }: { data: { month: string; revenue: number; expenses?: number }[] }) {
  const safeData = data.map((d) => ({ ...d, revenue: Number(d.revenue ?? 0), expenses: Number(d.expenses ?? 0) }));
  const max = Math.max(...safeData.flatMap((d) => [d.revenue, d.expenses]), 1);
  return (
    <div className="min-w-0">
      {/* overflow-x-auto + justify-start (not justify-center) is deliberate:
          if this ever gets handed more months than fit the card (e.g. a
          data-shape mismatch like the one that caused this to spill into
          the neighboring "Recent Invoices" card), it scrolls inside its own
          box instead of overflowing equally past both edges of the card. */}
      <div className="flex items-end justify-start gap-8 h-24 overflow-x-auto">
        {safeData.map((d) => (
          <div key={d.month} className="flex flex-col items-center gap-1.5">
            <div className="flex items-end gap-1.5 h-20 group">
              <div
                className="w-5 bg-magen-green rounded-sm opacity-85 group-hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max((d.revenue / max) * 80, 2)}px` }}
                title={`Revenue — ${d.month}: ${fmt(d.revenue)}`}
              />
              <div
                className="w-5 bg-blue-500 rounded-sm opacity-85 group-hover:opacity-100 transition-opacity"
                style={{ height: `${Math.max((d.expenses / max) * 80, 2)}px` }}
                title={`Expenses — ${d.month}: ${fmt(d.expenses)}`}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
              {d.month}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-magen-green inline-block" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Expenses
        </span>
      </div>
    </div>
  );
}

// ---- Stat card ----
function StatCard({ label, value, sub, icon: Icon, bg, iconBg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; bg: string; iconBg: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`${iconBg} text-white rounded-full p-2.5 shrink-0`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-semibold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs text-gray-500 leading-tight">{label}</div>
        {sub && <div className="text-xs text-gray-400 leading-tight mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const canSeeFinance = FINANCE_ROLES.has(role);
  const canSeeOps = OPS_ROLES.has(role);
  const canSeeHR = HR_ROLES.has(role);

  // Default tab: OPERATIONS/STAFF who can only see ops land on Operations tab
  const defaultTab: Tab =
    !canSeeFinance && !canSeeHR && canSeeOps ? "operations" : "overview";

  const [tab, setTab] = useState<Tab>(defaultTab);

  const [main, setMain] = useState<MainDashboard | null>(null);
  const [ops, setOps] = useState<OperationsDashboard | null>(null);
  const [hr, setHr] = useState<HRDashboard | null>(null);

  const [mainLoading, setMainLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [hrLoading, setHrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMainLoading(true);
    api.get("/dashboard/main")
      .then((res) => setMain(res.data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Failed to load dashboard."))
      .finally(() => setMainLoading(false));

    // If the default tab is operations, pre-fetch it immediately
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

  // Build visible tabs based on role
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    ...(canSeeOps ? [{ key: "operations" as Tab, label: "Operations" }] : []),
    ...(canSeeHR ? [{ key: "hr" as Tab, label: "HR" }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {user?.fullName} ({user?.role})
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={`pb-2 text-sm font-medium ${tab === t.key ? "border-b-2 border-green-600 text-green-600" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <>
          {mainLoading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : main ? (
            <div className="space-y-6">
              {/* Stat cards — visible to all roles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Active Clients" value={main.counts.activeClients} icon={Building2} bg="bg-emerald-50" iconBg="bg-emerald-600" />
                <StatCard label="Active Sites" value={main.counts.activeSites} icon={MapPin} bg="bg-blue-50" iconBg="bg-blue-500" />
                <StatCard label="Active Employees" value={main.counts.activeEmployees} icon={Users} bg="bg-amber-50" iconBg="bg-amber-500" />
                <StatCard label="Active Guards" value={main.counts.activeGuards} icon={Users} bg="bg-indigo-50" iconBg="bg-indigo-500" />
              </div>

              {/* Finance cards — finance roles only */}
              {canSeeFinance && main.revenue && main.expenses && main.payroll && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Revenue this month</p>
                    <p className="text-lg font-semibold text-gray-900">{fmt(main.revenue.thisMonth)}</p>
                    {main.revenue.changePercent !== null && (
                      <div className={`flex items-center gap-1 mt-1 text-xs ${main.revenue.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {main.revenue.changePercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {main.revenue.changePercent >= 0 ? "+" : ""}{main.revenue.changePercent}% vs last month
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Outstanding balance</p>
                    <p className="text-lg font-semibold text-red-600">{fmt(main.outstandingBalance ?? 0)}</p>
                    {main.alerts.overdueInvoices !== null && (
                      <p className="text-xs text-gray-400 mt-1">{main.alerts.overdueInvoices} overdue invoice{main.alerts.overdueInvoices !== 1 ? "s" : ""}</p>
                    )}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Expenses this month</p>
                    <p className="text-lg font-semibold text-orange-600">{fmt(main.expenses.thisMonth)}</p>
                    <p className="text-xs text-gray-400 mt-1">General + operational</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-1">Payroll paid this month</p>
                    <p className="text-lg font-semibold text-gray-900">{fmt(main.payroll.paidThisMonth)}</p>
                    <p className="text-xs text-gray-400 mt-1">Net pay disbursed</p>
                  </div>
                </div>
              )}

              {/* Non-finance notice */}
              {!canSeeFinance && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
                  Financial data (revenue, expenses, payroll, invoices) is not available for your role.
                </div>
              )}

              {/* Alerts row — visible to all roles (finance-only alerts gated) */}
              {(
                (canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0) ||
                main.alerts.expiringContracts > 0 ||
                main.alerts.overdueTasks > 0
              ) && (
                <div className="flex flex-wrap gap-3">
                  {canSeeFinance && (main.alerts.overdueInvoices ?? 0) > 0 && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                      <AlertTriangle size={13} />
                      {main.alerts.overdueInvoices} overdue invoice{main.alerts.overdueInvoices !== 1 ? "s" : ""}
                    </div>
                  )}
                  {main.alerts.expiringContracts > 0 && (
                    <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs rounded-lg px-3 py-2">
                      <Clock size={13} />
                      {main.alerts.expiringContracts} contract{main.alerts.expiringContracts !== 1 ? "s" : ""} expiring within 30 days
                    </div>
                  )}
                  {main.alerts.overdueTasks > 0 && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs rounded-lg px-3 py-2">
                      <AlertTriangle size={13} />
                      {main.alerts.overdueTasks} overdue task{main.alerts.overdueTasks !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}

              {/* Revenue chart + Recent invoices — finance roles only */}
              {canSeeFinance && main.monthlyRevenue && main.recentInvoices && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 overflow-hidden min-w-0">
                    <p className="text-sm font-medium text-gray-700 mb-3">Revenue vs Expenses — last 3 months</p>
                    <RevenueChart data={main.monthlyRevenue} />
                  </div>

                  <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
                    <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">Recent Invoices</p>
                    {main.recentInvoices.length === 0 ? (
                      <p className="text-xs text-gray-400 p-4">No invoices yet.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-400 uppercase">
                          <tr>
                            <th className="text-left px-4 py-2">Invoice</th>
                            <th className="text-left px-4 py-2">Client</th>
                            <th className="text-right px-4 py-2">Amount</th>
                            <th className="text-left px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {main.recentInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="px-4 py-2 font-medium text-gray-800">{inv.invoiceNumber}</td>
                              <td className="px-4 py-2 text-gray-600">{inv.client?.name ?? "—"}</td>
                              <td className="px-4 py-2 text-right">{fmt(Number(inv.amount))}</td>
                              <td className="px-4 py-2">
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${invoiceStatusClass(inv.status)}`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Recent payments — finance roles only */}
              {canSeeFinance && main.recentPayments && main.recentPayments.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">Recent Payments</p>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-400 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Client</th>
                        <th className="text-left px-4 py-2">Invoice</th>
                        <th className="text-left px-4 py-2">Method</th>
                        <th className="text-right px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {main.recentPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-gray-600">{fmtDate(p.paymentDate)}</td>
                          <td className="px-4 py-2 text-gray-800">{p.invoice?.client?.name ?? "—"}</td>
                          <td className="px-4 py-2 text-gray-600">{p.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="px-4 py-2 text-gray-600">{p.paymentMethod}</td>
                          <td className="px-4 py-2 text-right font-medium text-green-700">{fmt(Number(p.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* ── OPERATIONS TAB ── */}
      {tab === "operations" && canSeeOps && (
        <>
          {opsLoading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : ops ? (
            <div className="space-y-6">
              {/* Roster cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active Sites" value={ops.roster.activeSitesTotal} icon={MapPin} bg="bg-blue-50" iconBg="bg-blue-500" />
                <StatCard label="Sites Rostered Today" value={ops.roster.sitesRosteredToday} icon={CheckCircle} bg="bg-emerald-50" iconBg="bg-emerald-600" />
                <StatCard label="Officers on Duty" value={ops.roster.officersOnDutyToday} icon={Users} bg="bg-amber-50" iconBg="bg-amber-500" />
                <StatCard label="Pending Review" value={ops.operations.pendingReview} icon={Clock} bg="bg-orange-50" iconBg="bg-orange-500" />
              </div>

              {/* Sites with roster gap */}
              {ops.roster.sitesWithGapToday.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-red-700 mb-2">
                    Sites with no roster today ({ops.roster.sitesWithGapToday.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ops.roster.sitesWithGapToday.map((name) => (
                      <span key={name} className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">{name}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Attendance this month */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Attendance this month</p>
                  {Object.keys(ops.attendanceThisMonth).length === 0 ? (
                    <p className="text-xs text-gray-400">No attendance records this month.</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(ops.attendanceThisMonth).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{status.replace(/_/g, " ")}</span>
                          <span className="font-semibold text-gray-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent operations records */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">Recent Operations Records</p>
                  {ops.recentOperations.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No records yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {ops.recentOperations.map((r) => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-gray-800">{r.site?.siteName ?? "—"}</p>
                            <p className="text-gray-400">{fmtDate(r.date)} · {r.shiftType?.name ?? "—"}</p>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            r.reviewStatus === "APPROVED" ? "bg-green-100 text-green-700" :
                            r.reviewStatus === "REJECTED" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>
                            {r.reviewStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* ── HR TAB ── */}
      {tab === "hr" && canSeeHR && (
        <>
          {hrLoading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : hr ? (
            <div className="space-y-6">
              {/* Employee counts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Active Employees" value={hr.employees.active} icon={Users} bg="bg-emerald-50" iconBg="bg-emerald-600" />
                <StatCard label="Inactive" value={hr.employees.inactive} icon={Users} bg="bg-gray-50" iconBg="bg-gray-400" />
                <StatCard label="Terminated" value={hr.employees.terminated} icon={Users} bg="bg-red-50" iconBg="bg-red-400" />
              </div>

              {/* Alerts */}
              {(hr.tasks.overdueCount > 0 || hr.openDepartmentRequests > 0) && (
                <div className="flex flex-wrap gap-3">
                  {hr.tasks.overdueCount > 0 && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs rounded-lg px-3 py-2">
                      <AlertTriangle size={13} />
                      {hr.tasks.overdueCount} overdue task{hr.tasks.overdueCount !== 1 ? "s" : ""}
                    </div>
                  )}
                  {hr.openDepartmentRequests > 0 && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-lg px-3 py-2">
                      <DollarSign size={13} />
                      {hr.openDepartmentRequests} open department request{hr.openDepartmentRequests !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Employees by department */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Employees by department</p>
                  {hr.byDepartment.length === 0 ? (
                    <p className="text-xs text-gray-400">No departments.</p>
                  ) : (
                    <div className="space-y-2">
                      {hr.byDepartment.map((d) => (
                        <div key={d.department} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{d.department}</span>
                          <span className="font-semibold text-gray-900">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contracts expiring */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">
                    Contracts expiring within 30 days ({hr.expiringContracts.length})
                  </p>
                  {hr.expiringContracts.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">None — all good.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                      {hr.expiringContracts.map((c) => (
                        <div key={c.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-gray-800">{c.employee?.fullName}</p>
                            <p className="text-gray-400">{c.employee?.position ?? c.payType}</p>
                          </div>
                          <span className="text-yellow-700 font-medium">{fmtDate(c.endDate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent hires + overdue tasks */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">
                    Recent hires — last 30 days ({hr.recentHires.length})
                  </p>
                  {hr.recentHires.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No new hires in the last 30 days.</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {hr.recentHires.map((e) => (
                        <div key={e.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-gray-800">{e.fullName}</p>
                            <p className="text-gray-400">{e.position ?? "—"}</p>
                          </div>
                          <span className="text-gray-400">{fmtDate(e.dateAdded)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <p className="text-sm font-medium text-gray-700 px-4 py-3 border-b border-gray-100">
                    Top overdue tasks ({hr.tasks.overdueCount})
                  </p>
                  {hr.tasks.topOverdue.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4">No overdue tasks.</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {hr.tasks.topOverdue.map((t) => (
                        <div key={t.id} className="px-4 py-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-800">{t.title}</p>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${priorityClass(t.priority)}`}>
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
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
