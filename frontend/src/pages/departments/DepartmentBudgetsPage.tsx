import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";

type BudgetStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "RETURNED" | "REJECTED";

interface Department { id: string; name: string; }

interface BudgetLine {
  id?: string;
  category: string;
  plannedAmount: number | string;
  description?: string | null;
  actual?: number;
  remaining?: number;
  percentSpent?: number | null;
  warning?: "OK" | "APPROACHING" | "OVER";
}

interface BudgetListRow {
  id: string;
  departmentId: string;
  department?: { id: string; name: string } | null;
  month: number;
  year: number;
  status: BudgetStatus;
  totalPlanned: number;
  preparedBy: string | null;
  submittedAt: string | null;
}

interface BudgetDetail extends BudgetListRow {
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  lines: BudgetLine[];
  figures: {
    totalPlanned: number;
    totalActual: number;
    totalRemaining: number;
    totalPercentSpent: number | null;
    warning: "OK" | "APPROACHING" | "OVER";
    requested: number;
    committed: number;
  };
}

const FINANCE_MANAGEMENT_ROLES = ["ADMIN", "MANAGER", "PAYROLL"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_BADGE: Record<BudgetStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  RETURNED: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700",
};

const WARNING_BADGE: Record<string, string> = {
  OK: "text-green-600",
  APPROACHING: "text-amber-600",
  OVER: "text-red-600",
};

const EDITABLE_STATUSES: BudgetStatus[] = ["DRAFT", "RETURNED"];

function fmt(n: number | string) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

const EMPTY_LINE = (): BudgetLine => ({ category: "", plannedAmount: "", description: "" });

export default function DepartmentBudgetsPage() {
  const { user } = useAuth();
  const isFinance = !!user && FINANCE_MANAGEMENT_ROLES.includes(user.role);

  const now = new Date();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilter, setDeptFilter] = useState(isFinance ? "" : user?.departmentId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [budgets, setBudgets] = useState<BudgetListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Company summary (Finance/Management only)
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1);
  const [summaryYear, setSummaryYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<any | null>(null);

  // Create/edit form
  const [editing, setEditing] = useState<"new" | BudgetDetail | null>(null);
  const [form, setForm] = useState({
    departmentId: isFinance ? "" : user?.departmentId ?? "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    preparedBy: "",
    notes: "",
    lines: [EMPTY_LINE()],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel
  const [detail, setDetail] = useState<BudgetDetail | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function loadBudgets() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "100" };
      if (deptFilter) params.departmentId = deptFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/department-budgets", { params });
      setBudgets(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load budgets."); }
    finally { setIsLoading(false); }
  }

  async function loadSummary() {
    if (!isFinance) return;
    try {
      const res = await api.get("/department-budgets/summary", { params: { month: summaryMonth, year: summaryYear } });
      setSummary(res.data.data);
    } catch { setSummary(null); }
  }

  useEffect(() => {
    api.get("/departments", { params: { pageSize: 100 } }).then((r) => setDepartments(r.data.data)).catch(() => {});
  }, []);
  useEffect(() => { loadBudgets(); /* eslint-disable-next-line */ }, [deptFilter, statusFilter]);
  useEffect(() => { loadSummary(); /* eslint-disable-next-line */ }, [summaryMonth, summaryYear, isFinance]);

  const myDepartmentName = useMemo(
    () => departments.find((d) => d.id === user?.departmentId)?.name,
    [departments, user?.departmentId]
  );

  function openCreate() {
    setForm({
      departmentId: isFinance ? "" : user?.departmentId ?? "",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      preparedBy: "",
      notes: "",
      lines: [EMPTY_LINE()],
    });
    setFormError(null);
    setEditing("new");
  }

  function openEdit(b: BudgetDetail) {
    setForm({
      departmentId: b.departmentId,
      month: b.month,
      year: b.year,
      preparedBy: b.preparedBy ?? "",
      notes: b.notes ?? "",
      lines: b.lines.length > 0 ? b.lines.map((l) => ({ ...l })) : [EMPTY_LINE()],
    });
    setFormError(null);
    setEditing(b);
  }

  async function openDetail(id: string) {
    try {
      const res = await api.get(`/department-budgets/${id}`);
      setDetail(res.data.data);
      setReviewComment(""); setReviewError(null);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load budget detail."); }
  }

  function updateLine(idx: number, patch: Partial<BudgetLine>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  }
  function addLine() { setForm((f) => ({ ...f, lines: [...f.lines, EMPTY_LINE()] })); }
  function removeLine(idx: number) { setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) })); }

  const lineTotal = form.lines.reduce((s, l) => s + (Number(l.plannedAmount) || 0), 0);

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const lines = form.lines
      .filter((l) => l.category.trim())
      .map((l) => ({ category: l.category.trim(), plannedAmount: Number(l.plannedAmount) || 0, description: l.description?.trim() || null }));
    try {
      if (editing === "new") {
        await api.post("/department-budgets", {
          departmentId: form.departmentId, month: form.month, year: form.year,
          preparedBy: form.preparedBy.trim() || null, notes: form.notes.trim() || null, lines,
        });
      } else if (editing) {
        await api.put(`/department-budgets/${editing.id}`, {
          preparedBy: form.preparedBy.trim() || null, notes: form.notes.trim() || null, lines,
        });
      }
      setEditing(null);
      await loadBudgets();
      if (detail && editing !== "new" && editing) await openDetail(editing.id);
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save budget."); }
    finally { setIsSaving(false); }
  }

  async function handleSubmitBudget(id: string) {
    setError(null);
    try {
      await api.patch(`/department-budgets/${id}/submit`);
      await openDetail(id);
      await loadBudgets();
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to submit budget."); }
  }

  async function handleReview(status: "UNDER_REVIEW" | "APPROVED" | "RETURNED" | "REJECTED") {
    if (!detail) return;
    setReviewError(null); setIsReviewing(true);
    try {
      await api.patch(`/department-budgets/${detail.id}/review`, { status, reviewComment: reviewComment.trim() || null });
      await openDetail(detail.id);
      await loadBudgets();
      await loadSummary();
    } catch (err: any) { setReviewError(err.response?.data?.message ?? "Failed to review budget."); }
    finally { setIsReviewing(false); }
  }

  async function handleCopyForward(id: string) {
    setError(null);
    try {
      const res = await api.post(`/department-budgets/${id}/copy-forward`);
      await loadBudgets();
      await openDetail(res.data.data.id);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to copy budget forward."); }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Department Budgets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isFinance ? "Company-wide budget planning, review and budget vs actual." : `${myDepartmentName ?? "Your department"}'s monthly budgets.`}
          </p>
        </div>
        <button onClick={openCreate} className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + New Budget
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Finance company summary */}
      {isFinance && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Company Budget Summary</h2>
            <div className="flex gap-2">
              <select value={summaryMonth} onChange={(e) => setSummaryMonth(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={summaryYear} onChange={(e) => setSummaryYear(Number(e.target.value))}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          {summary && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Company Planned</p>
                  <p className="text-lg font-semibold text-gray-900">{fmt(summary.companyTotalPlanned)}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Company Actual</p>
                  <p className="text-lg font-semibold text-gray-900">{fmt(summary.companyTotalActual)}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Submitted</p>
                  <p className="text-lg font-semibold text-blue-600">{summary.statusCounts.SUBMITTED + summary.statusCounts.UNDER_REVIEW}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500">Approved</p>
                  <p className="text-lg font-semibold text-green-600">{summary.statusCounts.APPROVED}</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs uppercase">
                  <tr><th className="text-left py-1">Department</th><th className="text-left py-1">Status</th><th className="text-right py-1">Planned</th><th className="text-right py-1">Actual</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.departments.map((d: any) => (
                    <tr key={d.departmentId}>
                      <td className="py-1.5">{d.departmentName}</td>
                      <td className="py-1.5">{d.status ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status as BudgetStatus]}`}>{d.status}</span> : <span className="text-xs text-gray-400">No budget</span>}</td>
                      <td className="py-1.5 text-right">{fmt(d.totalPlanned)}</td>
                      <td className="py-1.5 text-right">{fmt(d.totalActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {isFinance && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "RETURNED", "REJECTED"] as BudgetStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? <div className="p-6 text-sm text-gray-400">Loading...</div>
            : budgets.length === 0 ? <div className="p-6 text-sm text-gray-400">No budgets found.</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Period</th>
                    <th className="text-left px-4 py-3">Department</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Planned</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {budgets.map((b) => (
                    <tr key={b.id} className={detail?.id === b.id ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(b.id)} className="font-medium text-green-600 hover:underline">
                          {MONTH_NAMES[b.month - 1]} {b.year}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{b.department?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{fmt(b.totalPlanned)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openDetail(b.id)} className="text-xs text-gray-500 hover:underline">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="w-96 shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3 self-start">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{MONTH_NAMES[detail.month - 1]} {detail.year}</h3>
                <p className="text-xs text-gray-400">{detail.department?.name}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>

            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>

            <div className="text-xs space-y-1 text-gray-500 border-t pt-2">
              <div className="flex justify-between"><span>Planned</span><span className="font-medium text-gray-800">{fmt(detail.figures.totalPlanned)}</span></div>
              <div className="flex justify-between"><span>Actual Spent</span><span className={`font-medium ${WARNING_BADGE[detail.figures.warning]}`}>{fmt(detail.figures.totalActual)}</span></div>
              <div className="flex justify-between"><span>Remaining</span><span className="font-medium text-gray-800">{fmt(detail.figures.totalRemaining)}</span></div>
              {detail.figures.totalPercentSpent !== null && <div className="flex justify-between"><span>% Used</span><span className={`font-medium ${WARNING_BADGE[detail.figures.warning]}`}>{detail.figures.totalPercentSpent}%</span></div>}
              <div className="flex justify-between"><span>Requested (pending)</span><span className="text-gray-700">{fmt(detail.figures.requested)}</span></div>
              <div className="flex justify-between"><span>Committed (approved)</span><span className="text-gray-700">{fmt(detail.figures.committed)}</span></div>
            </div>

            {/* Lines */}
            <div className="border-t pt-2 space-y-1.5">
              <p className="text-xs font-medium text-gray-700">Budget Lines</p>
              {detail.lines.map((l, i) => (
                <div key={l.id ?? i} className="text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{l.category}</span>
                    <span className={`font-medium ${l.warning ? WARNING_BADGE[l.warning] : ""}`}>{fmt(l.plannedAmount)}</span>
                  </div>
                  {l.actual !== undefined && (
                    <div className="flex justify-between text-gray-400">
                      <span>Spent {fmt(l.actual)} · Remaining {fmt(l.remaining ?? 0)}</span>
                      {l.percentSpent !== null && l.percentSpent !== undefined && <span>{l.percentSpent}%</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {detail.notes && <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{detail.notes}</div>}
            {detail.reviewComment && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                <p className="font-medium text-amber-800">Finance comment</p>
                <p className="text-amber-700">{detail.reviewComment}</p>
                {detail.reviewedBy && <p className="text-amber-500 mt-0.5">— {detail.reviewedBy}</p>}
              </div>
            )}

            {/* Department actions */}
            <div className="border-t pt-3 flex flex-wrap gap-2">
              {EDITABLE_STATUSES.includes(detail.status) && (
                <>
                  <button onClick={() => openEdit(detail)} className="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100">Edit</button>
                  <button onClick={() => handleSubmitBudget(detail.id)} className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700">Submit to Finance</button>
                </>
              )}
              <button onClick={() => handleCopyForward(detail.id)} className="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100">Copy to Next Month</button>
            </div>

            {/* Finance review actions */}
            {isFinance && (detail.status === "SUBMITTED" || detail.status === "UNDER_REVIEW") && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">Review this budget</p>
                {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2}
                  placeholder="Comment (visible to the department)"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  {detail.status === "SUBMITTED" && (
                    <button onClick={() => handleReview("UNDER_REVIEW")} disabled={isReviewing}
                      className="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100 disabled:opacity-60">Mark Under Review</button>
                  )}
                  <button onClick={() => handleReview("APPROVED")} disabled={isReviewing}
                    className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 disabled:opacity-60">Approve</button>
                  <button onClick={() => handleReview("RETURNED")} disabled={isReviewing}
                    className="text-xs bg-orange-500 text-white rounded px-3 py-1.5 hover:bg-orange-600 disabled:opacity-60">Return for Revision</button>
                  <button onClick={() => handleReview("REJECTED")} disabled={isReviewing}
                    className="text-xs bg-red-500 text-white rounded px-3 py-1.5 hover:bg-red-600 disabled:opacity-60">Reject</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit form */}
      {editing && (
        <Modal title={editing === "new" ? "New Department Budget" : "Edit Budget"} onClose={() => setEditing(null)} widthClass="max-w-2xl">
          <form onSubmit={handleSubmitForm} className="space-y-4">
            {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}

            {editing === "new" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="text-xs font-medium text-gray-700 block mb-1">Department *</label>
                  {isFinance ? (
                    <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                      <option value="">Select…</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  ) : (
                    <input disabled value={myDepartmentName ?? "Your department"} className="w-full border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-500" />
                  )}
                </div>
                <div><label className="text-xs font-medium text-gray-700 block mb-1">Month *</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select></div>
                <div><label className="text-xs font-medium text-gray-700 block mb-1">Year *</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
              </div>
            )}

            <div><label className="text-xs font-medium text-gray-700 block mb-1">Prepared By</label>
              <input value={form.preparedBy} onChange={(e) => setForm({ ...form, preparedBy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Your name" /></div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Budget Lines *</label>
                <button type="button" onClick={addLine} className="text-xs text-green-600 hover:underline">+ Add line</button>
              </div>
              {form.lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input required placeholder="Category (e.g. Transport/Fuel)" value={l.category}
                    onChange={(e) => updateLine(i, { category: e.target.value })}
                    className="flex-[2] border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  <input required type="number" min={0} step="0.01" placeholder="Amount" value={l.plannedAmount}
                    onChange={(e) => updateLine(i, { plannedAmount: e.target.value })}
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Description" value={l.description ?? ""}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="flex-[2] border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  <button type="button" onClick={() => removeLine(i)} className="text-red-500 text-xs px-2 py-1.5 hover:bg-red-50 rounded">✕</button>
                </div>
              ))}
              <div className="flex justify-end text-sm font-semibold text-gray-800">Total: {fmt(lineTotal)}</div>
            </div>

            <div><label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
              <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>

            <div className="flex gap-2">
              <button type="submit" disabled={isSaving}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
