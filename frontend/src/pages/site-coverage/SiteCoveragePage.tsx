import { useEffect, useState } from "react";
import { Check, X, RotateCcw, AlertTriangle } from "lucide-react";
import api from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

interface ShiftCoverage {
  shiftTypeId: string;
  shiftTypeName: string;
  isCovered: boolean | null;
  notes: string | null;
  attendanceSignal: { totalCount: number; coveredCount: number } | null;
}

interface CoverageRow {
  siteId: string;
  siteName: string;
  date: string;
  shifts: ShiftCoverage[];
}

// A mismatch only means something once real attendance has actually been
// logged for that site/date/shift (attendanceSignal !== null) — before
// that, the manual tick has nothing to disagree with yet. Each shift now
// has its own independent tick (added 2026-09-21, replacing the earlier
// single tick per site/day), so this checks one shift at a time — a full
// Day shift can no longer mask a no-show Night shift, because they're
// simply two separate rows now.
function mismatchReason(shift: ShiftCoverage): string | null {
  if (shift.isCovered === null || !shift.attendanceSignal) return null;
  if (shift.isCovered === true && shift.attendanceSignal.totalCount > 0 && shift.attendanceSignal.coveredCount === 0) {
    return `Marked Covered, but 0 of ${shift.attendanceSignal.totalCount} guard(s) present.`;
  }
  if (shift.isCovered === false && shift.attendanceSignal.coveredCount > 0) {
    return `Marked Not Covered, but ${shift.attendanceSignal.coveredCount} guard(s) present.`;
  }
  return null;
}

// Edit access here is UI-level only (hides the buttons) -- the real
// enforcement is server-side in site-coverage.controller.ts.
function useCanEdit() {
  const { user } = useAuth();
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "OPERATIONS";
}

export default function SiteCoveragePage() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Keyed by `${siteId}:${shiftTypeId}` so saving one shift's tick doesn't
  // disable the buttons on the site's other shift.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get("/site-coverage", { params: { date: today } });
      setRows(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load site coverage.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isCovered accepts null too -- the "unmark" action (reset to "not yet
  // marked"). shiftTypeId is now required on every tick so Day and Night
  // are recorded as two independent facts instead of overwriting each
  // other.
  async function setCovered(siteId: string, shiftTypeId: string, isCovered: boolean | null) {
    const key = `${siteId}:${shiftTypeId}`;
    setSavingKey(key);
    setError(null);
    try {
      await api.put("/site-coverage", { siteId, shiftTypeId, date: today, isCovered });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update.");
    } finally {
      setSavingKey(null);
    }
  }

  const allShifts = rows.flatMap((r) => r.shifts);
  const coveredCount = allShifts.filter((s) => s.isCovered === true).length;
  const notCoveredCount = allShifts.filter((s) => s.isCovered === false).length;
  const unmarkedCount = allShifts.filter((s) => s.isCovered === null).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Site Coverage</h1>
        <p className="text-sm text-gray-500 mt-1">
          {today} — {coveredCount} covered, {notCoveredCount} not covered, {unmarkedCount} not yet marked
          {!canEdit && " (view only)"}
        </p>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">No active sites found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.siteId} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="font-medium text-gray-900 mb-3">{row.siteName}</p>

              <div className="space-y-3">
                {row.shifts.length === 0 && (
                  <p className="text-xs text-gray-400">No active shift types configured.</p>
                )}
                {row.shifts.map((shift, i) => {
                  const key = `${row.siteId}:${shift.shiftTypeId}`;
                  const isSaving = savingKey === key;
                  const styles =
                    shift.isCovered === true
                      ? { bg: "bg-magen-green-light", iconBg: "bg-magen-green", label: "Covered" }
                      : shift.isCovered === false
                      ? { bg: "bg-red-50", iconBg: "bg-red-500", label: "Not covered" }
                      : { bg: "bg-gray-50", iconBg: "bg-gray-300", label: "Not yet marked" };
                  const reason = mismatchReason(shift);

                  return (
                    <div
                      key={shift.shiftTypeId}
                      className={i > 0 ? "pt-3 border-t border-gray-100" : ""}
                    >
                      <div className={`${styles.bg} rounded-xl p-3`}>
                        <div className="flex items-center gap-2.5 mb-1">
                          <div className={`${styles.iconBg} text-white rounded-full p-1.5 flex-shrink-0`}>
                            {shift.isCovered === true ? <Check size={12} /> : shift.isCovered === false ? <X size={12} /> : <span className="w-3 h-3 block" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 leading-tight">{shift.shiftTypeName} shift</p>
                            <p className="text-xs text-gray-500">{styles.label}</p>
                          </div>
                        </div>

                        {reason && (
                          <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </div>
                        )}

                        {canEdit && (
                          <div className="flex gap-1.5 mt-2.5">
                            <button
                              disabled={isSaving || shift.isCovered === true}
                              onClick={() => setCovered(row.siteId, shift.shiftTypeId, true)}
                              className="flex-1 bg-magen-green text-white text-xs font-medium rounded-lg px-2 py-1.5 hover:opacity-90 disabled:opacity-40"
                            >
                              Covered
                            </button>
                            <button
                              disabled={isSaving || shift.isCovered === false}
                              onClick={() => setCovered(row.siteId, shift.shiftTypeId, false)}
                              className="flex-1 bg-red-500 text-white text-xs font-medium rounded-lg px-2 py-1.5 hover:opacity-90 disabled:opacity-40"
                            >
                              Not Covered
                            </button>
                            {shift.isCovered !== null && (
                              <button
                                disabled={isSaving}
                                onClick={() => setCovered(row.siteId, shift.shiftTypeId, null)}
                                title="Unmark (reset to not yet marked)"
                                className="bg-white border border-gray-300 text-gray-500 rounded-lg px-2 py-1.5 hover:bg-gray-100 disabled:opacity-40"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
