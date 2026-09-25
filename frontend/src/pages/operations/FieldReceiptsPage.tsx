import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";

type Status = "PENDING" | "RECONCILED" | "DISCREPANCY";

// Mirrors backend/src/modules/field-receipts/field-receipts.controller.ts's
// RECONCILE_ROLES — Operations can log entries but only Admin/Finance can
// reconcile them, so the button is hidden for anyone else (the backend
// still enforces this regardless of what the UI shows).
const RECONCILE_ROLES = ["ADMIN", "PAYROLL"];

interface SiteLite { id: string; siteName: string; }

interface FieldReceipt {
  id: string;
  referenceNumber: string;
  amount: string | number;
  date: string;
  purpose: string | null;
  site?: { id: string; siteName: string } | null;
  recordedBy: string | null;
  status: Status;
  reconciledBy: string | null;
  reconciledAt: string | null;
  reconciliationNotes: string | null;
  notes: string | null;
}

const STATUS_BADGE: Record<Status, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  RECONCILED: "bg-green-100 text-green-700",
  DISCREPANCY: "bg-red-100 text-red-700",
};

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

/**
 * Lets Operations log a receipt's reference number and amount out in the
 * field, so that when the physical receipt is later handed to Finance or
 * Admin, it can be reconciled against what was already entered — added
 * 2026-09-25, per explicit instruction.
 */
export default function FieldReceiptsPage() {
  const { user } = useAuth();
  const canReconcile = !!user && RECONCILE_ROLES.includes(user.role);
  const [entries, setEntries] = useState<FieldReceipt[]>([]);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | "">("PENDING");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    referenceNumber: "", amount: "", date: new Date().toISOString().slice(0, 10),
    purpose: "", siteId: "", recordedBy: "", notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [reconciling, setReconciling] = useState<FieldReceipt | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<"RECONCILED" | "DISCREPANCY">("RECONCILED");
  const [reconciledBy, setReconciledBy] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  async function load() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/field-receipts", { params });
      setEntries(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load field receipts."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);
  useEffect(() => {
    api.get("/sites", { params: { pageSize: 100, status: "ACTIVE" } }).then((r) => setSites(r.data.data)).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    try {
      await api.post("/field-receipts", {
        referenceNumber: form.referenceNumber.trim(),
        amount: Number(form.amount),
        date: form.date,
        purpose: form.purpose.trim() || null,
        siteId: form.siteId || null,
        recordedBy: form.recordedBy.trim() || null,
        notes: form.notes.trim() || null,
      });
      setShowForm(false);
      setForm({ referenceNumber: "", amount: "", date: new Date().toISOString().slice(0, 10), purpose: "", siteId: "", recordedBy: "", notes: "" });
      await load();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save."); }
    finally { setIsSaving(false); }
  }

  function openReconcile(entry: FieldReceipt) {
    setReconciling(entry); setReconcileStatus("RECONCILED"); setReconciledBy(""); setReconcileNotes(""); setReconcileError(null);
  }

  async function handleReconcile(e: FormEvent) {
    e.preventDefault();
    if (!reconciling) return;
    setReconcileError(null); setIsReconciling(true);
    try {
      await api.post(`/field-receipts/${reconciling.id}/reconcile`, {
        status: reconcileStatus,
        reconciledBy: reconciledBy.trim(),
        reconciliationNotes: reconcileNotes.trim() || null,
      });
      setReconciling(null);
      await load();
    } catch (err: any) { setReconcileError(err.response?.data?.message ?? "Failed to reconcile."); }
    finally { setIsReconciling(false); }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Field Receipts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Log a receipt ref# in the field; Finance reconciles it once the physical copy comes in.</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "")}
            className="border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="RECONCILED">Reconciled</option>
            <option value="DISCREPANCY">Discrepancy</option>
          </select>
          <button onClick={() => setShowForm(true)} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
            + Log Receipt
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {showForm && (
        <Modal title="Log Field Receipt" onClose={() => setShowForm(false)} widthClass="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Reference Number *</label>
                <input required value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="e.g. receipt book no." /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Amount (ZMW) *</label>
                <input required type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Date *</label>
                <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Site</label>
                <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">None</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
                </select></div>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Purpose</label>
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="What was this for?" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Recorded By</label>
              <input value={form.recordedBy} onChange={(e) => setForm({ ...form, recordedBy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Your name" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button type="submit" disabled={isSaving}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {reconciling && (
        <Modal title={`Reconcile Receipt ${reconciling.referenceNumber}`} onClose={() => setReconciling(null)} widthClass="max-w-sm">
          <form onSubmit={handleReconcile} className="space-y-4">
            {reconcileError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{reconcileError}</div>}
            <p className="text-xs text-gray-500">
              Logged amount: <span className="font-medium text-gray-800">{fmtMoney(reconciling.amount)}</span>
            </p>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Outcome *</label>
              <select value={reconcileStatus} onChange={(e) => setReconcileStatus(e.target.value as "RECONCILED" | "DISCREPANCY")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="RECONCILED">Matches — Reconciled</option>
                <option value="DISCREPANCY">Doesn't match — Discrepancy</option>
              </select></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Your Name *</label>
              <input required value={reconciledBy} onChange={(e) => setReconciledBy(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={reconcileNotes} rows={2} onChange={(e) => setReconcileNotes(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional — describe the discrepancy, if any" /></div>
            <div className="flex gap-2">
              <button type="submit" disabled={isReconciling}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isReconciling ? "Saving..." : "Confirm"}
              </button>
              <button type="button" onClick={() => setReconciling(null)} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">No field receipts logged.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Ref #</th>
                <th className="text-left px-4 py-3">Site</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Recorded By</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{e.referenceNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{e.site?.siteName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(e.amount)}</td>
                  <td className="px-4 py-3 text-gray-600">{e.recordedBy ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.status === "PENDING" && canReconcile && (
                      <button onClick={() => openReconcile(e)} className="text-xs text-green-600 hover:underline">Reconcile</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
