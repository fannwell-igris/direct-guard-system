import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface ProspectOption { id: string; companyName: string; }
interface ClientOption { id: string; name: string; }

interface Activity {
  id: string;
  type: string;
  prospectId: string | null;
  prospect?: ProspectOption | null;
  clientId: string | null;
  client?: ClientOption | null;
  purpose: string | null;
  outcome: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  notes: string | null;
  activityDate: string;
  performedBy?: { id: string; fullName: string } | null;
}

interface ActivityFormState {
  type: string;
  prospectId: string;
  clientId: string;
  purpose: string;
  outcome: string;
  nextAction: string;
  followUpDate: string;
  activityDate: string;
  notes: string;
}

const TYPES = [
  "EMAIL", "CALL", "WHATSAPP", "VISIT", "MEETING", "FOLLOW_UP",
  "PROPOSAL_SENT", "QUOTATION_SENT", "NEW_PROSPECT_IDENTIFIED",
  "SOCIAL_MEDIA", "CAMPAIGN", "NETWORKING_EVENT", "OTHER",
];

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\w\S*/g, (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
}

function typeClass(t: string) {
  switch (t) {
    case "MEETING": return "bg-blue-100 text-blue-700";
    case "VISIT": return "bg-teal-100 text-teal-700";
    case "PROPOSAL_SENT": case "QUOTATION_SENT": return "bg-purple-100 text-purple-700";
    case "CALL": case "WHATSAPP": case "EMAIL": return "bg-yellow-100 text-yellow-700";
    case "NEW_PROSPECT_IDENTIFIED": return "bg-green-100 text-green-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function emptyForm(): ActivityFormState {
  return {
    type: "CALL", prospectId: "", clientId: "", purpose: "", outcome: "",
    nextAction: "", followUpDate: "", activityDate: new Date().toISOString().slice(0, 10), notes: "",
  };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB");
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ActivityFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadActivities() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (typeFilter) params.type = typeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await api.get("/marketing-activities", { params });
      setActivities(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load activities."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadActivities();
    api.get("/prospects", { params: { pageSize: 500 } }).then((r) => setProspects(r.data.data)).catch(() => {});
    api.get("/clients", { params: { pageSize: 500, status: "ACTIVE" } }).then((r) => setClients(r.data.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const payload = {
      type: form.type,
      prospectId: form.prospectId || null,
      clientId: form.clientId || null,
      purpose: form.purpose.trim() || null,
      outcome: form.outcome.trim() || null,
      nextAction: form.nextAction.trim() || null,
      followUpDate: form.followUpDate || null,
      activityDate: form.activityDate || undefined,
      notes: form.notes.trim() || null,
    };
    try {
      await api.post("/marketing-activities", payload);
      setShowForm(false); setForm(emptyForm());
      await loadActivities();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save activity."); }
    finally { setIsSaving(false); }
  }

  // Activity vs Results split (brief section 3): activity volume by type,
  // and a simple "results" count of the outcome-bearing types that
  // actually move the funnel forward, so raw activity isn't read as
  // performance on its own.
  const resultTypes = ["MEETING", "PROPOSAL_SENT", "QUOTATION_SENT", "NEW_PROSPECT_IDENTIFIED"];
  const resultsCount = activities.filter((a) => resultTypes.includes(a.type)).length;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing Activities</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activities.length} activities logged
            <span className="ml-2 text-gray-400">· {resultsCount} produced a meeting, proposal, quotation, or new prospect</span>
          </p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setFormError(null); setShowForm(true); }}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + Log Activity
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Types</option>
          {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm" title="From" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm" title="To" />
        <button onClick={loadActivities} className="text-sm border border-gray-300 rounded px-3 py-2 hover:bg-gray-100">Filter</button>
      </div>

      {/* Form */}
      {showForm && (
        <Modal title="Log Activity" onClose={() => setShowForm(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Type *</label>
                <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Date</label>
                <input type="date" value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Prospect</label>
                <select value={form.prospectId} onChange={(e) => setForm({ ...form, prospectId: e.target.value, clientId: e.target.value ? "" : form.clientId })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">None</option>
                  {prospects.map((p) => <option key={p.id} value={p.id}>{p.companyName}</option>)}
                </select></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Existing Client</label>
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, prospectId: e.target.value ? "" : form.prospectId })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">None</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Purpose</label>
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Outcome</label>
                <input value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Next Action</label>
                <input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Follow-up Date</label>
              <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSaving}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        {isLoading ? <div className="p-6 text-sm text-gray-400">Loading...</div>
          : activities.length === 0 ? <div className="p-6 text-sm text-gray-400">No activities logged yet.</div>
          : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Prospect / Client</th>
                  <th className="text-left px-4 py-3">Purpose</th>
                  <th className="text-left px-4 py-3">Outcome</th>
                  <th className="text-left px-4 py-3">Next Follow-up</th>
                  <th className="text-left px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.activityDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeClass(a.type)}`}>{typeLabel(a.type)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{a.prospect?.companyName ?? a.client?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.purpose ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.outcome ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.followUpDate)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{a.performedBy?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
