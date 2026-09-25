import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, AlertCircle, Info, RefreshCw,
  FileText, FileCheck, Package, CheckSquare,
  BarChart2, DollarSign, MapPin, ShieldAlert,
  CheckCircle2, FileX, Inbox,
} from "lucide-react";
import api from "../../api/client";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Category =
  | "INVOICE_OVERDUE"
  | "CONTRACT_EXPIRING"
  | "PROPERTY_NOT_RETURNED"
  | "PROPERTY_WITH_ABSCONDED_EMPLOYEE"
  | "TASK_OVERDUE"
  | "LOW_STOCK"
  | "PAYROLL_DUE"
  | "ROSTER_GAP"
  | "SITE_UNMANNED"
  | "INVOICE_DUE"
  | "INVOICE_PAID"
  | "CONTRACT_ENDED"
  | "DEPARTMENT_REQUEST_PENDING";

interface Alert {
  category: Category;
  severity: Severity;
  message: string;
  referenceId: string;
  referenceType: string;
  data: Record<string, unknown>;
}

interface AlertsResponse {
  total: number;
  alerts: Alert[];
  grouped: Record<string, Alert[]>;
}

// ---- Config maps ----

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; badge: string; icon: React.ElementType }> = {
  CRITICAL: { label: "Critical",  dot: "bg-red-600",    badge: "bg-red-100 text-red-700 border border-red-200",    icon: AlertCircle },
  HIGH:     { label: "High",      dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700 border border-orange-200", icon: AlertTriangle },
  MEDIUM:   { label: "Medium",    dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-700 border border-yellow-200", icon: AlertTriangle },
  LOW:      { label: "Low",       dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-700 border border-blue-200",   icon: Info },
};

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ElementType }> = {
  INVOICE_OVERDUE:       { label: "Overdue Invoices",         icon: FileText },
  CONTRACT_EXPIRING:     { label: "Contracts Expiring Soon",  icon: FileCheck },
  PROPERTY_NOT_RETURNED: { label: "Property Not Returned",    icon: Package },
  PROPERTY_WITH_ABSCONDED_EMPLOYEE: { label: "Absconded — Property Not Returned", icon: Package },
  TASK_OVERDUE:          { label: "Overdue Tasks",            icon: CheckSquare },
  LOW_STOCK:             { label: "Low Stock",                icon: BarChart2 },
  PAYROLL_DUE:           { label: "Payroll Due",              icon: DollarSign },
  ROSTER_GAP:            { label: "Roster Gaps",              icon: MapPin },
  SITE_UNMANNED:         { label: "Sites Unmanned (after 18:00)", icon: ShieldAlert },
  INVOICE_DUE:           { label: "Invoice Due",                icon: DollarSign },
  INVOICE_PAID:          { label: "Invoices Paid",              icon: CheckCircle2 },
  CONTRACT_ENDED:        { label: "Contracts Ended",            icon: FileX },
  DEPARTMENT_REQUEST_PENDING: { label: "Department Requests",   icon: Inbox },
};

const CATEGORY_ORDER: Category[] = [
  "SITE_UNMANNED",
  "PROPERTY_WITH_ABSCONDED_EMPLOYEE",
  "DEPARTMENT_REQUEST_PENDING",
  "INVOICE_DUE",
  "INVOICE_OVERDUE",
  "CONTRACT_ENDED",
  "PAYROLL_DUE",
  "ROSTER_GAP",
  "CONTRACT_EXPIRING",
  "TASK_OVERDUE",
  "PROPERTY_NOT_RETURNED",
  "LOW_STOCK",
  "INVOICE_PAID",
];

// ---- Component ----

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const res = await api.get("/alerts");
      setData(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load alerts.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = data?.total ?? 0;
  const criticalCount = data?.alerts.filter((a) => a.severity === "CRITICAL").length ?? 0;
  const highCount = data?.alerts.filter((a) => a.severity === "HIGH").length ?? 0;

  // Build ordered category list from what the server returned
  const presentCategories = CATEGORY_ORDER.filter(
    (c) => data?.grouped[c]?.length
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? "Loading…" : `${total} item${total === 1 ? "" : "s"} needing attention`}
            {criticalCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertCircle size={13} /> {criticalCount} critical
              </span>
            )}
            {highCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-700 font-medium">
                <AlertTriangle size={13} /> {highCount} high
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={isLoading || isRefreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 bg-white rounded-lg px-3 py-1.5 shadow-sm hover:shadow disabled:opacity-40"
        >
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Summary chips */}
      {!isLoading && data && total > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["CRITICAL", "HIGH", "MEDIUM"] as Severity[]).map((s) => {
            const count = data.alerts.filter((a) => a.severity === s).length;
            if (!count) return null;
            const cfg = SEVERITY_CONFIG[s];
            return (
              <span key={s} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {count} {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Alert groups */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : total === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckSquare size={20} className="text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-800">All clear</p>
          <p className="text-xs text-gray-400 mt-1">Nothing needs attention right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {presentCategories.map((cat) => {
            const alerts = data!.grouped[cat];
            const catCfg = CATEGORY_CONFIG[cat] ?? { label: cat, icon: AlertTriangle };
            const CatIcon = catCfg.icon;
            return (
              <div key={cat} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <CatIcon size={15} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-gray-700">{catCfg.label}</span>
                  <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
                    {alerts.length}
                  </span>
                </div>

                {/* Alert rows */}
                <ul className="divide-y divide-gray-100">
                  {alerts.map((alert) => {
                    const sevCfg = SEVERITY_CONFIG[alert.severity];
                    const SevIcon = sevCfg.icon;
                    return (
                      <li key={`${alert.referenceId}-${alert.category}`} className="flex items-start gap-3 px-4 py-3">
                        <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          alert.severity === "CRITICAL" ? "bg-red-100" :
                          alert.severity === "HIGH"     ? "bg-orange-100" :
                          alert.severity === "MEDIUM"   ? "bg-yellow-100" : "bg-blue-100"
                        }`}>
                          <SevIcon size={13} className={
                            alert.severity === "CRITICAL" ? "text-red-600" :
                            alert.severity === "HIGH"     ? "text-orange-600" :
                            alert.severity === "MEDIUM"   ? "text-yellow-600" : "text-blue-500"
                          } />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-snug">{alert.message}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sevCfg.badge}`}>
                          {sevCfg.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
