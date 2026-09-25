import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface EmployeeLookup { id: string; fullName: string; }

interface SalaryAdvance {
  id: string;
  employeeId: string;
  employee?: { id: string; fullName: string; position: string | null };
  advanceDate: string;
  amount: string | number;
  reason: string | null;
  repaymentMonths: number;
  monthlyDeduction: string | number;
  amountRepaid: string | number;
  outstandingBalance: string | number;
  status: "ACTIVE" | "FULLY_REPAID" | "CANCELLED";
  approvedBy: string | null;
  notes: string | null;
  advanceType: "CURRENT_PERIOD" | "LOAN";
}

interface FormState {
  employeeId: string;
  advanceDate: string;
  amount: string;
  reason: string;
  repaymentMonths: string;
  approvedBy: string;
  notes: string;
  advanceType: "CURRENT_PERIOD" | "LOAN";
}

function emptyForm(): FormState {
  return {
    employeeId: "", advanceDate: new Date().toISOString().slice(0, 10),
    amount: "", reason: "", repaymentMonths: "1", approvedBy: "", notes: "",
    advanceType: "CURRENT_PERIOD",
  };
}

const ADVANCE_TYPE_LABEL: Record<string, string> = {
  CURRENT_PERIOD: "Early payment (this period)",
  LOAN: "Loan (repaid over months)",
};

function fmtMoney(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB");
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-amber-100 text-amber-700",
  FULLY_REPAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

/**
 * Salary Advances — a direct payment to an employee outside the formal
 * payroll run (one active advance per employee at a time, repaid over N
 * months). The backend for this has existed for a while; this page is
 * what was missing — added 2026-09-24 so a MANAGER who pays employees
 * directly can record it themselves instead of it going untracked.
 */
export default function SalaryAdvancesPage() {
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [employees, setEmployees] = useState<EmployeeLookup[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [selected, setSelected] = useState<SalaryAdvance | null>(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayError, setRepayError] = useState<string | null>(null);
  const [isRepaying, setIsRepaying] = useState(false);

  async function loadAdvances() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/salary-advances", { params });
      setAdvances(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load salary advances."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    api.get("/employees", { params: { pageSize: 200, employmentStatus: "ACTIVE" } })
      .then((r) => setEmployees(r.data.data)).catch(() => {});
  }, []);

  function openCreate() {
    setForm(emptyForm()); setFormError(null); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setFormError(null); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    try {
      await api.post("/salary-advances", {
        employeeId: form.employeeId,
        advanceDate: form.advanceDate,
        amount: Number(form.amount),
        reason: form.reason.trim() || null,
        repaymentMonths: Number(form.repaymentMonths),
        advanceType: form.advanceType,
        approvedBy: form.approvedBy.trim() || null,
        notes: form.notes.trim() || null,
      });
      closeForm(); await loadAdvances();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save salary advance."); }
    finally { setIsSaving(false); }
  }

  function openRepay(adv: SalaryAdvance) {
    setSelected(adv); setRepayAmount(""); setRepayError(null);
  }

  async function handleRepay(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setRepayError(null); setIsRepaying(true);
    try {
      await api.post(`/salary-advances/${selected.id}/repay`, { amount: Number(repayAmount) });
      setSelected(null); await loadAdvances();
    } catch (err: any) { setRepayError(err.response?.data?.message ?? "Failed to record repayment."); }
    finally { setIsRepaying(false); }
  }

  async function handleCancel(adv: SalaryAdvance) {
    try {
      await api.put(`/salary-advances/${adv.id}`, { status: "CANCELLED" });
      await loadAdvances();
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to cancel advance."); }
  }

  const totalOutstanding = advances
    .filter((a) => a.status === "ACTIVE")
    .reduce((sum, a) => sum + Number(a.outstandingBalance), 0);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Salary Advances</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {advances.length} record{advances.length !== 1 ? "s" : ""}
            {statusFilter === "ACTIVE" && ` — ${fmtMoney(totalOutstanding)} outstanding`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="FULLY_REPAID">Fully Repaid</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button onClick={openCreate} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
            + Record Advance
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {showForm && (
        <Modal title="Record Salary Advance" onClose={closeForm} widthClass="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Employee *</label>
              <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Type *</label>
              <select value={form.advanceType} onChange={(e) => setForm({ ...form, advanceType: e.target.value as "CURRENT_PERIOD" | "LOAN" })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="CURRENT_PERIOD">Early payment of this period's wages</option>
                <option value="LOAN">Loan — repaid over several months</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {form.advanceType === "CURRENT_PERIOD"
                  ? "Use this when someone is paid directly before payroll runs — it's automatically netted off that period's payroll so they aren't shown as unpaid."
                  : "Use this for a genuine loan against future pay, repaid in installments over the months below."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Date *</label>
                <input required type="date" value={form.advanceDate} onChange={(e) => setForm({ ...form, advanceDate: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-700 block mb-1">Amount (ZMW) *</label>
                <input required type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            </div>
            {form.advanceType === "LOAN" && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Repayment Period (months) *</label>
                <input required type="number" min={1} value={form.repaymentMonths} onChange={(e) => setForm({ ...form, repaymentMonths: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Reason</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Approved By</label>
              <input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            </div>
            <p className="text-xs text-gray-400">Only one active advance is allowed per employee at a time.</p>
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

      {selected && (
        <Modal title={`Record Repayment — ${selected.employee?.fullName ?? ""}`} onClose={() => setSelected(null)} widthClass="max-w-sm">
          <form onSubmit={handleRepay} className="space-y-4">
            {repayError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{repayError}</div>}
            <p className="text-xs text-gray-500">Outstanding balance: <span className="font-medium text-gray-800">{fmtMoney(selected.outstandingBalance)}</span></p>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Repayment Amount (ZMW) *</label>
              <input required type="number" min={0.01} step="0.01" max={Number(selected.outstandingBalance)}
                value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isRepaying}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isRepaying ? "Saving..." : "Record"}
              </button>
              <button type="button" onClick={() => setSelected(null)} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-400">Loading...</div>
        ) : advances.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">No salary advances recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-right px-4 py-3">Repaid</th>
                <th className="text-right px-4 py-3">Outstanding</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {advances.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.advanceDate)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.employee?.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{ADVANCE_TYPE_LABEL[a.advanceType] ?? a.advanceType}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(a.amount)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmtMoney(a.amountRepaid)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(a.outstandingBalance)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[a.status]}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === "ACTIVE" && (
                      <div className="flex justify-end gap-3 items-center">
                        {a.advanceType === "LOAN" ? (
                          <button onClick={() => openRepay(a)} className="text-xs text-green-600 hover:underline">Record Repayment</button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Settles automatically in payroll</span>
                        )}
                        <button onClick={() => handleCancel(a)} className="text-xs text-red-500 hover:underline">Cancel</button>
                      </div>
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
