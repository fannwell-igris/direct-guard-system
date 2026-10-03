import { useEffect, useState, useCallback, FormEvent } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import api from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

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
const STATUSES   = ["PENDING", "APPROVED", "REJECTED", "FULFILLED"];

// ─── Style helpers ────────────────────────────────────────────────────────────

function priorityClass(p: string) {
  switch (p) {
    case "CRITICAL": return "bg-red-100 text-red-700 border-red-200";
    case "URGENT":   return "bg-orange-100 text-orange-700 border-orange-200";
    case "HIGH":     return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "NORMAL":   return "bg-blue-100 text-blue-700 border-blue-200";
    default:         return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function statusClass(s: string) {
  switch (s) {
    case "APPROVED":  return "bg-green-100 text-green-700 border-green-200";
    case "FULFILLED": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "REJECTED":  return "bg-red-100 text-red-700 border-red-200";
    default:          return "bg-amber-100 text-amber-700 border-amber-200";
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "APPROVED" || status === "FULFILLED")
    return <CheckCircle size={13} className="text-green-500 shrink-0" />;
  if (status === "REJECTED")
    return <XCircle size={13} className="text-red-500 shrink-0" />;
  return <AlertCircle size={13} className="text-amber-500 shrink-0" />;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

function fmtDateTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtTimeOnly(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/** Human-readable response time: "2h 35m", "3d 2h", etc. */
function responseTime(createdIso: string, reviewedIso: string | null): string | null {
  if (!reviewedIso) return null;
  const diff = new Date(reviewedIso).getTime() - new Date(createdIso).getTime();
  if (diff < 0) return null;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days >= 1)  return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

// ─── Grouping helpers ─────────────────────────────────────────────────────────

function dayKey(iso: string)   { return iso.slice(0, 10); }
function monthKey(iso: string) { return iso.slice(0, 7); }

function dayLabel(key: string) {
  const d = new Date(key + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime())     return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

function weekKey(iso: string) {
  const d = new Date(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function weekLabel(key: string) {
  const [year, w] = key.split("-W");
  const d = new Date(Number(year), 0, 1 + (Number(w) - 1) * 7);
  const end = new Date(d); end.setDate(d.getDate() + 6);
  return (
    "Week of " +
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " – " +
    end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  );
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

interface Group { key: string; label: string; requests: DepartmentRequest[]; }

function buildGroups(requests: DepartmentRequest[]): Group[] {
  if (requests.length === 0) return [];
  const sorted = [...requests].sort(
    (a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
  );
  const oldest = sorted[sorted.length - 1];
  const ageDays = (Date.now() - new Date(oldest.dateCreated).getTime()) / 86400000;
  const level: "day" | "week" | "month" = ageDays <= 7 ? "day" : ageDays <= 28 ? "week" : "month";

  const map = new Map<string, DepartmentRequest[]>();
  for (const r of sorted) {
    const k = level === "day" ? dayKey(r.dateCreated)
            : level === "week" ? weekKey(r.dateCreated)
            : monthKey(r.dateCreated);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries()).map(([key, reqs]) => ({
    key,
    label: level === "day" ? dayLabel(key) : level === "week" ? weekLabel(key) : monthLabel(key),
    requests: reqs,
  }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DepartmentRequestsPage() {
  const [requests,    setRequests]    = useState<DepartmentRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter,   setDeptFilter]   = useState("");

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const [editingId,  setEditingId]  = useState<string | "new" | null>(null);
  const [form,       setForm]       = useState<RequestFormState>(EMPTY_FORM);
  const [formError,  setFormError]  = useState<string | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<DepartmentRequest | null>(null);
  const [reviewBy,        setReviewBy]        = useState("");
  const [isReviewing,     setIsReviewing]     = useState(false);
  const [reviewError,     setReviewError]     = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "200" };
      if (statusFilter) params.status = statusFilter;
      if (deptFilter)   params.departmentId = deptFilter;
      const res = await api.get("/department-requests", { params });
      setRequests(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load requests.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, deptFilter]);

  useEffect(() => {
    loadRequests();
    api.get("/departments", { params: { pageSize: 100 } })
      .then((r) => setDepartments(r.data.data))
      .catch(() => {});
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
      departmentId:  form.departmentId,
      title:         form.title.trim(),
      description:   form.description.trim() || null,
      priority:      form.priority,
      submittedBy:   form.submittedBy.trim() || null,
      estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
      notes:         form.notes.trim() || null,
    };
    try {
      if (editingId === "new") await api.post("/department-requests", payload);
      else if (editingId)      await api.put(`/department-requests/${editingId}`, payload);
      setEditingId(null);
      await loadRequests();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReview(status: "APPROVED" | "REJECTED") {
    if (!selectedRequest) return;
    setReviewError(null); setIsReviewing(true);
    try {
      await api.put(`/department-requests/${selectedRequest.id}`, {
        status, reviewedBy: reviewBy.trim() || null,
      });
      await openDetail(selectedRequest);
      await loadRequests();
    } catch (err: any) {
      setReviewError(err.response?.data?.message ?? "Failed.");
    } finally {
      setIsReviewing(false);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING").length;
  const groups  = buildGroups(requests);

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Department Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {requests.length} total
            {pending > 0 && (
              <span className="ml-2 text-amber-600 font-medium">· {pending} pending review</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setFormError(null); setEditingId("new"); setSelectedRequest(null); }}
          className="btn-primary"
        >
          <Plus size={15} /> New Request
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input w-auto">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={loadRequests} className="btn-secondary">Filter</button>
      </div>

      {/* ── New / Edit form ── */}
      {editingId && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {editingId === "new" ? "New Request" : "Edit Request"}
            </h2>
            <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Department *</label>
              <select required value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Priority</label>
              <select value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Title *</label>
            <input required value={form.title} placeholder="What is being requested?"
              onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
            <textarea value={form.description} rows={2} placeholder="Additional details…"
              onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Submitted By</label>
              <input value={form.submittedBy} placeholder="Your name"
                onChange={(e) => setForm({ ...form, submittedBy: e.target.value })} className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Estimated Cost (K)</label>
              <input type="number" min="0" step="0.01" value={form.estimatedCost} placeholder="0.00"
                onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* ── Main area: grouped list + detail panel ── */}
      <div className="flex gap-4 items-start">

        {/* Grouped request list */}
        <div className="flex-1 min-w-0 space-y-3">
          {isLoading ? (
            <div className="card p-6 text-sm text-gray-400">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="card p-6 text-sm text-gray-400">No requests found.</div>
          ) : groups.map((group) => {
            const isCollapsed   = collapsed.has(group.key);
            const pendingInGroup = group.requests.filter((r) => r.status === "PENDING").length;

            return (
              <div key={group.key} className="card overflow-hidden">

                {/* Group header row */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100 text-left"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed
                      ? <ChevronRight size={14} className="text-gray-400" />
                      : <ChevronDown  size={14} className="text-gray-400" />}
                    <span className="text-sm font-semibold text-gray-700">{group.label}</span>
                    <span className="text-xs text-gray-400">
                      {group.requests.length} request{group.requests.length !== 1 ? "s" : ""}
                    </span>
                    {pendingInGroup > 0 && (
                      <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                        {pendingInGroup} pending
                      </span>
                    )}
                  </div>
                </button>

                {/* Rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-50">

                    {/* Column headers */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-white">
                      <span>Request</span>
                      <span className="text-center">Priority</span>
                      <span className="text-center">Status</span>
                      <span className="text-right">Requested</span>
                      <span className="text-right">Attended To</span>
                      <span className="text-right">Response</span>
                    </div>

                    {group.requests.map((req) => {
                      const rt = responseTime(req.dateCreated, req.reviewedAt);
                      const isSelected = selectedRequest?.id === req.id;

                      return (
                        <div
                          key={req.id}
                          onClick={() => openDetail(req)}
                          className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 gap-y-1 px-4 py-3 items-center cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-green-50 border-l-[3px] border-l-magen-green"
                              : "hover:bg-gray-50 border-l-[3px] border-l-transparent"
                          }`}
                        >
                          {/* Title + submitter + dept */}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {req.submittedBy ? `By ${req.submittedBy}` : ""}
                              {req.submittedBy && req.department?.name ? " · " : ""}
                              {req.department?.name ?? ""}
                            </p>
                          </div>

                          {/* Priority badge */}
                          <span className={`hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${priorityClass(req.priority)}`}>
                            {req.priority}
                          </span>

                          {/* Status badge */}
                          <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusClass(req.status)}`}>
                            <StatusIcon status={req.status} />
                            {req.status}
                          </span>

                          {/* Requested */}
                          <div className="hidden sm:block text-right text-xs whitespace-nowrap">
                            <span className="text-gray-700 font-medium">{fmtTimeOnly(req.dateCreated)}</span>
                            <br />
                            <span className="text-gray-400">{fmtDateShort(req.dateCreated)}</span>
                          </div>

                          {/* Attended to */}
                          <div className="hidden sm:block text-right text-xs whitespace-nowrap">
                            {req.reviewedAt ? (
                              <>
                                <span className="text-gray-700 font-medium">{fmtTimeOnly(req.reviewedAt)}</span>
                                <br />
                                <span className="text-gray-400">{fmtDateShort(req.reviewedAt)}</span>
                              </>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </div>

                          {/* Response time */}
                          <div className="hidden sm:block text-right text-xs whitespace-nowrap">
                            {rt ? (
                              <span className={`font-semibold ${
                                rt.startsWith("0") || rt.endsWith("m")
                                  ? "text-emerald-600"
                                  : rt.includes("d") ? "text-red-500"
                                  : "text-emerald-600"
                              }`}>
                                {rt}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>

                          {/* Mobile: show badges inline */}
                          <div className="flex sm:hidden gap-2 flex-wrap mt-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${priorityClass(req.priority)}`}>{req.priority}</span>
                            <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full border ${statusClass(req.status)}`}>
                              <StatusIcon status={req.status} />{req.status}
                            </span>
                            {rt && <span className="text-xs font-medium text-emerald-600">{rt}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Detail panel ── */}
        {selectedRequest && (
          <div className="w-80 shrink-0 card p-5 space-y-4 self-start sticky top-4">

            {/* Panel header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{selectedRequest.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedRequest.department?.name}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
                <X size={15} />
              </button>
            </div>

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${statusClass(selectedRequest.status)}`}>
                <StatusIcon status={selectedRequest.status} />
                {selectedRequest.status}
              </span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${priorityClass(selectedRequest.priority)}`}>
                {selectedRequest.priority}
              </span>
            </div>

            {/* Timeline block */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={11} /> Timeline
                </p>
              </div>
              <div className="divide-y divide-gray-50 text-xs">
                <div className="flex justify-between items-start px-3 py-2.5 gap-2">
                  <span className="text-gray-500 shrink-0">Requested</span>
                  <span className="text-gray-800 font-medium text-right">{fmtDateTime(selectedRequest.dateCreated)}</span>
                </div>
                <div className="flex justify-between items-start px-3 py-2.5 gap-2">
                  <span className="text-gray-500 shrink-0">Attended to</span>
                  <span className="text-right">
                    {selectedRequest.reviewedAt
                      ? <span className="text-gray-800 font-medium">{fmtDateTime(selectedRequest.reviewedAt)}</span>
                      : <span className="text-gray-300 italic">Not yet</span>}
                  </span>
                </div>
                {responseTime(selectedRequest.dateCreated, selectedRequest.reviewedAt) && (
                  <div className="flex justify-between items-center px-3 py-2.5 bg-emerald-50 gap-2">
                    <span className="text-gray-500 shrink-0">Response time</span>
                    <span className="font-bold text-emerald-600">
                      {responseTime(selectedRequest.dateCreated, selectedRequest.reviewedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Meta fields */}
            <div className="space-y-1.5 text-xs">
              {selectedRequest.estimatedCost && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Est. Cost</span>
                  <span className="font-medium text-gray-800">{fmt(selectedRequest.estimatedCost)}</span>
                </div>
              )}
              {selectedRequest.submittedBy && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Submitted by</span>
                  <span className="text-gray-800">{selectedRequest.submittedBy}</span>
                </div>
              )}
              {selectedRequest.reviewedBy && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Reviewed by</span>
                  <span className="text-gray-800">{selectedRequest.reviewedBy}</span>
                </div>
              )}
            </div>

            {/* Description */}
            {selectedRequest.description && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-600 leading-relaxed">
                {selectedRequest.description}
              </div>
            )}

            {/* Notes */}
            {selectedRequest.notes && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-xs text-gray-600">{selectedRequest.notes}</p>
              </div>
            )}

            {/* Linked expenses */}
            {selectedRequest.generalExpenses && selectedRequest.generalExpenses.length > 0 && (
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Linked Expenses</p>
                {selectedRequest.generalExpenses.map((exp) => (
                  <div key={exp.id} className="flex justify-between text-xs gap-2">
                    <span className="text-gray-500 truncate">{exp.category}</span>
                    <span className="font-medium text-emerald-600 shrink-0">{fmt(exp.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Edit button */}
            {["PENDING", "APPROVED"].includes(selectedRequest.status) && (
              <button
                onClick={() => {
                  setForm({
                    departmentId:  selectedRequest.departmentId,
                    title:         selectedRequest.title,
                    description:   selectedRequest.description ?? "",
                    priority:      selectedRequest.priority,
                    submittedBy:   selectedRequest.submittedBy ?? "",
                    estimatedCost: selectedRequest.estimatedCost ?? "",
                    notes:         selectedRequest.notes ?? "",
                  });
                  setFormError(null);
                  setEditingId(selectedRequest.id);
                  setSelectedRequest(null);
                }}
                className="btn-secondary w-full text-xs"
              >
                Edit Request
              </button>
            )}

            {/* Review section */}
            {selectedRequest.status === "PENDING" && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Review this request</p>
                {reviewError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">{reviewError}</p>
                )}
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Reviewed by</label>
                  <input value={reviewBy} placeholder="Your name"
                    onChange={(e) => setReviewBy(e.target.value)} className="input text-xs" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReview("APPROVED")}
                    disabled={isReviewing}
                    className="flex-1 text-xs bg-emerald-600 text-white rounded-lg px-3 py-2 font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {isReviewing ? "…" : "✓ Approve"}
                  </button>
                  <button
                    onClick={() => handleReview("REJECTED")}
                    disabled={isReviewing}
                    className="flex-1 text-xs bg-red-500 text-white rounded-lg px-3 py-2 font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
                  >
                    {isReviewing ? "…" : "✕ Reject"}
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
