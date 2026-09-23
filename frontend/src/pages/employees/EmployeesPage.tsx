import { useEffect, useState, useRef, useCallback } from "react";
import type { FormEvent } from "react";
import {
  Pencil,
  Camera,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  MapPin,
  FileText,
  ClipboardList,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import api from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client { id: string; name: string; }
interface Site { id: string; siteName: string; }

interface Employee {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  position: string | null;
  phone: string | null;
  salary: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  assignedClientId: string | null;
  assignedSiteId: string | null;
  employmentStatus: "ACTIVE" | "INACTIVE" | "TERMINATED";
  napsaRegistered: boolean;
  nhimaRegistered: boolean;
  notes: string | null;
  photoFilename: string | null;
  assignedClient?: { id: string; name: string } | null;
  assignedSite?: { id: string; siteName: string } | null;
  _count?: { employeeContracts: number };
}

interface EmployeeContract {
  id: string;
  contractNumber: string;
  startDate: string;
  endDate: string | null;
  status: string;
  payType: string;
  salary: number | null;
  shiftRate: number | null;
}

interface EmployeeDetail extends Employee {
  assignedClient: { id: string; name: string; status: string } | null;
  assignedSite: { id: string; siteName: string; status: string } | null;
  employeeContracts: EmployeeContract[];
  _count: { employeeContracts: number };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface EmployeeFormState {
  fullName: string;
  employeeNumber: string;
  position: string;
  phone: string;
  salary: string;
  contractStartDate: string;
  contractEndDate: string;
  assignedClientId: string;
  assignedSiteId: string;
  napsaRegistered: boolean;
  nhimaRegistered: boolean;
  notes: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: EmployeeFormState = {
  fullName: "",
  employeeNumber: "",
  position: "",
  phone: "",
  salary: "",
  contractStartDate: "",
  contractEndDate: "",
  assignedClientId: "",
  assignedSiteId: "",
  napsaRegistered: false,
  nhimaRegistered: false,
  notes: "",
};

const PAGE_SIZE = 15;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "TERMINATED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "TERMINATED", label: "Terminated" },
];

const STATUS_OPTIONS: Employee["employmentStatus"][] = ["ACTIVE", "INACTIVE", "TERMINATED"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1] ?? "";
  return (first + second).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number | string | null) {
  if (amount == null || amount === "") return "—";
  return `K ${Number(amount).toLocaleString()}`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-magen-green-light text-magen-green-dark";
    case "INACTIVE":
      return "bg-amber-100 text-amber-700";
    case "TERMINATED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({
  employee,
  size = "md",
  onUpload,
}: {
  employee: Employee;
  size?: "sm" | "md" | "lg";
  onUpload?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const dim =
    size === "sm"
      ? "w-9 h-9 text-xs"
      : size === "lg"
      ? "w-14 h-14 text-base"
      : "w-11 h-11 text-sm";

  // The photo endpoint requires the same auth token every other API call
  // uses. A plain <img src="..."> can't attach that header (only axios's
  // interceptor does, via localStorage), so the browser's own image
  // request gets a 401 and the photo silently falls back to initials.
  // Fetching it through the shared `api` client as a blob and pointing
  // the <img> at an object URL instead carries the Authorization header
  // correctly.
  const loadPhoto = useCallback(async () => {
    if (!employee.photoFilename) {
      setPhotoSrc(null);
      return;
    }
    try {
      const res = await api.get(`/employees/${employee.id}/photo`, {
        responseType: "blob",
      });
      setPhotoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(res.data as Blob);
      });
      setImgError(false);
    } catch {
      setImgError(true);
    }
  }, [employee.id, employee.photoFilename]);

  useEffect(() => {
    loadPhoto();
    return () => {
      setPhotoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPhoto]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file);
    try {
      await api.post(`/employees/${employee.id}/photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImgError(false);
      await loadPhoto();
      toast("success", "Photo updated", employee.fullName);
      onUpload?.();
    } catch {
      toast("error", "Photo upload failed", "Please try a smaller image (< 5 MB).");
    }
    e.target.value = "";
  }

  const showPhoto = employee.photoFilename && photoSrc && !imgError;

  return (
    <div className="relative flex-shrink-0 group">
      <div
        className={`${dim} rounded-full bg-magen-green-light text-magen-green-dark font-semibold flex items-center justify-center overflow-hidden`}
      >
        {showPhoto ? (
          <img
            src={photoSrc}
            alt={employee.fullName}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          initials(employee.fullName)
        )}
      </div>
      {onUpload !== undefined && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Upload photo"
          >
            <Camera size={14} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
}

// ─── EmployeeModal component ──────────────────────────────────────────────────

function EmployeeModal({
  editingId,
  editingEmployee,
  form,
  setForm,
  formError,
  isSaving,
  clients,
  sites,
  onSubmit,
  onClose,
  onPhotoUpload,
}: {
  editingId: string | "new";
  editingEmployee: Employee | null;
  form: EmployeeFormState;
  setForm: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  formError: string | null;
  isSaving: boolean;
  clients: Client[];
  sites: Site[];
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  onPhotoUpload: () => void;
}) {
  const isNew = editingId === "new";
  const title = isNew ? "Add Employee" : "Edit Employee";

  // Only employees whose Position is "Guard" can be assigned to a site —
  // backend enforces this too (see employees.service.ts's
  // ensurePositionIsGuard). Position is free text, so this is a
  // case-insensitive substring match, same as the backend's check.
  const isGuardPosition = /guard/i.test(form.position);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-card max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            {editingEmployee && (
              <Avatar employee={editingEmployee} size="md" onUpload={onPhotoUpload} />
            )}
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={onSubmit} className="flex flex-col">
          <div className="px-6 py-5 space-y-4">
            {formError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Full Name *</label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Employee No.</label>
                <input
                  value={form.employeeNumber}
                  onChange={(e) => setForm((f) => ({ ...f, employeeNumber: e.target.value }))}
                  className="input"
                  placeholder="e.g. MSL0043"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Position</label>
                <input
                  value={form.position}
                  onChange={(e) =>
                    setForm((f) => {
                      const position = e.target.value;
                      // Clear a now-invalid site assignment rather than
                      // silently submitting it — the backend would reject
                      // it anyway once Position stops matching "Guard".
                      const stillGuard = /guard/i.test(position);
                      return { ...f, position, assignedSiteId: stillGuard ? f.assignedSiteId : "" };
                    })
                  }
                  className="input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Salary</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary}
                  onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                  className="input"
                />
              </div>
              <div />

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Contract Start</label>
                <input
                  type="date"
                  value={form.contractStartDate}
                  onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Contract End</label>
                <input
                  type="date"
                  value={form.contractEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, contractEndDate: e.target.value }))}
                  className="input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Assigned Client</label>
                <select
                  value={form.assignedClientId}
                  onChange={(e) => setForm((f) => ({ ...f, assignedClientId: e.target.value }))}
                  className="select"
                >
                  <option value="">None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Assigned Site</label>
                <select
                  value={form.assignedSiteId}
                  onChange={(e) => setForm((f) => ({ ...f, assignedSiteId: e.target.value }))}
                  className="select"
                  disabled={!isGuardPosition}
                  title={isGuardPosition ? undefined : 'Only employees whose Position is "Guard" can be assigned to a site.'}
                >
                  <option value="">None</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName}</option>
                  ))}
                </select>
                {!isGuardPosition && (
                  <p className="text-xs text-gray-500">
                    Only Guards can be assigned to a site — set Position to "Guard" first.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.napsaRegistered}
                  onChange={(e) => setForm((f) => ({ ...f, napsaRegistered: e.target.checked }))}
                  className="accent-magen-green"
                />
                NAPSA Registered
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.nhimaRegistered}
                  onChange={(e) => setForm((f) => ({ ...f, nhimaRegistered: e.target.checked }))}
                  className="accent-magen-green"
                />
                NHIMA Registered
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="input resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 px-6 pb-5">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [clientFilter, setClientFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [page, setPage] = useState(1);

  // Form state
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel state
  const [detailEmployee, setDetailEmployee] = useState<EmployeeDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadLookups() {
    try {
      const [clientsRes, sitesRes] = await Promise.all([
        api.get("/clients", { params: { pageSize: 100, status: "ACTIVE" } }),
        api.get("/sites", { params: { pageSize: 100, status: "ACTIVE" } }),
      ]);
      setClients(clientsRes.data.data);
      setSites(sitesRes.data.data);
    } catch {
      // non-fatal
    }
  }

  async function loadEmployees(overridePage?: number) {
    setIsLoading(true);
    setError(null);
    const targetPage = overridePage ?? page;
    try {
      const params: Record<string, unknown> = {
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "ALL") params.employmentStatus = statusFilter;
      if (clientFilter) params.assignedClientId = clientFilter;
      if (siteFilter) params.assignedSiteId = siteFilter;

      const res = await api.get("/employees", { params });
      setEmployees(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load employees.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    setPage(1);
    loadEmployees(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, clientFilter, siteFilter]);

  async function handleSearch() {
    setPage(1);
    await loadEmployees(1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadEmployees(newPage);
  }

  async function loadEmployeeDetail(id: string) {
    setIsLoadingDetail(true);
    setDetailEmployee(null);
    try {
      const res = await api.get(`/employees/${id}`);
      setDetailEmployee(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load employee details.");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
    setEditingEmployee(null);
  }

  function openEditForm(emp: Employee) {
    setForm({
      fullName: emp.fullName,
      employeeNumber: emp.employeeNumber ?? "",
      position: emp.position ?? "",
      phone: emp.phone ?? "",
      salary: emp.salary ?? "",
      contractStartDate: emp.contractStartDate ? emp.contractStartDate.slice(0, 10) : "",
      contractEndDate: emp.contractEndDate ? emp.contractEndDate.slice(0, 10) : "",
      assignedClientId: emp.assignedClientId ?? "",
      assignedSiteId: emp.assignedSiteId ?? "",
      napsaRegistered: emp.napsaRegistered,
      nhimaRegistered: emp.nhimaRegistered,
      notes: emp.notes ?? "",
    });
    setFormError(null);
    setEditingId(emp.id);
    setEditingEmployee(emp);
  }

  function closeForm() {
    setEditingId(null);
    setEditingEmployee(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    const payload = {
      fullName: form.fullName.trim(),
      employeeNumber: form.employeeNumber.trim() || null,
      position: form.position.trim() || null,
      phone: form.phone.trim() || null,
      salary: form.salary.trim() ? Number(form.salary) : null,
      contractStartDate: form.contractStartDate || null,
      contractEndDate: form.contractEndDate || null,
      assignedClientId: form.assignedClientId || null,
      assignedSiteId: form.assignedSiteId || null,
      napsaRegistered: form.napsaRegistered,
      nhimaRegistered: form.nhimaRegistered,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/employees", payload);
        toast("success", "Employee added", form.fullName.trim());
      } else if (editingId) {
        await api.put(`/employees/${editingId}`, payload);
        toast("success", "Employee updated", form.fullName.trim());
        if (detailEmployee?.id === editingId) {
          await loadEmployeeDetail(editingId);
        }
      }
      closeForm();
      await loadEmployees();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save employee.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(emp: Employee, employmentStatus: Employee["employmentStatus"]) {
    try {
      await api.patch(`/employees/${emp.id}/status`, { employmentStatus });
      toast("success", `${emp.fullName} marked ${employmentStatus.toLowerCase()}`);
      await loadEmployees();
      if (detailEmployee?.id === emp.id) {
        await loadEmployeeDetail(emp.id);
      }
    } catch (err: any) {
      toast("error", "Status update failed", err.response?.data?.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {editingId !== null && (
        <EmployeeModal
          editingId={editingId}
          editingEmployee={editingEmployee}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          clients={clients}
          sites={sites}
          onSubmit={handleSubmit}
          onClose={closeForm}
          onPhotoUpload={loadEmployees}
        />
      )}

      <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {pagination.total} {pagination.total === 1 ? "employee" : "employees"}
              </p>
            </div>
            <button onClick={openCreateForm} className="btn-primary">
              + Add Employee
            </button>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={
                  "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors " +
                  (statusFilter === tab.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          <div className="flex gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by name, position, phone…"
              className="input w-64"
            />
            <select
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value); setSiteFilter(""); }}
              className="select w-44"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="select w-44"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.siteName}</option>
              ))}
            </select>
            <button onClick={handleSearch} className="btn-secondary">
              Search
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Employee list */}
          {isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
          ) : employees.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">No employees found.</div>
          ) : (
            <>
              <div className="space-y-2">
                {employees.map((emp) => (
                  <div
                    key={emp.id}
                    onClick={() => loadEmployeeDetail(emp.id)}
                    className={
                      "card px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-magen-green/40 transition-colors " +
                      (detailEmployee?.id === emp.id
                        ? "border-magen-green/60 ring-1 ring-magen-green/30"
                        : "")
                    }
                  >
                    <Avatar employee={emp} size="sm" />

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {emp.fullName}
                        {emp.employeeNumber && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">({emp.employeeNumber})</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {emp.position ?? "—"}
                        {emp.assignedClient ? ` · ${emp.assignedClient.name}` : ""}
                        {emp.assignedSite ? ` / ${emp.assignedSite.siteName}` : ""}
                      </p>
                    </div>

                    {/* NAPSA / NHIMA badges */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      <span className={
                        "text-xs border px-1.5 py-0.5 rounded font-medium " +
                        (emp.napsaRegistered
                          ? "bg-blue-50 text-blue-600 border-blue-100"
                          : "bg-gray-50 text-gray-300 border-gray-100")
                      }>NAPSA</span>
                      <span className={
                        "text-xs border px-1.5 py-0.5 rounded font-medium " +
                        (emp.nhimaRegistered
                          ? "bg-purple-50 text-purple-600 border-purple-100"
                          : "bg-gray-50 text-gray-300 border-gray-100")
                      }>NHIMA</span>
                    </div>

                    {/* Status pill — inline select for quick changes */}
                    <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                      <select
                        value={emp.employmentStatus}
                        onChange={(e) =>
                          handleStatusChange(emp, e.target.value as Employee["employmentStatus"])
                        }
                        className={
                          "text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer " +
                          (emp.employmentStatus === "ACTIVE"
                            ? "bg-magen-green-light text-magen-green-dark border-magen-green/20"
                            : emp.employmentStatus === "INACTIVE"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-red-100 text-red-700 border-red-200")
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); openEditForm(emp); }}
                      title="Edit"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy border border-transparent hover:border-gray-200 flex-shrink-0"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => handlePageChange(page - 1)}
                      className="btn-secondary px-2 py-1.5 disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      disabled={page >= pagination.totalPages}
                      onClick={() => handlePageChange(page + 1)}
                      className="btn-secondary px-2 py-1.5 disabled:opacity-40"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      {/* ── Employee Detail popup ────────────────────────────────────────── */}
      {(detailEmployee || isLoadingDetail) && (
        <div className="modal-overlay" onClick={() => setDetailEmployee(null)}>
          <div className="modal-card max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              {isLoadingDetail ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
              ) : detailEmployee ? (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        employee={detailEmployee}
                        size="lg"
                        onUpload={() => loadEmployeeDetail(detailEmployee.id)}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {detailEmployee.fullName}
                          {detailEmployee.employeeNumber && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">({detailEmployee.employeeNumber})</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{detailEmployee.position ?? "—"}</p>
                        <span
                          className={
                            "text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 inline-block " +
                            statusBadgeClass(detailEmployee.employmentStatus)
                          }
                        >
                          {detailEmployee.employmentStatus}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDetailEmployee(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Contact + assignment */}
                  <div className="space-y-1.5 text-sm text-gray-600 border-t border-gray-100 pt-3">
                    {detailEmployee.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailEmployee.phone}</span>
                      </div>
                    )}
                    {detailEmployee.assignedClient && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailEmployee.assignedClient.name}</span>
                      </div>
                    )}
                    {detailEmployee.assignedSite && (
                      <div className="flex items-center gap-2 ml-5">
                        <span className="text-gray-500">{detailEmployee.assignedSite.siteName}</span>
                      </div>
                    )}
                    {detailEmployee.salary && (
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-gray-400 flex-shrink-0" />
                        <span>Salary: {formatCurrency(detailEmployee.salary)}</span>
                      </div>
                    )}
                    {detailEmployee.contractStartDate && (
                      <p className="text-xs text-gray-500 ml-5">
                        Contract: {formatDate(detailEmployee.contractStartDate)}
                        {detailEmployee.contractEndDate
                          ? ` → ${formatDate(detailEmployee.contractEndDate)}`
                          : " · Ongoing"}
                      </p>
                    )}
                    {detailEmployee.notes && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 mt-1">
                        {detailEmployee.notes}
                      </p>
                    )}
                  </div>

                  {/* NAPSA / NHIMA */}
                  <div className="flex gap-4 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      {detailEmployee.napsaRegistered ? (
                        <CheckCircle2 size={14} className="text-magen-green-dark" />
                      ) : (
                        <XCircle size={14} className="text-gray-300" />
                      )}
                      <span className={detailEmployee.napsaRegistered ? "text-gray-700" : "text-gray-400"}>
                        NAPSA registered
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      {detailEmployee.nhimaRegistered ? (
                        <CheckCircle2 size={14} className="text-magen-green-dark" />
                      ) : (
                        <XCircle size={14} className="text-gray-300" />
                      )}
                      <span className={detailEmployee.nhimaRegistered ? "text-gray-700" : "text-gray-400"}>
                        NHIMA registered
                      </span>
                    </div>
                  </div>

                  {/* Contracts */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList size={14} className="text-gray-400" />
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        Contracts ({detailEmployee._count.employeeContracts})
                      </p>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {detailEmployee.employeeContracts.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No contracts on record.</p>
                      ) : (
                        detailEmployee.employeeContracts.map((contract) => (
                          <div
                            key={contract.id}
                            className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="text-sm font-medium text-gray-800">{contract.contractNumber}</p>
                              <span
                                className={
                                  "text-xs font-medium px-2 py-0.5 rounded-full " +
                                  (contract.status === "ACTIVE"
                                    ? "bg-magen-green-light text-magen-green-dark"
                                    : contract.status === "EXPIRED"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-gray-100 text-gray-500")
                                }
                              >
                                {contract.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatDate(contract.startDate)}
                              {contract.endDate ? ` → ${formatDate(contract.endDate)}` : " · Ongoing"}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {contract.payType === "SHIFT"
                                ? `Shift rate: ${formatCurrency(contract.shiftRate)}`
                                : `Salary: ${formatCurrency(contract.salary)}`}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => openEditForm(detailEmployee)}
                      className="btn-secondary flex-1 justify-center text-xs"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <div className="flex-1">
                      <select
                        value={detailEmployee.employmentStatus}
                        onChange={(e) =>
                          handleStatusChange(detailEmployee, e.target.value as Employee["employmentStatus"])
                        }
                        className={
                          "w-full text-xs font-medium px-3 py-2 rounded-lg border cursor-pointer " +
                          (detailEmployee.employmentStatus === "ACTIVE"
                            ? "bg-magen-green-light text-magen-green-dark border-magen-green/20"
                            : detailEmployee.employmentStatus === "INACTIVE"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-red-100 text-red-700 border-red-200")
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : null}
          </div>
        </div>
      )}
    </>
  );
}
