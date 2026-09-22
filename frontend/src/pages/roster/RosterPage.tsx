import { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { Pencil, X, Calendar } from "lucide-react";
import api from "../../api/client";

interface Lookup {
  id: string;
  name?: string;
  fullName?: string;
  siteName?: string;
  // Only present on sites — the parent client's status, so we can hide
  // sites belonging to an archived client (a site's own status isn't
  // automatically changed when its client is archived).
  client?: { id: string; name: string; status: string };
}

interface RosterEntry {
  id: string;
  employeeId: string;
  siteId: string;
  shiftTypeId: string;
  date: string;
  status: "SCHEDULED" | "CANCELLED";
  notes: string | null;
  employee?: { id: string; fullName: string };
  site?: { id: string; siteName: string };
  shiftType?: { id: string; name: string };
}

interface FormState {
  employeeId: string;
  siteId: string;
  shiftTypeId: string;
  date: string;
  notes: string;
}

const EMPTY_FORM: FormState = { employeeId: "", siteId: "", shiftTypeId: "", date: "", notes: "" };

export default function RosterPage() {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [employees, setEmployees] = useState<Lookup[]>([]);
  const [sites, setSites] = useState<Lookup[]>([]);
  const [shiftTypes, setShiftTypes] = useState<Lookup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadLookups() {
    try {
      const [empRes, siteRes, shiftRes] = await Promise.all([
        // Terminated employees shouldn't be schedulable — only active ones
        // show up in either dropdown below.
        api.get("/employees", { params: { pageSize: 100, employmentStatus: "ACTIVE" } }),
        api.get("/sites", { params: { pageSize: 100 } }),
        api.get("/shift-types"),
      ]);
      setEmployees(empRes.data.data);
      setSites(siteRes.data.data);
      setShiftTypes(shiftRes.data.data);
    } catch {
      // Non-fatal -- dropdowns just show no options if this fails.
    }
  }

  async function loadEntries() {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (employeeFilter) params.employeeId = employeeFilter;
      const res = await api.get("/roster", { params });
      setEntries(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load roster.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLookups();
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `employees` only holds ACTIVE employees (see loadLookups), so any
  // roster entry whose employeeId isn't in this set belongs to someone
  // who's since been terminated — hide those from the list below.
  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  // A site's own status isn't changed when its client is archived, so we
  // filter sites here using the client status the backend now includes —
  // hides archived-client sites from both the site filter and the
  // Schedule Shift form's Site dropdown.
  const visibleSites = useMemo(
    () => sites.filter((s) => !s.client || s.client.status === "ACTIVE"),
    [sites]
  );
  const visibleSiteIds = useMemo(() => new Set(visibleSites.map((s) => s.id)), [visibleSites]);

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (e) => activeEmployeeIds.has(e.employeeId) && visibleSiteIds.has(e.siteId)
      ),
    [entries, activeEmployeeIds, visibleSiteIds]
  );

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEditForm(entry: RosterEntry) {
    setForm({
      employeeId: entry.employeeId,
      siteId: entry.siteId,
      shiftTypeId: entry.shiftTypeId,
      date: entry.date.slice(0, 10),
      notes: entry.notes ?? "",
    });
    setFormError(null);
    setEditingId(entry.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    const payload = {
      employeeId: form.employeeId,
      siteId: form.siteId,
      shiftTypeId: form.shiftTypeId,
      date: form.date,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/roster", payload);
      } else if (editingId) {
        await api.put(`/roster/${editingId}`, payload);
      }
      closeForm();
      await loadEntries();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save roster entry.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancel(entry: RosterEntry) {
    try {
      await api.put(`/roster/${entry.id}`, { status: "CANCELLED" });
      await loadEntries();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to cancel entry.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Roster</h1>
          <p className="text-sm text-gray-500 mt-1">{visibleEntries.length} entries</p>
        </div>
        <button
          onClick={openCreateForm}
          className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"
        >
          + Schedule Shift
        </button>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-gray-600">From</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <label className="text-sm text-gray-600">To</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>
        <button
          onClick={loadEntries}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-100"
        >
          Filter
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {editingId && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 max-w-lg"
        >
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId === "new" ? "Schedule Shift" : "Edit Roster Entry"}
          </h2>

          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Employee *</label>
            <select
              required
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select...
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Site *</label>
              <select
                required
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select...
                </option>
                {visibleSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Shift Type *</label>
              <select
                required
                value={form.shiftTypeId}
                onChange={(e) => setForm({ ...form, shiftTypeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select...
                </option>
                {shiftTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Date *</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : visibleEntries.length === 0 ? (
        <div className="text-sm text-gray-500">No roster entries found.</div>
      ) : (
        <div className="space-y-2">
          {visibleEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                <Calendar size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{entry.employee?.fullName ?? "—"}</p>
                <p className="text-xs text-gray-500 truncate">
                  {entry.date.slice(0, 10)} · {entry.site?.siteName ?? "—"} ·{" "}
                  {entry.shiftType?.name ?? "—"}
                </p>
              </div>

              <span
                className={
                  "text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 " +
                  (entry.status === "SCHEDULED"
                    ? "bg-magen-green-light text-magen-green-dark"
                    : "bg-gray-100 text-gray-500")
                }
              >
                {entry.status}
              </span>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEditForm(entry)}
                  title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy"
                >
                  <Pencil size={15} />
                </button>
                {entry.status === "SCHEDULED" && (
                  <button
                    onClick={() => handleCancel(entry)}
                    title="Cancel"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
