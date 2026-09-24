import { useEffect, useState } from "react";
import api from "../../api/client";

type Period = "today" | "week" | "month";

interface Marketer { id: string; fullName: string; }

interface MarketerMetrics {
  marketer: Marketer;
  period: { type: Period; from: string; to: string };
  metrics: {
    newProspects: number;
    qualifiedProspects: number;
    meetingsLogged: number;
    proposalsQuotationsSent: number;
    newClientsAcquired: number;
    opportunitiesInProgress: number;
    estimatedPipelineValue: string | number;
    totalActivities: number;
  };
}

interface TeamBreakdown {
  period: { type: Period; from: string; to: string };
  marketers: MarketerMetrics[];
}

interface Prospect {
  id: string;
  companyName: string;
  stage: string;
  opportunityValue: string | number | null;
  nextFollowUpDate: string | null;
}

interface Activity {
  id: string;
  type: string;
  activityDate: string;
  purpose: string | null;
  outcome: string | null;
  prospect?: { companyName: string } | null;
  client?: { name: string } | null;
}

const PERIODS: { label: string; value: Period }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB") : "—";
}

/**
 * Management view (brief section 10): Marketing -> Team -> Individual ->
 * Prospect/Activity drill-down. Team level shows every marketer side by
 * side for the selected period; clicking one drills into their own
 * numbers plus their live prospect list and recent activity, without
 * leaving this page.
 */
export default function ManagementPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [team, setTeam] = useState<TeamBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Marketer | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadTeam() {
    setIsLoading(true); setError(null);
    try {
      const res = await api.get("/marketing-dashboard/team", { params: { period } });
      setTeam(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load team breakdown."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function openMarketer(m: Marketer) {
    setSelected(m);
    setDetailLoading(true);
    try {
      const [prospectsRes, activitiesRes] = await Promise.all([
        api.get("/prospects", { params: { assignedToId: m.id, pageSize: 50 } }),
        api.get("/marketing-activities", { params: { performedById: m.id, pageSize: 20 } }),
      ]);
      setProspects(prospectsRes.data.data);
      setActivities(activitiesRes.data.data);
    } catch {
      setProspects([]); setActivities([]);
    } finally { setDetailLoading(false); }
  }

  const selectedMetrics = selected ? team?.marketers.find((row) => row.marketer.id === selected.id) : null;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing — Management View</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selected ? `Individual: ${selected.fullName}` : `Team — ${team ? `${fmtDate(team.period.from)} – ${fmtDate(team.period.to)}` : ""}`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {selected && (
            <button onClick={() => setSelected(null)} className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100">
              ← Back to Team
            </button>
          )}
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`text-sm rounded px-3 py-1.5 border ${period === p.value ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {!selected ? (
        // ---- Team level ----
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-400">Loading...</div>
          ) : !team || team.marketers.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">No active Marketing users yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Marketer</th>
                  <th className="text-right px-4 py-3">New Prospects</th>
                  <th className="text-right px-4 py-3">Activities</th>
                  <th className="text-right px-4 py-3">Meetings</th>
                  <th className="text-right px-4 py-3">Clients Won</th>
                  <th className="text-right px-4 py-3">Pipeline Value</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {team.marketers.map((row) => (
                  <tr key={row.marketer.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openMarketer(row.marketer)}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.marketer.fullName}</td>
                    <td className="px-4 py-3 text-right">{row.metrics.newProspects}</td>
                    <td className="px-4 py-3 text-right">{row.metrics.totalActivities}</td>
                    <td className="px-4 py-3 text-right">{row.metrics.meetingsLogged}</td>
                    <td className="px-4 py-3 text-right">{row.metrics.newClientsAcquired}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(row.metrics.estimatedPipelineValue)}</td>
                    <td className="px-4 py-3 text-right text-green-600 text-xs">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        // ---- Individual level ----
        <div className="space-y-4">
          {selectedMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">New Prospects</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{selectedMetrics.metrics.newProspects}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">Activities</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{selectedMetrics.metrics.totalActivities}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">Clients Won</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{selectedMetrics.metrics.newClientsAcquired}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">Pipeline Value</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{fmtMoney(selectedMetrics.metrics.estimatedPipelineValue)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <h2 className="text-sm font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">Prospects</h2>
              {detailLoading ? (
                <div className="p-4 text-sm text-gray-400">Loading...</div>
              ) : prospects.length === 0 ? (
                <div className="p-4 text-sm text-gray-400">No prospects assigned.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {prospects.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2 text-gray-800">{p.companyName}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{p.stage.replace(/_/g, " ")}</td>
                        <td className="px-4 py-2 text-xs text-gray-400 text-right">Follow-up: {fmtDate(p.nextFollowUpDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <h2 className="text-sm font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">Recent Activities</h2>
              {detailLoading ? (
                <div className="p-4 text-sm text-gray-400">Loading...</div>
              ) : activities.length === 0 ? (
                <div className="p-4 text-sm text-gray-400">No activities logged.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {activities.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{fmtDate(a.activityDate)}</td>
                        <td className="px-4 py-2 text-gray-800">{a.type.replace(/_/g, " ")}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{a.prospect?.companyName ?? a.client?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
