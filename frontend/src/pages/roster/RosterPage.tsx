import { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { Pencil, X, Calendar, UserX, UserPlus, CheckSquare, Square } from "lucide-react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface Lookup {
  id: string;
  name?: string;
  fullName?: string;
  siteName?: string;
  position?: string | null;
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

// ─── Schedule form state ─────────────────────────────────────────────────────

interface FormState {
  employeeId: string;
  siteId: string;
  shiftTypeId: string;
  /** Start date (and only date, when repeatDays = 1). */
  date: string;
  /** Number of consecutive days to schedule; 1 = single-day (default). */
  repeatDays: number;
  notes: string;
}

const EMPTY_FORM: FormState = {
  employeeId: "",
  siteId: "",
  shiftTypeId: "",
  date: "",
  repeatDays: 1,
  notes: "",
};

// ─── Relief modal state ──────────────────────────────────────────────────────

interface ReliefState {
  /** The roster entry we're sending a reliever for. */
  entry: RosterEntry;
  reliefEmployeeId: string;
  notes: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RosterPage() {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [employees, setEmployees] = useState<Lookup[]>([]);
  const [sites, setSites] = useState<Lookup[]>([]);
  const [shiftTypes, setShiftTypes] = useState<Lookup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");

  // Schedule / edit form
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Bulk-select (for "cancel from day N forward")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkCancelling, setIsBulkCancelling] = useState(false);

  // Relief modal
  const [reliefState, setReliefState] = useState<ReliefState | null>(null);
  const [reliefError, setReliefError] = useState<string | null>(null);
  const [isSendingRelief, setIsSendingRelief] = useState(false);

  // ─── Data loading ───────────────────────────────────────────────────────────

  async function loadLookups() {
    try {
      const [empRes, siteRes, shiftRes] = await Promise.all([
        api.get("/employees", { params: { pageSize: 100, employmentStatus: "ACTIVE" } }),
        api.get("/sites", { params: { pageSize: 100 } }),
        api.get("/shift-types"),
      ]);
      setEmployees(empRes.data.data);
      setSites(siteRes.data.data);
      setShiftTypes(shiftRes.data.data);
    } catch {
      // Non-fatal — dropdowns just show no options if this fails.
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
      setSelectedIds(new Set()); // clear selection whenever we reload
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

  // ─── Derived lists ──────────────────────────────────────────────────────────

  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const guardEmployees = useMemo(
    () => employees.filter((e) => e.position && /guard/i.test(e.position)),
    [employees]
  );

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

  /** SCHEDULED entries among visible ones — these can be bulk-cancelled. */
  const scheduledVisibleIds = useMemo(
    () => visibleEntries.filter((e) => e.status === "SCHEDULED").map((e) => e.id),
    [visibleEntries]
  );

  // Derived end date for the multi-day form preview.
  const computedEndDate = useMemo(() => {
    if (!form.date || form.repeatDays <= 1) return null;
    const d = new Date(form.date);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + form.repeatDays - 1);
    return d.toISOString().slice(0, 10);
  }, [form.date, form.repeatDays]);

  // ─── Schedule / edit form ───────────────────────────────────────────────────

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
      repeatDays: 1,
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

    try {
      if (editingId === "new") {
        if (form.repeatDays > 1 && computedEndDate) {
          // Multi-day scheduling — use the bulk endpoint.
          const res = await api.post("/roster/bulk", {
            employeeId: form.employeeId,
            siteId: form.siteId,
            shiftTypeId: form.shiftTypeId,
            startDate: form.date,
            endDate: computedEndDate,
            notes: form.notes.trim() || null,
          });
          const { created, skipped } = res.data.data as {
            created: object[];
            skipped: { date: string; reason: string }[];
          };
          if (skipped.length > 0) {
            // Inform the user of any days that couldn't be created, but still
            // close the form and reload so the successful days appear.
            setFormError(
              `Scheduled ${created.length} day(s). Skipped ${skipped.length} already-booked day(s): ${skipped.map((s) => s.date).join(", ")}.`
            );
            await loadEntries();
            // Keep the modal open briefly so the user can read the message.
            setIsSaving(false);
            return;
          }
        } else {
          // Single-day scheduling — use the normal endpoint.
          await api.post("/roster", {
            employeeId: form.employeeId,
            siteId: form.siteId,
            shiftTypeId: form.shiftTypeId,
            date: form.date,
            notes: form.notes.trim() || null,
          });
        }
      } else if (editingId) {
        await api.put(`/roster/${editingId}`, {
          employeeId: form.employeeId,
          siteId: form.siteId,
          shiftTypeId: form.shiftTypeId,
          date: form.date,
          notes: form.notes.trim() || null,
        });
      }
      closeForm();
      await loadEntries();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save roster entry.");
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Single-entry cancel ────────────────────────────────────────────────────

  async function handleCancel(entry: RosterEntry) {
    try {
      await api.put(`/roster/${entry.id}`, { status: "CANCELLED" });
      await loadEntries();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to cancel entry.");
    }
  }

  // ─── Bulk select + cancel ───────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === scheduledVisibleIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scheduledVisibleIds));
    }
  }

  async function handleBulkCancel() {
    if (selectedIds.size === 0) return;
    setIsBulkCancelling(true);
    try {
      await api.post("/roster/bulk-cancel", { ids: Array.from(selectedIds) });
      await loadEntries();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to cancel selected entries.");
    } finally {
      setIsBulkCancelling(false);
    }
  }

  // ─── Relief modal ───────────────────────────────────────────────────────────

  function openReliefModal(entry: RosterEntry) {
    setReliefState({ entry, reliefEmployeeId: "", notes: "" });
    setReliefError(null);
  }

  function closeReliefModal() {
    setReliefState(null);
    setReliefError(null);
  }

  async function handleSendRelief(e: FormEvent) {
    e.preventDefault();
    if (!reliefState) return;
    setReliefError(null);
    setIsSendingRelief(true);
    try {
      await api.post(`/roster/${reliefState.entry.id}/relief`, {
        reliefEmployeeId: reliefState.reliefEmployeeId,
        notes: reliefState.notes.trim() || null,
      });
      closeReliefModal();
      await loadEntries();
    } catch (err: any) {
      setReliefError(err.response?.data?.message ?? "Failed to record relief.");
    } finally {
      setIsSendingRelief(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const allScheduledSelected =
    scheduledVisibleIds.length > 0 && selectedIds.size === scheduledVisibleIds.length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Roster</h1>
          <p className="text-sm text-gray-500 mt-1">{visibleEntries.length} entries</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkCancel}
              disabled={isBulkCancelling}
              className="text-sm border border-red-300 text-red-600 rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-60"
            >
              {isBulkCancelling
                ? "Cancelling..."
                : `Cancel selected (${selectedIds.size})`}
            </button>
          )}
          <button
            onClick={openCreateForm}
            className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"
          >
            + Schedule Shift
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
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
        {scheduledVisibleIds.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-100 flex items-center gap-1"
          >
            {allScheduledSelected ? (
              <CheckSquare size={14} />
            ) : (
              <Square size={14} />
            )}
            {allScheduledSelected ? "Deselect all" : "Select all scheduled"}
          </button>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Schedule / edit modal ── */}
      {editingId && (
        <Modal
          title={editingId === "new" ? "Schedule Shift" : "Edit Roster Entry"}
          onClose={closeForm}
          widthClass="max-w-lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            {/* Employee */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Employee *</label>
              <select
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="" disabled>Select...</option>
                {guardEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">Only Guards can be scheduled to a site.</p>
            </div>

            {/* Site + Shift Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Site *</label>
                <select
                  required
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="" disabled>Select...</option>
                  {visibleSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName}</option>
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
                  <option value="" disabled>Select...</option>
                  {shiftTypes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date + Repeat (only on create) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  {editingId === "new" && form.repeatDays > 1 ? "Start Date *" : "Date *"}
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {editingId === "new" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Number of Days *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={form.repeatDays}
                    onChange={(e) =>
                      setForm({ ...form, repeatDays: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Date-range preview */}
            {editingId === "new" && form.repeatDays > 1 && form.date && computedEndDate && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                This will schedule <strong>{form.repeatDays} shifts</strong>:{" "}
                <strong>{form.date}</strong> to <strong>{computedEndDate}</strong>.
                Days that are already booked will be skipped automatically.
              </div>
            )}

            {/* Notes */}
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
                {isSaving
                  ? "Saving..."
                  : editingId === "new" && form.repeatDays > 1
                  ? `Schedule ${form.repeatDays} Days`
                  : "Save"}
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
        </Modal>
      )}

      {/* ── Relief modal ── */}
      {reliefState && (
        <Modal
          title="Send Relief Officer"
          onClose={closeReliefModal}
          widthClass="max-w-md"
        >
          <div className="mb-4 text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p>
              <strong>{reliefState.entry.employee?.fullName ?? "Scheduled officer"}</strong> did
              not show up for the <strong>{reliefState.entry.date.slice(0, 10)}</strong> shift at{" "}
              <strong>{reliefState.entry.site?.siteName ?? "this site"}</strong>.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Recording a relief will cancel their entry and log the relief officer's attendance.
            </p>
          </div>

          <form onSubmit={handleSendRelief} className="space-y-4">
            {reliefError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {reliefError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Relief Officer *</label>
              <select
                required
                value={reliefState.reliefEmployeeId}
                onChange={(e) =>
                  setReliefState({ ...reliefState, reliefEmployeeId: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="" disabled>Select a guard...</option>
                {guardEmployees
                  .filter((e) => e.id !== reliefState.entry.employeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>{e.fullName}</option>
                  ))}
              </select>
              <p className="text-xs text-gray-500">
                Only Guards are shown. The original officer is excluded.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={reliefState.notes}
                onChange={(e) => setReliefState({ ...reliefState, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                placeholder="e.g. Officer was unreachable, relief sent at 08:30"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSendingRelief}
                className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60"
              >
                {isSendingRelief ? "Saving..." : "Confirm Relief"}
              </button>
              <button
                type="button"
                onClick={closeReliefModal}
                className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Entry list ── */}
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : visibleEntries.length === 0 ? (
        <div className="text-sm text-gray-500">No roster entries found.</div>
      ) : (
        <div className="space-y-2">
          {visibleEntries.map((entry) => {
            const isSelected = selectedIds.has(entry.id);
            const isScheduled = entry.status === "SCHEDULED";

            return (
              <div
                key={entry.id}
                className={
                  "bg-white border rounded-2xl px-4 py-3 flex items-center gap-4 " +
                  (isSelected ? "border-magen-green" : "border-gray-200")
                }
              >
                {/* Checkbox (only for SCHEDULED entries) */}
                <button
                  type="button"
                  onClick={() => isScheduled && toggleSelect(entry.id)}
                  className={
                    "flex-shrink-0 " +
                    (isScheduled ? "cursor-pointer text-magen-green" : "cursor-default text-gray-200")
                  }
                  title={isScheduled ? (isSelected ? "Deselect" : "Select for bulk cancel") : ""}
                >
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>

                {/* Icon */}
                <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {entry.employee?.fullName ?? "—"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {entry.date.slice(0, 10)} · {entry.site?.siteName ?? "—"} ·{" "}
                    {entry.shiftType?.name ?? "—"}
                  </p>
                </div>

                {/* Status badge */}
                <span
                  className={
                    "text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 " +
                    (isScheduled
                      ? "bg-magen-green-light text-magen-green-dark"
                      : "bg-gray-100 text-gray-500")
                  }
                >
                  {entry.status}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditForm(entry)}
                    title="Edit"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy"
                  >
                    <Pencil size={15} />
                  </button>

                  {isScheduled && (
                    <>
                      {/* Send Relief: officer didn't show, send a replacement */}
                      <button
                        onClick={() => openReliefModal(entry)}
                        title="Send Relief Officer"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                      >
                        <UserPlus size={15} />
                      </button>

                      {/* Cancel this single entry */}
                      <button
                        onClick={() => handleCancel(entry)}
                        title="Cancel Shift"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}

                  {/* CANCELLED entries get a "mark absent" icon to make it
                      clear the original officer is recorded as absent —
                      this is visual only; the cancel action already creates
                      the absence record server-side via the relief flow. */}
                  {!isScheduled && (
                    <span
                      title="Officer marked absent / relief sent"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300"
                    >
                      <UserX size={15} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
