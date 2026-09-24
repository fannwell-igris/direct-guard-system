import { useEffect, useState } from "react";
import api from "../../api/client";

type Period = "today" | "week" | "month" | "custom";

interface FunnelStep { stage: string; label: string; count: number; }

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

const PERIODS: { label: string; value: Period }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Custom", value: "custom" },
];

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MarketingDashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (period === "custom" && (!customFrom || !customTo)) return;
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { period };
      if (period === "custom") { params.dateFrom = customFrom; params.dateTo = customTo; }
      const res = await api.get("/marketing-dashboard", { params });
      setData(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load dashboard."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const maxFunnelCount = data ? Math.max(1, ...data.funnel.map((f) => f.count)) : 1;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing Dashboard</h1>
          {data && <p className="text-sm text-gray-500 mt-0.5">{fmtDate(data.period.from)} – {fmtDate(data.period.to)}</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`text-sm rounded px-3 py-1.5 border ${period === p.value ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <button onClick={load} className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100">Apply</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {isLoading ? (
        <div className="text-sm text-gray-400 p-6">Loading...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="New Prospects" value={data.metrics.newProspects} />
            <Tile label="Qualified Prospects" value={data.metrics.qualifiedProspects} />
            <Tile label="Meetings Logged" value={data.metrics.meetingsLogged} />
            <Tile label="Proposals / Quotations Sent" value={data.metrics.proposalsQuotationsSent} />
            <Tile label="New Clients Acquired" value={data.metrics.newClientsAcquired} sub="this period" />
            <Tile label="Lost Opportunities" value={data.metrics.lostOpportunities} sub="this period" />
            <Tile label="Follow-ups Due" value={data.metrics.followUpsDue} sub="as of now" />
            <Tile label="Opportunities In Progress" value={data.metrics.opportunitiesInProgress} sub="as of now" />
            <Tile label="Estimated Pipeline Value" value={fmtMoney(data.metrics.estimatedPipelineValue)} sub="open opportunities, as of now" />
            <Tile label="Leads Converted (All-Time)" value={data.metrics.leadsConvertedAllTime} />
            <Tile label="Total Activities" value={data.metrics.totalActivities} sub="this period" />
          </div>

          {/* Funnel */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Funnel</h2>
            <p className="text-xs text-gray-400 mb-3">Distinct prospects that entered each stage during this period.</p>
            <div className="space-y-2">
              {data.funnel.map((step) => {
                const pct = Math.round((step.count / maxFunnelCount) * 100);
                const barColor = step.stage === "WON" ? "bg-green-500" : step.stage === "LOST" ? "bg-red-400" : "bg-magen-green";
                return (
                  <div key={step.stage} className="flex items-center gap-3">
                    <div className="w-28 shrink-0 text-xs text-gray-600">{step.label}</div>
                    <div className="flex-1 bg-gray-100 rounded h-5 relative overflow-hidden">
                      <div className={`h-full ${barColor} rounded`} style={{ width: `${Math.max(pct, step.count > 0 ? 4 : 0)}%` }} />
                    </div>
                    <div className="w-8 text-right text-xs font-medium text-gray-700">{step.count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity breakdown */}
          {Object.keys(data.activityByType).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(data.activityByType).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-xs bg-gray-50 rounded px-3 py-2">
                    <span className="text-gray-500">{type.replace(/_/g, " ")}</span>
                    <span className="font-medium text-gray-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
