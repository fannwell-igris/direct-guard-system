import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface AssignableUser { id: string; fullName: string; role: string; }

interface StageHistoryEntry {
  id: string;
  fromStage: string | null;
  toStage: string;
  notes: string | null;
  changedAt: string;
  changedBy?: { id: string; fullName: string } | null;
}

interface Prospect {
  id: string;
  companyName: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  location: string | null;
  potentialService: string | null;
  source: string | null;
  assignedToId: string | null;
  assignedTo?: AssignableUser | null;
  dateAdded: string;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  stage: string;
  opportunityValue: string | null;
  outcome: string | null;
  notes: string | null;
  stageHistory?: StageHistoryEntry[];
}

interface ProspectFormState {
  companyName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  location: string;
  potentialService: string;
  source: string;
  assignedToId: string;
  nextFollowUpDate: string;
  opportunityValue: string;
  notes: string;
}

const EMPTY_FORM: ProspectFormState = {
  companyName: "", contactName: "", contactPhone: "", contactEmail: "",
  location: "", potentialService: "", source: "", assignedToId: "",
  nextFollowUpDate: "", opportunityValue: "", notes: "",
};

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST", "NOT_INTERESTED"];

function stageLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function stageClass(s: string) {
  switch (s) {
    case "WON": return "bg-green-100 text-green-700";
    case "LOST": case "NOT_INTERESTED": return "bg-red-100 text-red-700";
    case "NEGOTIATION": case "PROPOSAL_SENT": return "bg-purple-100 text-purple-700";
    case "MEETING": return "bg-blue-100 text-blue-700";
    case "QUALIFIED": return "bg-teal-100 text-teal-700";
    case "CONTACTED": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB");
}

function isOverdue(d: string | null) {
  if (!d) return false;
  const followUp = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return followUp < today;
}

const OPEN_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION"];

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [followUpDueOnly, setFollowUpDueOnly] = useState(false);

  // Form
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ProspectFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [stageNotes, setStageNotes] = useState("");
  const [isChangingStage, setIsChangingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  async function loadProspects() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (search) params.search = search;
      if (stageFilter) params.stage = stageFilter;
      if (followUpDueOnly) params.followUpDue = "true";
      const res = await api.get("/prospects", { params });
      setProspects(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load prospects."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadProspects();
    api.get("/prospects/assignable-users").then((r) => setUsers(r.data.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(p: Prospect) {
    try {
      const res = await api.get(`/prospects/${p.id}`);
      setSelected(res.data.data);
      setStageNotes(""); setStageError(null);
    } catch { /* ignore */ }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const payload = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      location: form.location.trim() || null,
      potentialService: form.potentialService.trim() || null,
      source: form.source.trim() || null,
      assignedToId: form.assignedToId || null,
      nextFollowUpDate: form.nextFollowUpDate || null,
      opportunityValue: form.opportunityValue ? parseFloat(form.opportunityValue) : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId === "new") await api.post("/prospects", payload);
      else if (editingId) await api.put(`/prospects/${editingId}`, payload);
      setEditingId(null); await loadProspects();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save prospect."); }
    finally { setIsSaving(false); }
  }

  function openEdit(p: Prospect) {
    setForm({
      companyName: p.companyName,
      contactName: p.contactName ?? "",
      contactPhone: p.contactPhone ?? "",
      contactEmail: p.contactEmail ?? "",
      location: p.location ?? "",
      potentialService: p.potentialService ?? "",
      source: p.source ?? "",
      assignedToId: p.assignedToId ?? "",
      nextFollowUpDate: p.nextFollowUpDate ? p.nextFollowUpDate.slice(0, 10) : "",
      opportunityValue: p.opportunityValue ?? "",
      notes: p.notes ?? "",
    });
    setFormError(null);
    setEditingId(p.id);
    setSelected(null);
  }

  async function handleStageChange(stage: string) {
    if (!selected) return;
    setStageError(null); setIsChangingStage(true);
    try {
      await api.patch(`/prospects/${selected.id}/stage`, { stage, notes: stageNotes.trim() || null });
      await openDetail(selected);
      await loadProspects();
      setStageNotes("");
    } catch (err: any) { setStageError(err.response?.data?.message ?? "Failed to change stage."); }
    finally { setIsChangingStage(false); }
  }

  const dueCount = prospects.filter((p) => isOverdue(p.nextFollowUpDate) && OPEN_STAGES.includes(p.stage)).length;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prospects.length} total
            {dueCount > 0 && <span className="ml-2 text-amber-600 font-medium">· {dueCount} follow-up{dueCount === 1 ? "" : "s"} overdue</span>}
          </p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setEditingId("new"); setSelected(null); }}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + New Prospect
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact, phone…"
          className="border border-gray-300 rounded px-3 py-2 text-sm w-64" />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={followUpDueOnly} onChange={(e) => setFollowUpDueOnly(e.target.checked)} />
          Follow-ups due
        </label>
        <button onClick={loadProspects} className="text-sm border border-gray-300 rounded px-3 py-2 hover:bg-gray-100">Filter</button>
      </div>

      {/* Form */}
      {editingId && (
        <Modal
          title={editingId === "new" ? "New Prospect" : "Edit Prospect"}
          onClose={() => setEditingId(null)}
          widthClass="max-w-2xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Company / Prospect Name *</label>
                <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Contact Name</label>
                <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Contact Phone</label>
                <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Contact Email</label>
                <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Potential Service</label>
                <input value={form.potentialService} onChange={(e) => setForm({ ...form, potentialService: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Source</label>
                <input value={form.source} placeholder="Referral, cold call…" onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Assigned To</label>
                <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Next Follow-up</label>
                <input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Estimated Opportunity Value (K)</label>
              <input type="number" min="0" step="0.01" value={form.opportunityValue}
                onChange={(e) => setForm({ ...form, opportunityValue: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSaving}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setEditingId(null)}
                className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? <div className="p-6 text-sm text-gray-400">Loading...</div>
            : prospects.length === 0 ? <div className="p-6 text-sm text-gray-400">No prospects found.</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Company</th>
                    <th className="text-left px-4 py-3">Contact</th>
                    <th className="text-left px-4 py-3">Stage</th>
                    <th className="text-left px-4 py-3">Assigned</th>
                    <th className="text-left px-4 py-3">Next Follow-up</th>
                    <th className="text-right px-4 py-3">Value</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prospects.map((p) => (
                    <tr key={p.id} className={selected?.id === p.id ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(p)} className="font-medium text-green-600 hover:underline text-left">
                          {p.companyName}
                        </button>
                        {p.location && <p className="text-xs text-gray-400">{p.location}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.contactName ?? "—"}
                        {p.contactPhone && <p className="text-gray-400">{p.contactPhone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stageClass(p.stage)}`}>{stageLabel(p.stage)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.assignedTo?.fullName ?? "Unassigned"}</td>
                      <td className={`px-4 py-3 text-xs ${isOverdue(p.nextFollowUpDate) && OPEN_STAGES.includes(p.stage) ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        {fmtDate(p.nextFollowUpDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {p.opportunityValue ? fmtMoney(p.opportunityValue) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => openEdit(p)} className="text-green-600 hover:underline text-xs">Edit</button>
                        <button onClick={() => openDetail(p)} className="text-gray-500 hover:underline text-xs">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3 self-start">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{selected.companyName}</h3>
                <p className="text-xs text-gray-400">{selected.location}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>

            <div className="text-xs space-y-1 text-gray-500">
              <div className="flex justify-between">
                <span>Stage</span>
                <span className={`font-medium px-2 py-0.5 rounded-full ${stageClass(selected.stage)}`}>{stageLabel(selected.stage)}</span>
              </div>
              {selected.contactName && <div className="flex justify-between"><span>Contact</span><span className="text-gray-700">{selected.contactName}</span></div>}
              {selected.contactPhone && <div className="flex justify-between"><span>Phone</span><span className="text-gray-700">{selected.contactPhone}</span></div>}
              {selected.contactEmail && <div className="flex justify-between"><span>Email</span><span className="text-gray-700">{selected.contactEmail}</span></div>}
              {selected.potentialService && <div className="flex justify-between"><span>Service</span><span className="text-gray-700">{selected.potentialService}</span></div>}
              {selected.source && <div className="flex justify-between"><span>Source</span><span className="text-gray-700">{selected.source}</span></div>}
              <div className="flex justify-between"><span>Assigned</span><span className="text-gray-700">{selected.assignedTo?.fullName ?? "Unassigned"}</span></div>
              <div className="flex justify-between"><span>Next Follow-up</span><span className="text-gray-700">{fmtDate(selected.nextFollowUpDate)}</span></div>
              <div className="flex justify-between"><span>Last Contact</span><span className="text-gray-700">{fmtDate(selected.lastContactDate)}</span></div>
              {selected.opportunityValue && <div className="flex justify-between"><span>Value</span><span className="text-gray-700 font-medium">{fmtMoney(selected.opportunityValue)}</span></div>}
            </div>

            {selected.notes && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{selected.notes}</div>
            )}

            {/* Stage change */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-gray-700">Move to a new stage</p>
              {stageError && <p className="text-xs text-red-600">{stageError}</p>}
              <textarea value={stageNotes} onChange={(e) => setStageNotes(e.target.value)} placeholder="Notes about this change (optional)"
                rows={2} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
              <select
                value=""
                disabled={isChangingStage}
                onChange={(e) => { if (e.target.value) handleStageChange(e.target.value); }}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
              >
                <option value="">{isChangingStage ? "Updating…" : "Choose new stage…"}</option>
                {STAGES.filter((s) => s !== selected.stage).map((s) => (
                  <option key={s} value={s}>{stageLabel(s)}</option>
                ))}
              </select>
            </div>

            {/* Stage history */}
            {selected.stageHistory && selected.stageHistory.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">History</p>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selected.stageHistory.map((h) => (
                    <div key={h.id} className="text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-700 font-medium">
                          {h.fromStage ? `${stageLabel(h.fromStage)} → ${stageLabel(h.toStage)}` : `Created at ${stageLabel(h.toStage)}`}
                        </span>
                        <span className="text-gray-400">{fmtDate(h.changedAt)}</span>
                      </div>
                      {h.changedBy && <p className="text-gray-400">by {h.changedBy.fullName}</p>}
                      {h.notes && <p className="text-gray-500 mt-0.5">{h.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
