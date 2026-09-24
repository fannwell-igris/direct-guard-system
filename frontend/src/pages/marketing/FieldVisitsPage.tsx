import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface ProspectOption { id: string; companyName: string; }
interface ClientOption { id: string; name: string; }

interface FieldVisit {
  id: string;
  prospectId: string | null;
  prospect?: ProspectOption | null;
  clientId: string | null;
  client?: ClientOption | null;
  visitDate: string;
  location: string | null;
  personVisited: string | null;
  purpose: string | null;
  outcome: string | null;
  opportunitiesIdentified: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  notes: string | null;
  attachmentFilename: string | null;
  marketer?: { id: string; fullName: string } | null;
}

interface VisitFormState {
  prospectId: string;
  clientId: string;
  visitDate: string;
  location: string;
  personVisited: string;
  purpose: string;
  outcome: string;
  opportunitiesIdentified: string;
  nextAction: string;
  followUpDate: string;
  notes: string;
}

function emptyForm(): VisitFormState {
  return {
    prospectId: "", clientId: "", visitDate: new Date().toISOString().slice(0, 10),
    location: "", personVisited: "", purpose: "", outcome: "",
    opportunitiesIdentified: "", nextAction: "", followUpDate: "", notes: "",
  };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB");
}

export default function FieldVisitsPage() {
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VisitFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail / attachment
  const [selected, setSelected] = useState<FieldVisit | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function loadVisits() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await api.get("/field-visits", { params });
      setVisits(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load field visits."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadVisits();
    api.get("/prospects", { params: { pageSize: 500 } }).then((r) => setProspects(r.data.data)).catch(() => {});
    api.get("/clients", { params: { pageSize: 500, status: "ACTIVE" } }).then((r) => setClients(r.data.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const payload = {
      prospectId: form.prospectId || null,
      clientId: form.clientId || null,
      visitDate: form.visitDate || undefined,
      location: form.location.trim() || null,
      personVisited: form.personVisited.trim() || null,
      purpose: form.purpose.trim() || null,
      outcome: form.outcome.trim() || null,
      opportunitiesIdentified: form.opportunitiesIdentified.trim() || null,
      nextAction: form.nextAction.trim() || null,
      followUpDate: form.followUpDate || null,
      notes: form.notes.trim() || null,
    };
    try {
      await api.post("/field-visits", payload);
      setShowForm(false); setForm(emptyForm());
      await loadVisits();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save field visit."); }
    finally { setIsSaving(false); }
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const fd = new FormData();
    fd.append("file", file);
    setUploadError(null); setIsUploading(true);
    try {
      const res = await api.post(`/field-visits/${selected.id}/attachment`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSelected(res.data.data);
      await loadVisits();
    } catch (err: any) { setUploadError(err.response?.data?.message ?? "Failed to upload attachment."); }
    finally { setIsUploading(false); e.target.value = ""; }
  }

  async function handleDownloadAttachment() {
    if (!selected) return;
    try {
      const res = await api.get(`/field-visits/${selected.id}/attachment`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visit-${selected.id}-attachment`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setUploadError("Failed to download attachment."); }
  }

  async function handleRemoveAttachment() {
    if (!selected) return;
    setUploadError(null); setIsUploading(true);
    try {
      const res = await api.delete(`/field-visits/${selected.id}/attachment`);
      setSelected(res.data.data);
      await loadVisits();
    } catch (err: any) { setUploadError(err.response?.data?.message ?? "Failed to remove attachment."); }
    finally { setIsUploading(false); }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Field Visits</h1>
          <p className="text-sm text-gray-500 mt-0.5">{visits.length} visits logged</p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setFormError(null); setShowForm(true); }}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + Log Visit
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm" title="From" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm" title="To" />
        <button onClick={loadVisits} className="text-sm border border-gray-300 rounded px-3 py-2 hover:bg-gray-100">Filter</button>
      </div>

      {/* Form */}
      {showForm && (
        <Modal title="Log Field Visit" onClose={() => setShowForm(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
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
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Visit Date</label>
                <input type="date" value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Person / Company Visited</label>
              <input value={form.personVisited} onChange={(e) => setForm({ ...form, personVisited: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Purpose</label>
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Outcome</label>
                <input value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Opportunities Identified</label>
                <input value={form.opportunitiesIdentified} onChange={(e) => setForm({ ...form, opportunitiesIdentified: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Next Action</label>
                <input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Follow-up Date</label>
                <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <p className="text-xs text-gray-400">You can attach a supporting photo or document after saving, from the visit's detail view.</p>
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

      <div className="flex gap-4">
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? <div className="p-6 text-sm text-gray-400">Loading...</div>
            : visits.length === 0 ? <div className="p-6 text-sm text-gray-400">No field visits logged yet.</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Prospect / Client</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Outcome</th>
                    <th className="text-left px-4 py-3">By</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visits.map((v) => (
                    <tr key={v.id} className={selected?.id === v.id ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(v.visitDate)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelected(v); setUploadError(null); }} className="font-medium text-green-600 hover:underline text-left text-xs">
                          {v.prospect?.companyName ?? v.client?.name ?? "—"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{v.location ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{v.outcome ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{v.marketer?.fullName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setSelected(v); setUploadError(null); }} className="text-gray-500 hover:underline text-xs">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {selected && (
          <div className="w-80 shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3 self-start">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{selected.prospect?.companyName ?? selected.client?.name ?? "—"}</h3>
                <p className="text-xs text-gray-400">{fmtDate(selected.visitDate)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>

            <div className="text-xs space-y-1 text-gray-500">
              {selected.location && <div className="flex justify-between"><span>Location</span><span className="text-gray-700">{selected.location}</span></div>}
              {selected.personVisited && <div className="flex justify-between"><span>Person Visited</span><span className="text-gray-700">{selected.personVisited}</span></div>}
              {selected.purpose && <div className="flex justify-between"><span>Purpose</span><span className="text-gray-700">{selected.purpose}</span></div>}
              {selected.outcome && <div className="flex justify-between"><span>Outcome</span><span className="text-gray-700">{selected.outcome}</span></div>}
              {selected.opportunitiesIdentified && <div className="flex justify-between"><span>Opportunities</span><span className="text-gray-700">{selected.opportunitiesIdentified}</span></div>}
              {selected.nextAction && <div className="flex justify-between"><span>Next Action</span><span className="text-gray-700">{selected.nextAction}</span></div>}
              <div className="flex justify-between"><span>Follow-up</span><span className="text-gray-700">{fmtDate(selected.followUpDate)}</span></div>
              <div className="flex justify-between"><span>Logged by</span><span className="text-gray-700">{selected.marketer?.fullName ?? "—"}</span></div>
            </div>

            {selected.notes && <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{selected.notes}</div>}

            {/* Attachment */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-gray-700">Supporting Photo / Document</p>
              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
              {selected.attachmentFilename ? (
                <div className="flex gap-2">
                  <button onClick={handleDownloadAttachment} disabled={isUploading}
                    className="flex-1 text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100 disabled:opacity-60">Download</button>
                  <button onClick={handleRemoveAttachment} disabled={isUploading}
                    className="text-xs border border-red-200 text-red-600 rounded px-3 py-1.5 hover:bg-red-50 disabled:opacity-60">Remove</button>
                </div>
              ) : (
                <label className="block text-xs border border-dashed border-gray-300 rounded px-3 py-2 text-center text-gray-500 hover:bg-gray-50 cursor-pointer">
                  {isUploading ? "Uploading…" : "Click to attach a photo or document"}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleAttachmentUpload} disabled={isUploading} className="hidden" />
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
