import { useEffect, useState } from "react";
import api from "../../api/client";

type Period = "today" | "week" | "month";

interface FunnelStep { stage: string; label: string; count: number; }

interface MarketerOption { id: string; fullName: string; role: string; }

interface DashboardData {
  period: { type: Period; from: string; to: string };
  metrics: {
    newProspects: number;
    qualifiedProspects: number;
    followUpsDue: number;
    meetingsLogged: number;
    proposalsQuotationsSent: number;
    newClientsAcquired: number;
    opportunitiesInProgress: number;
    lostOpportunities: number;
    leadsConvertedAllTime: number;
    lostAllTime: number;
    estimatedPipelineValue: string | number;
    totalActivities: number;
  };
  activityByType: Record<string, number>;
  funnel: FunnelStep[];
}

// Brief section 9: "Marketing Reports (Daily/Weekly/Monthly)" — these map
// directly onto the dashboard endpoint's existing today/week/month
// periods, just labeled the way a report picker names them.
const PERIODS: { label: string; value: Period }[] = [
  { label: "Daily", value: "today" },
  { label: "Weekly", value: "week" },
  { label: "Monthly", value: "month" },
];

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Marketing Reports (brief section 9) — a printable summary for a given
 * period (Daily/Weekly/Monthly), optionally scoped to one marketer.
 * Reuses the same /marketing-dashboard aggregation the live Dashboard
 * page uses, so a report and the dashboard never disagree with each
 * other; this page just adds the period-label framing, marketer filter,
 * and a clean print layout on top of the same numbers.
 */
export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [marketerId, setMarketerId] = useState<string>("");
  const [marketers, setMarketers] = useState<MarketerOption[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/prospects/assignable-users").then((r) => setMarketers(r.data)).catch(() => {});
  }, []);

  async function load() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { period };
      if (marketerId) params.marketerId = marketerId;
      const res = await api.get("/marketing-dashboard", { params });
      setData(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load report."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, marketerId]);

  const marketerName = marketerId ? marketers.find((m) => m.id === marketerId)?.fullName ?? "" : "";
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

  return (
    <div className="space-y-4 p-6 print:p-0">
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daily, weekly, or monthly summary — printable</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`text-sm rounded px-3 py-1.5 border ${period === p.value ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {p.label}
            </button>
          ))}
          <select value={marketerId} onChange={(e) => setMarketerId(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">Whole Team</option>
            {marketers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
          <button onClick={() => window.print()} className="text-sm bg-gray-800 text-white rounded px-3 py-1.5 hover:bg-gray-900">
            Print / Save PDF
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 no-print">{error}</div>}

      {isLoading ? (
        <div className="text-sm text-gray-400 p-6 no-print">Loading...</div>
      ) : data ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 print:border-0">
          <div className="mb-4 pb-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {periodLabel} Marketing Report{marketerName ? ` — ${marketerName}` : " — Whole Team"}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {fmtDate(data.period.from)} – {fmtDate(data.period.to)} &middot; Generated {fmtDateTime(new Date())}
            </p>
          </div>

          <table className="w-full text-sm mb-6">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 text-gray-500">New Prospects</td><td className="py-2 text-right font-medium">{data.metrics.newProspects}</td></tr>
              <tr><td className="py-2 text-gray-500">Qualified Prospects</td><td className="py-2 text-right font-medium">{data.metrics.qualifiedProspects}</td></tr>
              <tr><td className="py-2 text-gray-500">Meetings Logged</td><td className="py-2 text-right font-medium">{data.metrics.meetingsLogged}</td></tr>
              <tr><td className="py-2 text-gray-500">Proposals / Quotations Sent</td><td className="py-2 text-right font-medium">{data.metrics.proposalsQuotationsSent}</td></tr>
              <tr><td className="py-2 text-gray-500">Total Activities Logged</td><td className="py-2 text-right font-medium">{data.metrics.totalActivities}</td></tr>
              <tr><td className="py-2 text-gray-500">New Clients Acquired (period)</td><td className="py-2 text-right font-medium">{data.metrics.newClientsAcquired}</td></tr>
              <tr><td className="py-2 text-gray-500">Lost Opportunities (period)</td><td className="py-2 text-right font-medium">{data.metrics.lostOpportunities}</td></tr>
              <tr><td className="py-2 text-gray-500">Follow-ups Due (as of now)</td><td className="py-2 text-right font-medium">{data.metrics.followUpsDue}</td></tr>
              <tr><td className="py-2 text-gray-500">Opportunities In Progress (as of now)</td><td className="py-2 text-right font-medium">{data.metrics.opportunitiesInProgress}</td></tr>
              <tr><td className="py-2 text-gray-500">Estimated Pipeline Value (as of now)</td><td className="py-2 text-right font-medium">{fmtMoney(data.metrics.estimatedPipelineValue)}</td></tr>
              <tr><td className="py-2 text-gray-500">Leads Converted (all-time)</td><td className="py-2 text-right font-medium">{data.metrics.leadsConvertedAllTime}</td></tr>
            </tbody>
          </table>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">Funnel — entered this period</h3>
          <table className="w-full text-sm mb-6">
            <tbody className="divide-y divide-gray-100">
              {data.funnel.map((f) => (
                <tr key={f.stage}><td className="py-1.5 text-gray-500">{f.label}</td><td className="py-1.5 text-right font-medium">{f.count}</td></tr>
              ))}
            </tbody>
          </table>

          {Object.keys(data.activityByType).length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Activity Breakdown</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(data.activityByType).map(([type, count]) => (
                    <tr key={type}><td className="py-1.5 text-gray-500">{type.replace(/_/g, " ")}</td><td className="py-1.5 text-right font-medium">{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
