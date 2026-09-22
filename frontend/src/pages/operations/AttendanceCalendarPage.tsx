import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "../../api/client";

type CellStatus =
  | "PRESENT"
  | "ABSENT"
  | "LEAVE"
  | "APPROVED_ABSENCE"
  | "REPLACEMENT"
  | "EXTRA_SHIFT"
  | "OTHER"
  | "SCHEDULED";

interface EmployeeRow {
  employeeId: string;
  employeeName: string;
  cells: Record<string, CellStatus>;
  summary: {
    present: number;
    absent: number;
    leave: number;
    approvedAbsence: number;
    replacement: number;
    extraShift: number;
    other: number;
    scheduledNoData: number;
  };
}

interface CalendarResponse {
  dateFrom: string;
  dateTo: string;
  days: string[];
  employees: EmployeeRow[];
}

interface SiteLite {
  id: string;
  siteName: string;
}
interface ClientLite {
  id: string;
  name: string;
}
interface ShiftTypeLite {
  id: string;
  name: string;
  isActive: boolean;
}

// Box styling per status. "no data" (key absent from cells) falls back to
// the plain empty-box style below, not listed here.
const STATUS_STYLE: Record<CellStatus, string> = {
  PRESENT: "bg-green-500",
  ABSENT: "bg-red-500",
  LEAVE: "bg-purple-400",
  APPROVED_ABSENCE: "bg-amber-400",
  REPLACEMENT: "bg-teal-500",
  EXTRA_SHIFT: "bg-blue-500",
  OTHER: "bg-gray-400",
  SCHEDULED: "bg-gray-100 border border-dashed border-gray-300",
};

const STATUS_LABEL: Record<CellStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LEAVE: "Leave",
  APPROVED_ABSENCE: "Approved absence",
  REPLACEMENT: "Replacement",
  EXTRA_SHIFT: "Extra shift",
  OTHER: "Other",
  SCHEDULED: "Scheduled — not logged yet",
};

const LEGEND_ORDER: CellStatus[] = [
  "PRESENT",
  "ABSENT",
  "LEAVE",
  "APPROVED_ABSENCE",
  "REPLACEMENT",
  "EXTRA_SHIFT",
  "OTHER",
  "SCHEDULED",
];

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function AttendanceCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const [sites, setSites] = useState<SiteLite[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeLite[]>([]);
  const [siteId, setSiteId] = useState("");
  const [clientId, setClientId] = useState("");
  const [shiftTypeId, setShiftTypeId] = useState("");
  const [search, setSearch] = useState("");

  const [data, setData] = useState<CalendarResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateFrom = useMemo(() => isoDate(year, month, 1), [year, month]);
  const dateTo = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return isoDate(year, month, lastDay);
  }, [year, month]);

  async function loadLookups() {
    try {
      const [sitesRes, clientsRes, shiftTypesRes] = await Promise.all([
        api.get("/sites", { params: { pageSize: 100 } }),
        api.get("/clients", { params: { pageSize: 100 } }),
        api.get("/shift-types"),
      ]);
      setSites(sitesRes.data.data);
      setClients(clientsRes.data.data);
      setShiftTypes(shiftTypesRes.data.data.filter((st: ShiftTypeLite) => st.isActive));
    } catch {
      // Non-fatal — filters just show empty dropdowns.
    }
  }

  async function loadCalendar() {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { dateFrom, dateTo };
      if (siteId) params.siteId = siteId;
      if (clientId) params.clientId = clientId;
      if (shiftTypeId) params.shiftTypeId = shiftTypeId;
      const res = await api.get("/operations/attendance-calendar", { params });
      setData(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load attendance calendar.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, siteId, clientId, shiftTypeId]);

  function goToPrevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function goToNextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToThisMonth() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.employees;
    return data.employees.filter((e) => e.employeeName.toLowerCase().includes(q));
  }, [data, search]);

  const dayNumbers = data ? data.days.map((d) => Number(d.slice(-2))) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            One box per guard, per day — worked, missed, or not logged yet.
            {shiftTypeId
              ? " Showing one shift only."
              : " Day + Night combined: if the two shifts disagree, the worse outcome wins — filter to one shift below to see it on its own."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goToThisMonth}
            className="text-sm font-medium text-gray-800 px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100 min-w-[10rem] text-center"
          >
            {monthLabel(year, month)}
          </button>
          <button
            onClick={goToNextMonth}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="select w-48"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="select w-48"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.siteName}</option>
          ))}
        </select>
        <select
          value={shiftTypeId}
          onChange={(e) => setShiftTypeId(e.target.value)}
          className="select w-44"
        >
          <option value="">Day + Night (combined)</option>
          {shiftTypes.map((st) => (
            <option key={st.id} value={st.id}>{st.name} shift only</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guard name..."
          className="input w-56"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-600">
        {LEGEND_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded-sm inline-block ${STATUS_STYLE[s]}`} />
            {STATUS_LABEL[s]}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-sm inline-block bg-white border border-gray-200" />
          No data
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : !data || filteredEmployees.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">
          No guards to show for this month{siteId || clientId ? " with the selected filters" : ""}.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white text-left px-3 py-2 font-medium text-gray-700 border-b border-gray-200 min-w-[10rem]">
                  Guard
                </th>
                {dayNumbers.map((d) => (
                  <th key={d} className="px-1 py-2 font-medium text-gray-500 border-b border-gray-200 text-center w-7">
                    {d}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium text-gray-700 border-b border-gray-200 text-center whitespace-nowrap">
                  Worked
                </th>
                <th className="px-2 py-2 font-medium text-gray-700 border-b border-gray-200 text-center whitespace-nowrap">
                  Missed
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const worked = emp.summary.present + emp.summary.replacement + emp.summary.extraShift;
                const missed = emp.summary.absent;
                return (
                  <tr key={emp.employeeId} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-800 border-b border-gray-100 whitespace-nowrap">
                      {emp.employeeName}
                    </td>
                    {data.days.map((day) => {
                      const status = emp.cells[day];
                      return (
                        <td key={day} className="px-1 py-1.5 border-b border-gray-100 text-center">
                          <span
                            title={status ? STATUS_LABEL[status] : "No data"}
                            className={
                              "w-5 h-5 rounded-sm inline-block " +
                              (status ? STATUS_STYLE[status] : "bg-gray-50 border border-gray-200")
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 border-b border-gray-100 text-center font-medium text-green-700">
                      {worked}
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-100 text-center font-medium text-red-700">
                      {missed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
