import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface MarketerOption {
  id: string;
  fullName: string;
  role: string;
}

interface Target {
  id: string;
  marketerId: string | null;
  marketer?: { id: string; fullName: string } | null;
  periodYear: number;
  periodMonth: number;
  targetNewProspects: number | null;
  targetActivities: number | null;
  targetVisits: number | null;
  targetConversions: number | null;
  notes: string | null;
  actuals: {
    newProspects: number;
    activities: number;
    visits: number;
    conversions: number;
  };
}

interface FormState {
  marketerId: string;
  periodYear: string;
  periodMonth: string;
  targetNewProspects: string;
  targetActivities: string;
  targetVisits: string;
  targetConversions: string;
  notes: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function emptyForm(year: number, month: number): FormState {
  return {
    marketerId: "", periodYear: String(year), periodMonth: String(month),
    targetNewProspects: "", targetActivities: "", targetVisits: "", targetConversions: "", notes: "",
  };
}

function ProgressBar({ label, actual, target }: { label: string; actual: number; target: number | null }) {
  if (target === null) {
    return (
      <div className="text-xs text-gray-400">
        {label}: <span className="text-gray-600 font-medium">{actual}</span> (no target set)
      </div>
    );
  }
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : actual > 0 ? 100 : 0;
  const met = actual >= target;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={met ? "text-green-600 font-semibold" : "text-gray-700 font-medium"}>
          {actual} / {target}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${met ? "bg-green-500" : "bg-magen-green"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function TargetsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [targets, setTargets] = useState<Target[]>([]);
  const [marketers, setMarketers] = useState<MarketerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(year, month));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadTargets() {
    setIsLoading(true); setError(null);
    try {
      const res = await api.get("/marketing-targets", { params: { periodYear: year, periodMonth: month, pageSize: 100 } });
      setTargets(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load targets."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    api.get("/prospects/assignable-users").then((r) => setMarketers(r.data.data)).catch(() => {});
  }, []);

  function openCreate() {
    setForm(emptyForm(year, month)); setFormError(null); setEditingId(null); setShowForm(true);
  }
  function openEdit(t: Target) {
    setForm({
      marketerId: t.marketerId ?? "",
      periodYear: String(t.periodYear),
      periodMonth: String(t.periodMonth),
      targetNewProspects: t.targetNewProspects?.toString() ?? "",
      targetActivities: t.targetActivities?.toString() ?? "",
      targetVisits: t.targetVisits?.toString() ?? "",
      targetConversions: t.targetConversions?.toString() ?? "",
      notes: t.notes ?? "",
    });
    setFormError(null); setEditingId(t.id); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setFormError(null); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const toIntOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const payload = {
      marketerId: form.marketerId || null,
      periodYear: Number(form.periodYear),
      periodMonth: Number(form.periodMonth),
      targetNewProspects: toIntOrNull(form.targetNewProspects),
      targetActivities: toIntOrNull(form.targetActivities),
      targetVisits: toIntOrNull(form.targetVisits),
      targetConversions: toIntOrNull(form.targetConversions),
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) {
        await api.put(`/marketing-targets/${editingId}`, payload);
      } else {
        await api.post("/marketing-targets", payload);
      }
      closeForm(); await loadTargets();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save target."); }
    finally { setIsSaving(false); }
  }

  async function handleDelete(t: Target) {
    try {
      await api.delete(`/marketing-targets/${t.id}`);
      await loadTargets();
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to delete target."); }
  }

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing Targets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly goals vs. actuals, per marketer or team-wide</p>
        </div>
        <button onClick={openCreate} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + Set Target
        </button>
      </div>

      <div className="flex gap-2 items-center">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-gray-300 rounded px-3 py-2 text-sm">
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-gray-300 rounded px-3 py-2 text-sm">
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {showForm && (
        <Modal title={editingId ? "Edit Target" : "Set Target"} onClose={closeForm} widthClass="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Marketer</label>
              <select value={form.marketerId} onChange={(e) => setForm({ ...form, marketerId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">Team-wide (all marketers)</option>
                {marketers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Month</label>
                <select value={form.periodMonth} onChange={(e) => setForm({ ...form, periodMonth: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Year</label>
                <input type="number" value={form.periodYear} onChange={(e) => setForm({ ...form, periodYear: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Target: New Prospects</label>
                <input type="number" min={0} value={form.targetNewProspects} onChange={(e) => setForm({ ...form, targetNewProspects: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Target: Activities</label>
                <input type="number" min={0} value={form.targetActivities} onChange={(e) => setForm({ ...form, targetActivities: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Target: Field Visits</label>
                <input type="number" min={0} value={form.targetVisits} onChange={(e) => setForm({ ...form, targetVisits: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Target: Conversions (Won)</label>
                <input type="number" min={0} value={form.targetConversions} onChange={(e) => setForm({ ...form, targetConversions: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSaving}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={closeForm} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="text-sm text-gray-400">Loading...</div>
        ) : targets.length === 0 ? (
          <div className="text-sm text-gray-400 col-span-2 bg-white border border-gray-200 rounded-lg p-6 text-center">
            No targets set for {MONTH_NAMES[month - 1]} {year} yet.
          </div>
        ) : (
          targets.map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  {t.marketer?.fullName ?? "Team-wide"}
                </h3>
                <div className="flex gap-3">
                  <button onClick={() => openEdit(t)} className="text-xs text-green-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(t)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
              <div className="space-y-2">
                <ProgressBar label="New Prospects" actual={t.actuals.newProspects} target={t.targetNewProspects} />
                <ProgressBar label="Activities" actual={t.actuals.activities} target={t.targetActivities} />
                <ProgressBar label="Field Visits" actual={t.actuals.visits} target={t.targetVisits} />
                <ProgressBar label="Conversions (Won)" actual={t.actuals.conversions} target={t.targetConversions} />
              </div>
              {t.notes && <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">{t.notes}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
