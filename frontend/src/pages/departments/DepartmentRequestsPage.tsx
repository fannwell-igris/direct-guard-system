import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface Department { id: string; name: string; }

interface DepartmentRequest {
  id: string;
  departmentId: string;
  department?: { name: string } | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  estimatedCost: string | null;
  notes: string | null;
  dateCreated: string;
  generalExpenses?: { id: string; amount: string; expenseDate: string; category: string }[];
}

interface RequestFormState {
  departmentId: string;
  title: string;
  description: string;
  priority: string;
  submittedBy: string;
  estimatedCost: string;
  notes: string;
}

const EMPTY_FORM: RequestFormState = {
  departmentId: "", title: "", description: "",
  priority: "NORMAL", submittedBy: "", estimatedCost: "", notes: "",
};

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "FULFILLED"];

function priorityClass(p: string) {
  switch (p) {
    case "CRITICAL": return "bg-red-100 text-red-700";
    case "URGENT": return "bg-orange-100 text-orange-700";
    case "HIGH": return "bg-yellow-100 text-yellow-700";
    case "NORMAL": return "bg-green-100 text-green-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function statusClass(s: string) {
  switch (s) {
    case "APPROVED": return "bg-green-100 text-green-700";
    case "FULFILLED": return "bg-green-100 text-green-700";
    case "REJECTED": return "bg-red-100 text-red-700";
    default: return "bg-yellow-100 text-yellow-700";
  }
}

function fmt(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

export default function DepartmentRequestsPage() {
  const [requests, setRequests] = useState<DepartmentRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  // Form
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<RequestFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel
  const [selectedRequest, setSelectedRequest] = useState<DepartmentRequest | null>(null);
  const [reviewBy, setReviewBy] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function loadRequests() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (deptFilter) params.departmentId = deptFilter;
      const res = await api.get("/department-requests", { params });
      setRequests(res.data.data);
    } catch (err: any) { setError(err.response?.data?.message ?? "Failed to load requests."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadRequests();
    api.get("/departments", { params: { pageSize: 100 } }).then((r) => setDepartments(r.data.data)).catch(() => {});
  }, []);

  async function openDetail(req: DepartmentRequest) {
    try {
      const res = await api.get(`/department-requests/${req.id}`);
      setSelectedRequest(res.data.data);
      setReviewBy(""); setReviewError(null);
    } catch {}
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null); setIsSaving(true);
    const payload = {
      departmentId: form.departmentId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      submittedBy: form.submittedBy.trim() || null,
      estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId === "new") await api.post("/department-requests", payload);
      else if (editingId) await api.put(`/department-requests/${editingId}`, payload);
      setEditingId(null); await loadRequests();
    } catch (err: any) { setFormError(err.response?.data?.message ?? "Failed to save request."); }
    finally { setIsSaving(false); }
  }

  async function handleReview(status: "APPROVED" | "REJECTED") {
    if (!selectedRequest) return;
    setReviewError(null); setIsReviewing(true);
    try {
      await api.put(`/department-requests/${selectedRequest.id}`, { status, reviewedBy: reviewBy.trim() || null });
      await openDetail(selectedRequest);
      await loadRequests();
    } catch (err: any) { setReviewError(err.response?.data?.message ?? "Failed."); }
    finally { setIsReviewing(false); }
  }

  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Department Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {requests.length} total
            {pending > 0 && <span className="ml-2 text-amber-600 font-medium">· {pending} pending review</span>}
          </p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setEditingId("new"); setSelectedRequest(null); }}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700">
          + New Request
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={loadRequests} className="text-sm border border-gray-300 rounded px-3 py-2 hover:bg-gray-100">Filter</button>
      </div>

      {/* Form */}
      {editingId && (
        <Modal
          title={editingId === "new" ? "New Request" : "Edit Request"}
          onClose={() => setEditingId(null)}
          widthClass="max-w-2xl"
        >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Department *</label>
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div><label className="text-xs font-medium text-gray-700 block mb-1">Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          <div><label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
            <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Submitted By</label>
              <input value={form.submittedBy} placeholder="Your name" onChange={(e) => setForm({ ...form, submittedBy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Estimated Cost (K)</label>
              <input type="number" min="0" step="0.01" value={form.estimatedCost}
                onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          </div>
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
            : requests.length === 0 ? <div className="p-6 text-sm text-gray-400">No requests found.</div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Request</th>
                    <th className="text-left px-4 py-3">Department</th>
                    <th className="text-left px-4 py-3">Priority</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Est. Cost</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((req) => (
                    <tr key={req.id} className={selectedRequest?.id === req.id ? "bg-green-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(req)} className="font-medium text-green-600 hover:underline text-left">
                          {req.title}
                        </button>
                        {req.submittedBy && <p className="text-xs text-gray-400">By {req.submittedBy}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{req.department?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityClass(req.priority)}`}>{req.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(req.status)}`}>{req.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {req.estimatedCost ? fmt(req.estimatedCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {["PENDING", "APPROVED"].includes(req.status) && (
                          <button onClick={() => { setForm({ departmentId: req.departmentId, title: req.title, description: req.description ?? "", priority: req.priority, submittedBy: req.submittedBy ?? "", estimatedCost: req.estimatedCost ?? "", notes: req.notes ?? "" }); setFormError(null); setEditingId(req.id); setSelectedRequest(null); }}
                            className="text-green-600 hover:underline text-xs">Edit</button>
                        )}
                        <button onClick={() => openDetail(req)} className="text-gray-500 hover:underline text-xs">Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Detail panel */}
        {selectedRequest && (
          <div className="w-72 shrink-0 bg-white border border-gray-200 rounded-lg p-4 space-y-3 self-start">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{selectedRequest.title}</h3>
                <p className="text-xs text-gray-400">{selectedRequest.department?.name}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>

            <div className="text-xs space-y-1 text-gray-500">
              <div className="flex justify-between">
                <span>Status</span>
                <span className={`font-medium px-2 py-0.5 rounded-full ${statusClass(selectedRequest.status)}`}>{selectedRequest.status}</span>
              </div>
              <div className="flex justify-between"><span>Priority</span>
                <span className={`font-medium px-2 py-0.5 rounded-full ${priorityClass(selectedRequest.priority)}`}>{selectedRequest.priority}</span></div>
              {selectedRequest.estimatedCost && <div className="flex justify-between"><span>Est. Cost</span><span className="text-gray-700 font-medium">{fmt(selectedRequest.estimatedCost)}</span></div>}
              {selectedRequest.submittedBy && <div className="flex justify-between"><span>Submitted by</span><span className="text-gray-700">{selectedRequest.submittedBy}</span></div>}
              {selectedRequest.reviewedBy && <div className="flex justify-between"><span>Reviewed by</span><span className="text-gray-700">{selectedRequest.reviewedBy}</span></div>}
              {selectedRequest.reviewedAt && <div className="flex justify-between"><span>Reviewed</span><span className="text-gray-700">{new Date(selectedRequest.reviewedAt).toLocaleDateString("en-GB")}</span></div>}
            </div>

            {selectedRequest.description && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{selectedRequest.description}</div>
            )}

            {/* Linked expenses */}
            {selectedRequest.generalExpenses && selectedRequest.generalExpenses.length > 0 && (
              <div className="border-t pt-3 space-y-1">
                <p className="text-xs font-medium text-gray-500">Linked Expenses</p>
                {selectedRequest.generalExpenses.map((exp) => (
                  <div key={exp.id} className="flex justify-between text-xs">
                    <span className="text-gray-500">{exp.category}</span>
                    <span className="font-medium text-green-600">{fmt(exp.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Review actions */}
            {selectedRequest.status === "PENDING" && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">Review this request</p>
                {reviewError && <p className="text-xs text-red-600">{reviewError}</p>}
                <div><label className="text-xs text-gray-600 block mb-1">Reviewed by</label>
                  <input value={reviewBy} placeholder="Your name" onChange={(e) => setReviewBy(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
                <div className="flex gap-2">
                  <button onClick={() => handleReview("APPROVED")} disabled={isReviewing}
                    className="flex-1 text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 disabled:opacity-60">
                    {isReviewing ? "..." : "Approve"}
                  </button>
                  <button onClick={() => handleReview("REJECTED")} disabled={isReviewing}
                    className="flex-1 text-xs bg-red-500 text-white rounded px-3 py-1.5 hover:bg-red-600 disabled:opacity-60">
                    {isReviewing ? "..." : "Reject"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

