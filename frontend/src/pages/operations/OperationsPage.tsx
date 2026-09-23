import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import api from "../../api/client";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

interface SiteLite {
  id: string;
  siteName: string;
}
interface ShiftTypeLite {
  id: string;
  name: string;
  isActive: boolean;
}

interface OperationsRecord {
  id: string;
  date: string;
  reviewStatus: ReviewStatus;
  site?: { id: string; siteName: string };
  shiftType?: { id: string; name: string };
  siteIssues: string | null;
  incidents: string | null;
  operationalReport: string | null;
  notes: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  coveragePercent: number | null;
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const styles: Record<ReviewStatus, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  return (
    <span className={"text-xs font-medium px-2 py-1 rounded-full " + styles[status]}>
      {status}
    </span>
  );
}

function CoverageBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-gray-400">—</span>;
  const color =
    percent >= 100 ? "text-green-700" : percent >= 75 ? "text-yellow-700" : "text-red-700";
  return <span className={"font-medium " + color}>{percent}%</span>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

const EMPTY_FORM = {
  siteId: "",
  shiftTypeId: "",
  date: "",
  siteIssues: "",
  incidents: "",
  operationalReport: "",
  notes: "",
  submittedBy: "",
};

interface OperationModalProps {
  sites: SiteLite[];
  shiftTypes: ShiftTypeLite[];
  form: typeof EMPTY_FORM;
  setForm: (form: typeof EMPTY_FORM) => void;
  formError: string | null;
  isSaving: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

function OperationModal({
  sites,
  shiftTypes,
  form,
  setForm,
  formError,
  isSaving,
  onSubmit,
  onClose,
}: OperationModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">New Operations Record</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit}>
          <div className="px-6 py-5 space-y-4 max-h-[90vh] overflow-y-auto">
            {formError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Site *</label>
                <select
                  required
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">Select a site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Shift Type *</label>
                <select
                  required
                  value={form.shiftTypeId}
                  onChange={(e) => setForm({ ...form, shiftTypeId: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">Select a shift type...</option>
                  {shiftTypes.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Date *</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Site Issues</label>
              <textarea
                value={form.siteIssues}
                onChange={(e) => setForm({ ...form, siteIssues: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Incidents</label>
              <textarea
                value={form.incidents}
                onChange={(e) => setForm({ ...form, incidents: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Operational Report</label>
              <textarea
                value={form.operationalReport}
                onChange={(e) => setForm({ ...form, operationalReport: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Submitted By</label>
              <input
                value={form.submittedBy}
                onChange={(e) => setForm({ ...form, submittedBy: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OperationsPage() {
  const [records, setRecords] = useState<OperationsRecord[]>([]);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "">("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reviewer name typed once, reused for every review action in this
  // session - the backend requires reviewedBy as free text (no real
  // Users-linked reviewer field on this model yet).
  const [reviewerName, setReviewerName] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function loadRecords() {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.reviewStatus = statusFilter;
      const res = await api.get("/operations", { params });
      setRecords(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load operations records.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLookups() {
    try {
      const [sitesRes, shiftTypesRes] = await Promise.all([
        api.get("/sites", { params: { pageSize: 100 } }),
        api.get("/shift-types"),
      ]);
      setSites(sitesRes.data.data);
      setShiftTypes(shiftTypesRes.data.data.filter((st: ShiftTypeLite) => st.isActive));
    } catch {
      // Non-fatal - the create form will just show empty dropdowns, and
      // the list itself already loaded (or errored) independently.
    }
  }

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreateForm(true);
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    const payload = {
      siteId: form.siteId,
      shiftTypeId: form.shiftTypeId,
      date: form.date,
      siteIssues: form.siteIssues.trim() || null,
      incidents: form.incidents.trim() || null,
      operationalReport: form.operationalReport.trim() || null,
      notes: form.notes.trim() || null,
      submittedBy: form.submittedBy.trim() || null,
    };

    try {
      await api.post("/operations", payload);
      setShowCreateForm(false);
      await loadRecords();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to create operations record.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReview(record: OperationsRecord, decision: "APPROVED" | "REJECTED") {
    if (!reviewerName.trim()) {
      setReviewError("Enter your name above before reviewing.");
      return;
    }
    setReviewError(null);
    setReviewingId(record.id);
    try {
      await api.post(`/operations/${record.id}/review`, {
        reviewStatus: decision,
        reviewedBy: reviewerName.trim(),
      });
      await loadRecords();
    } catch (err: any) {
      setReviewError(err.response?.data?.message ?? "Failed to submit review.");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <>
      {showCreateForm && (
        <OperationModal
          sites={sites}
          shiftTypes={shiftTypes}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateForm(false)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Operations Records</h1>
            <p className="text-sm text-gray-500 mt-1">{records.length} record(s)</p>
          </div>
          <button
            onClick={openCreateForm}
            className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700"
          >
            + New Operations Record
          </button>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            {(["", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={
                  "text-sm px-3 py-1.5 rounded border " +
                  (statusFilter === s
                    ? "bg-green-600 text-white border-green-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100")
                }
              >
                {s === "" ? "All" : s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-sm text-gray-600">Reviewing as:</label>
            <input
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Your name"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        {reviewError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {reviewError}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading...</div>
          ) : records.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No operations records found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Site</th>
                  <th className="text-left px-4 py-3">Shift</th>
                  <th className="text-left px-4 py-3">Coverage</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-gray-900 font-medium">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.site?.siteName ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.shiftType?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <CoverageBadge percent={r.coveragePercent} />
                    </td>
                    <td className="px-4 py-3">
                      <ReviewBadge status={r.reviewStatus} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {r.reviewStatus === "PENDING" ? (
                        <>
                          <button
                            disabled={reviewingId === r.id}
                            onClick={() => handleReview(r, "APPROVED")}
                            className="text-green-600 hover:underline disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={reviewingId === r.id}
                            onClick={() => handleReview(r, "REJECTED")}
                            className="text-red-600 hover:underline disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          {r.reviewStatus === "APPROVED" ? "Approved" : "Rejected"}
                          {r.reviewedBy ? ` by ${r.reviewedBy}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
