import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";
import {
  CalendarRange,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Wallet,
  AlertTriangle,
} from "lucide-react";

type ItemStatus = "PLANNED" | "DONE" | "CANCELLED";

interface Department {
  id: string;
  name: string;
}

interface PlanItem {
  id?: string;
  activity: string;
  plannedDate: string;
  responsible?: string | null;
  estimatedCost: number | string;
  status: ItemStatus;
  notes?: string | null;
}

interface PlanTotals {
  itemCount: number;
  doneCount: number;
  cancelledCount: number;
  plannedCost: number;
}

interface PlanListRow {
  id: string;
  departmentId: string;
  department?: { id: string; name: string } | null;
  weekStartDate: string;
  preparedBy: string | null;
  notes: string | null;
  items: PlanItem[];
  totals: PlanTotals;
}

/**
 * The budget half of the detail payload. `hasBudget` is the discriminant —
 * when the department has no budget for the month the week sits in, the
 * money figures simply aren't there, and the banner says so rather than
 * showing a misleading zero.
 */
type BudgetContext =
  | {
      hasBudget: false;
      month: number;
      year: number;
      thisWeekPlannedCost: number;
      otherWeeksPlannedCost: number;
      monthPlannedCost: number;
    }
  | {
      hasBudget: true;
      month: number;
      year: number;
      budgetId: string;
      budgetStatus: string;
      budgetTotal: number;
      budgetActual: number;
      budgetRemaining: number;
      thisWeekPlannedCost: number;
      otherWeeksPlannedCost: number;
      monthPlannedCost: number;
      projectedRemaining: number;
    };

interface PlanDetail extends PlanListRow {
  weekEndDate: string;
  budget: BudgetContext;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const STATUS_BADGE: Record<ItemStatus, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  DONE: "bg-green-50 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

/**
 * Monday of the week containing `date`, as a yyyy-mm-dd string.
 * Mirrors startOfWeek() on the backend — kept in UTC for the same reason:
 * so the week the user sees is the week the server stores.
 */
function startOfWeekISO(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "15 – 21 Sep 2026", collapsing the month/year when both ends share it. */
function formatWeekRange(weekStartISO: string): string {
  const start = new Date(`${weekStartISO}T00:00:00Z`);
  const end = new Date(`${addDaysISO(weekStartISO, 6)}T00:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startPart = sameMonth
    ? `${start.getUTCDate()}`
    : `${start.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()].slice(0, 3)}`;
  return `${startPart} – ${end.getUTCDate()} ${MONTH_NAMES[end.getUTCMonth()].slice(0, 3)} ${end.getUTCFullYear()}`;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DAY_NAMES[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

function money(n: number): string {
  return `K${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function blankItem(weekStartISO: string): PlanItem {
  return {
    activity: "",
    plannedDate: weekStartISO,
    responsible: "",
    estimatedCost: "",
    status: "PLANNED",
    notes: "",
  };
}

export default function WeeklyPlansPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(new Date()));

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Edit modal state — the whole item list is edited at once and PUT back,
  // matching how the backend replaces items wholesale.
  const [editing, setEditing] = useState(false);
  const [formItems, setFormItems] = useState<PlanItem[]>([]);
  const [formPreparedBy, setFormPreparedBy] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api
      .get("/departments", { params: { pageSize: 100 } })
      .then((r) => {
        const rows: Department[] = r.data.data ?? [];
        setDepartments(rows);
        // Land on Operations when it exists — it's the department that
        // actually runs a weekly rhythm, and the reason this page exists.
        if (!departmentId && rows.length > 0) {
          const ops = rows.find((d) => /operation/i.test(d.name));
          setDepartmentId(ops ? ops.id : rows[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (departmentId) loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, weekStart]);

  async function loadPlan() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/weekly-plans", {
        params: { departmentId, fromWeek: weekStart, toWeek: weekStart, pageSize: 1 },
      });
      const rows: PlanListRow[] = res.data.data ?? [];
      if (rows.length === 0) {
        setPlan(null);
      } else {
        // The list row has no budget context — fetch the detail for it.
        const detail = await api.get(`/weekly-plans/${rows[0].id}`);
        setPlan(detail.data.data);
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not load this week's plan.";
      setError(msg);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setFormItems([blankItem(weekStart)]);
    setFormPreparedBy(plan?.preparedBy ?? "");
    setFormNotes(plan?.notes ?? "");
    setFormError("");
    setEditing(true);
  }

  function openEdit() {
    if (!plan) return;
    setFormItems(
      plan.items.length > 0
        ? plan.items.map((i) => ({
            ...i,
            plannedDate: i.plannedDate.slice(0, 10),
            responsible: i.responsible ?? "",
            notes: i.notes ?? "",
          }))
        : [blankItem(weekStart)]
    );
    setFormPreparedBy(plan.preparedBy ?? "");
    setFormNotes(plan.notes ?? "");
    setFormError("");
    setEditing(true);
  }

  function updateItem(index: number, patch: Partial<PlanItem>) {
    setFormItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addRow() {
    setFormItems((prev) => [...prev, blankItem(weekStart)]);
  }

  function removeRow(index: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const cleaned = formItems
      .filter((i) => i.activity.trim() !== "")
      .map((i) => ({
        activity: i.activity.trim(),
        plannedDate: i.plannedDate,
        responsible: (i.responsible ?? "").trim() || null,
        estimatedCost: i.estimatedCost === "" ? 0 : Number(i.estimatedCost),
        status: i.status,
        notes: (i.notes ?? "").trim() || null,
      }));

    if (cleaned.some((i) => Number.isNaN(i.estimatedCost) || i.estimatedCost < 0)) {
      setFormError("Estimated cost must be a number of zero or more.");
      return;
    }

    setSaving(true);
    try {
      if (plan) {
        await api.put(`/weekly-plans/${plan.id}`, {
          preparedBy: formPreparedBy.trim() || null,
          notes: formNotes.trim() || null,
          items: cleaned,
        });
      } else {
        await api.post("/weekly-plans", {
          departmentId,
          weekStartDate: weekStart,
          preparedBy: formPreparedBy.trim() || null,
          notes: formNotes.trim() || null,
          items: cleaned,
        });
      }
      setEditing(false);
      await loadPlan();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not save the plan.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function setItemStatus(itemId: string, status: ItemStatus) {
    if (!plan) return;
    try {
      const res = await api.patch(`/weekly-plans/${plan.id}/items/${itemId}`, { status });
      setPlan(res.data.data);
    } catch {
      setError("Could not update that activity.");
    }
  }

  async function handleDelete() {
    if (!plan) return;
    if (!window.confirm(`Delete the whole plan for ${formatWeekRange(weekStart)}? This cannot be undone.`)) {
      return;
    }
    try {
      await api.delete(`/weekly-plans/${plan.id}`);
      await loadPlan();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Could not delete the plan.";
      setError(msg);
    }
  }

  const formTotal = useMemo(
    () =>
      formItems
        .filter((i) => i.status !== "CANCELLED")
        .reduce((sum, i) => sum + (i.estimatedCost === "" ? 0 : Number(i.estimatedCost) || 0), 0),
    [formItems]
  );

  const isThisWeek = weekStart === startOfWeekISO(new Date());

  return (
    <div className="p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-magen-navy flex items-center gap-2">
            <CalendarRange size={22} /> Weekly Plans
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            What a department intends to do this week, shown against its monthly budget.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              className="px-2 py-2 hover:bg-gray-50 text-gray-600"
              onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-2 text-sm font-medium text-magen-navy whitespace-nowrap">
              {formatWeekRange(weekStart)}
            </span>
            <button
              className="px-2 py-2 hover:bg-gray-50 text-gray-600"
              onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!isThisWeek && (
            <button
              className="text-sm text-magen-navy underline"
              onClick={() => setWeekStart(startOfWeekISO(new Date()))}
            >
              This week
            </button>
          )}

          <button
            className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-1.5"
            onClick={plan ? openEdit : openCreate}
            disabled={!departmentId}
          >
            {plan ? <Pencil size={15} /> : <Plus size={15} />}
            {plan ? "Edit Plan" : "Create Plan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {plan && <BudgetBanner budget={plan.budget} />}

      <div className="mt-6 bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : !plan ? (
          <div className="p-10 text-center">
            <CalendarRange size={32} className="mx-auto text-gray-300" />
            <p className="mt-3 text-gray-500 text-sm">
              No plan yet for {formatWeekRange(weekStart)}.
            </p>
            <button
              className="mt-4 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
              onClick={openCreate}
              disabled={!departmentId}
            >
              Create this week's plan
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
              <div className="text-sm text-gray-600">
                <span className="font-medium text-magen-navy">
                  {plan.totals.doneCount} of {plan.totals.itemCount - plan.totals.cancelledCount} done
                </span>
                {plan.preparedBy && <span className="ml-3">Prepared by {plan.preparedBy}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  Planned spend: <strong className="text-magen-navy">{money(plan.totals.plannedCost)}</strong>
                </span>
                {isAdmin && (
                  <button
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={handleDelete}
                    title="Delete this plan"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {plan.items.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                This plan has no activities yet — use Edit Plan to add some.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Day</th>
                    <th className="text-left font-medium px-5 py-2.5">Activity</th>
                    <th className="text-left font-medium px-5 py-2.5">Responsible</th>
                    <th className="text-right font-medium px-5 py-2.5">Est. cost</th>
                    <th className="text-left font-medium px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-t border-gray-100 ${item.status === "CANCELLED" ? "opacity-50" : ""}`}
                    >
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600">
                        {formatDay(item.plannedDate)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={item.status === "CANCELLED" ? "line-through" : ""}>
                          {item.activity}
                        </span>
                        {item.notes && <div className="text-xs text-gray-400 mt-0.5">{item.notes}</div>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{item.responsible || "—"}</td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {Number(item.estimatedCost) > 0 ? money(Number(item.estimatedCost)) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[item.status]}`}>
                          {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {item.status !== "DONE" && item.id && (
                            <button
                              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50"
                              onClick={() => setItemStatus(item.id as string, "DONE")}
                              title="Mark done"
                            >
                              <Check size={15} />
                            </button>
                          )}
                          {item.status !== "CANCELLED" && item.id && (
                            <button
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                              onClick={() => setItemStatus(item.id as string, "CANCELLED")}
                              title="Cancel"
                            >
                              <X size={15} />
                            </button>
                          )}
                          {item.status !== "PLANNED" && item.id && (
                            <button
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => setItemStatus(item.id as string, "PLANNED")}
                              title="Back to planned"
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {plan.notes && (
              <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-600">
                <span className="text-gray-400">Notes: </span>
                {plan.notes}
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <Modal
          title={plan ? `Edit Plan — ${formatWeekRange(weekStart)}` : `New Plan — ${formatWeekRange(weekStart)}`}
          onClose={() => setEditing(false)}
          widthClass="max-w-4xl"
        >
          <form onSubmit={handleSubmit}>
            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Prepared by</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={formPreparedBy}
                  onChange={(e) => setFormPreparedBy(e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Notes</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Anything worth noting about this week"
                />
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Day</th>
                    <th className="text-left font-medium px-3 py-2">Activity *</th>
                    <th className="text-left font-medium px-3 py-2">Responsible</th>
                    <th className="text-left font-medium px-3 py-2">Est. cost</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <select
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          value={item.plannedDate}
                          onChange={(e) => updateItem(idx, { plannedDate: e.target.value })}
                        >
                          {DAY_NAMES.map((day, i) => (
                            <option key={day} value={addDaysISO(weekStart, i)}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          value={item.activity}
                          onChange={(e) => updateItem(idx, { activity: e.target.value })}
                          placeholder="e.g. Site visit — Salama Park"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          value={item.responsible ?? ""}
                          onChange={(e) => updateItem(idx, { responsible: e.target.value })}
                          placeholder="Who"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                          value={item.estimatedCost}
                          onChange={(e) => updateItem(idx, { estimatedCost: e.target.value })}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeRow(idx)}
                          title="Remove row"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                className="text-sm text-magen-navy font-medium flex items-center gap-1"
                onClick={addRow}
              >
                <Plus size={15} /> Add activity
              </button>
              <span className="text-sm text-gray-600">
                Week total: <strong className="text-magen-navy">{money(formTotal)}</strong>
              </span>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Saving…" : plan ? "Save Changes" : "Create Plan"}
              </button>
              <button
                type="button"
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/**
 * The "hand in hand with the budget" panel. Purely informational — it never
 * prevents anything, it just puts the week's intended spend next to what the
 * department's monthly budget actually has left.
 */
function BudgetBanner({ budget }: { budget: BudgetContext }) {
  const monthLabel = `${MONTH_NAMES[budget.month - 1]} ${budget.year}`;

  if (!budget.hasBudget) {
    return (
      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <Wallet size={18} className="text-gray-400 mt-0.5" />
        <div className="text-sm">
          <div className="text-gray-700 font-medium">
            No budget set for {monthLabel}
          </div>
          <div className="text-gray-500 mt-0.5">
            This week plans {money(budget.thisWeekPlannedCost)} of spend. Create a budget for{" "}
            {monthLabel} on the Budgets page to see it measured against something.
          </div>
        </div>
      </div>
    );
  }

  const over = budget.projectedRemaining < 0;

  return (
    <div
      className={`mt-4 rounded-xl px-5 py-4 border ${
        over ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"
      }`}
    >
      <div className="flex items-start gap-3">
        {over ? (
          <AlertTriangle size={18} className="text-red-500 mt-0.5" />
        ) : (
          <Wallet size={18} className="text-blue-500 mt-0.5" />
        )}
        <div className="flex-1">
          <div className={`text-sm font-medium ${over ? "text-red-700" : "text-magen-navy"}`}>
            {over
              ? `Everything planned for ${monthLabel} exceeds what's left in the budget by ${money(Math.abs(budget.projectedRemaining))}.`
              : `${money(budget.projectedRemaining)} would still be left in the ${monthLabel} budget after everything planned.`}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-3 text-sm">
            <Figure label="This week planned" value={money(budget.thisWeekPlannedCost)} />
            <Figure label="Other weeks planned" value={money(budget.otherWeeksPlannedCost)} />
            <Figure label="Already spent" value={money(budget.budgetActual)} />
            <Figure
              label={`${monthLabel} budget left`}
              value={money(budget.budgetRemaining)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-magen-navy">{value}</div>
    </div>
  );
}
