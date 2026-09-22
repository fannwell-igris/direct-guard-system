import { useEffect, useState, FormEvent } from "react";
import {
  Pencil,
  Archive,
  RotateCcw,
  MapPin,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  ClipboardList,
  Receipt,
  Building2,
} from "lucide-react";
import api from "../../api/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
}

interface Site {
  id: string;
  siteName: string;
  location: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  clientId: string;
  client?: { id: string; name: string };
  _count?: {
    employees: number;
    clientContracts: number;
    invoices: number;
  };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  employmentStatus: string;
}

interface Contract {
  id: string;
  contractNumber: string;
  startDate: string;
  endDate: string | null;
  status: string;
  monthlyValue: number | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  status: string;
}

interface SiteDetail extends Site {
  client: { id: string; name: string; status: string };
  employees: Employee[];
  clientContracts: Contract[];
  invoices: Invoice[];
  _count: {
    employees: number;
    clientContracts: number;
    invoices: number;
    operationalCosts: number;
  };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SiteFormState {
  clientId: string;
  siteName: string;
  location: string;
  notes: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: SiteFormState = {
  clientId: "",
  siteName: "",
  location: "",
  notes: "",
};

const PAGE_SIZE = 15;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number | null) {
  if (amount == null) return "—";
  return `K ${amount.toLocaleString()}`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-magen-green-light text-magen-green-dark";
    case "INACTIVE":
      return "bg-amber-100 text-amber-700";
    case "ARCHIVED":
      return "bg-gray-100 text-gray-500";
    case "PAID":
      return "bg-magen-green-light text-magen-green-dark";
    case "OVERDUE":
      return "bg-red-100 text-red-700";
    case "PENDING":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ─── SiteModal ────────────────────────────────────────────────────────────────

interface SiteModalProps {
  editingId: string | "new";
  form: SiteFormState;
  setForm: (form: SiteFormState) => void;
  formError: string | null;
  isSaving: boolean;
  clients: Client[];
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

function SiteModal({
  editingId,
  form,
  setForm,
  formError,
  isSaving,
  clients,
  onSubmit,
  onClose,
}: SiteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {editingId === "new" ? "New Site" : "Edit Site"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit}>
          <div className="px-6 py-5 space-y-4">
            {formError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Client *</label>
              <select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="select"
              >
                <option value="" disabled>
                  Select a client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Site Name *</label>
              <input
                required
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                className="input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Location</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
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
  const [page, setPage] = useState(1);

  // Form state
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<SiteFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel state
  const [detailSite, setDetailSite] = useState<SiteDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"employees" | "contracts" | "invoices">("employees");

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadClients() {
    try {
      const res = await api.get("/clients", { params: { pageSize: 200, status: "ACTIVE" } });
      setClients(res.data.data);
    } catch {
      // non-fatal — form dropdown just shows empty
    }
  }

  async function loadSites(overridePage?: number) {
    setIsLoading(true);
    setError(null);
    const targetPage = overridePage ?? page;
    try {
      const params: Record<string, unknown> = {
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (clientFilter) params.clientId = clientFilter;

      const res = await api.get("/sites", { params });
      setSites(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load sites.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    setPage(1);
    loadSites(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, clientFilter]);

  async function handleSearch() {
    setPage(1);
    await loadSites(1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadSites(newPage);
  }

  async function loadSiteDetail(id: string) {
    setIsLoadingDetail(true);
    setDetailSite(null);
    setDetailTab("employees");
    try {
      const res = await api.get(`/sites/${id}`);
      setDetailSite(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load site details.");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEditForm(site: Site) {
    setForm({
      clientId: site.clientId,
      siteName: site.siteName,
      location: site.location ?? "",
      notes: site.notes ?? "",
    });
    setFormError(null);
    setEditingId(site.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    const payload = {
      clientId: form.clientId,
      siteName: form.siteName.trim(),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/sites", payload);
      } else if (editingId) {
        await api.put(`/sites/${editingId}`, payload);
        if (detailSite?.id === editingId) {
          await loadSiteDetail(editingId);
        }
      }
      closeForm();
      await loadSites();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save site.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(site: Site, status: Site["status"]) {
    try {
      await api.patch(`/sites/${site.id}/status`, { status });
      await loadSites();
      if (detailSite?.id === site.id) {
        setDetailSite(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update status.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 h-full">
      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {editingId !== null && (
        <SiteModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          clients={clients}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {/* ── Left: Site List ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pagination.total} {pagination.total === 1 ? "site" : "sites"}
            </p>
          </div>
          <button onClick={openCreateForm} className="btn-primary">
            + Add Site
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

        {/* Search + client filter */}
        <div className="flex gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by site name or location…"
            className="input w-64"
          />
          <select
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value);
            }}
            className="select w-48"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={handleSearch} className="btn-secondary">
            Search
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Site list */}
        {isLoading ? (
          <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
        ) : sites.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">No sites found.</div>
        ) : (
          <>
            <div className="space-y-2">
              {sites.map((site) => (
                <div
                  key={site.id}
                  onClick={() => loadSiteDetail(site.id)}
                  className={
                    "card px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-magen-green/40 transition-colors " +
                    (detailSite?.id === site.id
                      ? "border-magen-green/60 ring-1 ring-magen-green/30"
                      : "")
                  }
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                    <MapPin size={17} />
                  </div>

                  {/* Name + client */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{site.siteName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {site.client?.name ?? "—"}
                      {site.location ? ` · ${site.location}` : ""}
                    </p>
                  </div>

                  {/* Counts */}
                  {site._count && (
                    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                      <span title="Employees">
                        <Users size={12} className="inline mr-0.5" />
                        {site._count.employees}
                      </span>
                      <span title="Contracts">
                        <ClipboardList size={12} className="inline mr-0.5" />
                        {site._count.clientContracts}
                      </span>
                      <span title="Invoices">
                        <Receipt size={12} className="inline mr-0.5" />
                        {site._count.invoices}
                      </span>
                    </div>
                  )}

                  {/* Status badge */}
                  <span
                    className={
                      "text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 " +
                      statusBadgeClass(site.status)
                    }
                  >
                    {site.status}
                  </span>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => openEditForm(site)}
                      title="Edit"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy border border-transparent hover:border-gray-200"
                    >
                      <Pencil size={15} />
                    </button>
                    {site.status !== "ARCHIVED" ? (
                      <button
                        onClick={() => handleStatusChange(site, "ARCHIVED")}
                        title="Archive"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 border border-transparent hover:border-gray-200"
                      >
                        <Archive size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(site, "ACTIVE")}
                        title="Reactivate"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-green-dark border border-transparent hover:border-gray-200"
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                  </div>
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

      {/* ── Right: Detail Panel ──────────────────────────────────────────── */}
      {(detailSite || isLoadingDetail) && (
        <div className="w-96 flex-shrink-0">
          <div className="card p-5 space-y-4 sticky top-0">
            {isLoadingDetail ? (
              <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
            ) : detailSite ? (
              <>
                {/* Panel header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                      <Building2 size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{detailSite.siteName}</p>
                      <p className="text-xs text-gray-500 truncate">{detailSite.client.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={
                        "text-xs font-medium px-2 py-0.5 rounded-full " +
                        statusBadgeClass(detailSite.status)
                      }
                    >
                      {detailSite.status}
                    </span>
                    <button
                      onClick={() => setDetailSite(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Location / notes */}
                {(detailSite.location || detailSite.notes) && (
                  <div className="space-y-1.5 text-sm text-gray-600 border-t border-gray-100 pt-3">
                    {detailSite.location && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailSite.location}</span>
                      </div>
                    )}
                    {detailSite.notes && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
                        {detailSite.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Counts summary */}
                <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                  {[
                    { label: "Employees", value: detailSite._count.employees, icon: Users },
                    { label: "Contracts", value: detailSite._count.clientContracts, icon: ClipboardList },
                    { label: "Invoices", value: detailSite._count.invoices, icon: Receipt },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="text-center bg-gray-50 rounded-lg py-2 px-1 border border-gray-100">
                      <Icon size={14} className="text-gray-400 mx-auto mb-0.5" />
                      <p className="text-base font-semibold text-gray-800">{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Detail tabs */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(["employees", "contracts", "invoices"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                        className={
                          "flex-1 text-xs font-medium py-1 rounded-md capitalize transition-colors " +
                          (detailTab === tab
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700")
                        }
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {detailTab === "employees" && (
                    detailSite.employees.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No employees assigned.</p>
                    ) : (
                      detailSite.employees.map((emp) => (
                        <div key={emp.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {emp.firstName} {emp.lastName}
                            </p>
                            {emp.position && (
                              <p className="text-xs text-gray-500">{emp.position}</p>
                            )}
                          </div>
                          <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + statusBadgeClass(emp.employmentStatus)}>
                            {emp.employmentStatus}
                          </span>
                        </div>
                      ))
                    )
                  )}

                  {detailTab === "contracts" && (
                    detailSite.clientContracts.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No contracts.</p>
                    ) : (
                      detailSite.clientContracts.map((contract) => (
                        <div key={contract.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-800">{contract.contractNumber}</p>
                            <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + statusBadgeClass(contract.status)}>
                              {contract.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDate(contract.startDate)}
                            {contract.endDate ? ` → ${formatDate(contract.endDate)}` : " · Ongoing"}
                          </p>
                          {contract.monthlyValue != null && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {formatCurrency(contract.monthlyValue)} / month
                            </p>
                          )}
                        </div>
                      ))
                    )
                  )}

                  {detailTab === "invoices" && (
                    detailSite.invoices.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No invoices.</p>
                    ) : (
                      detailSite.invoices.map((invoice) => (
                        <div key={invoice.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-800">{invoice.invoiceNumber}</p>
                            <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + statusBadgeClass(invoice.status)}>
                              {invoice.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Issued {formatDate(invoice.invoiceDate)} · Due {formatDate(invoice.dueDate)}
                          </p>
                          <p className="text-sm font-semibold text-gray-800 mt-0.5">
                            {formatCurrency(invoice.totalAmount)}
                          </p>
                        </div>
                      ))
                    )
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openEditForm(detailSite)}
                    className="btn-secondary flex-1 justify-center text-xs"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  {detailSite.status !== "ARCHIVED" ? (
                    <button
                      onClick={() => handleStatusChange(detailSite, "ARCHIVED")}
                      className="btn-secondary flex-1 justify-center text-xs text-gray-600"
                    >
                      <Archive size={13} /> Archive
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(detailSite, "ACTIVE")}
                      className="btn-secondary flex-1 justify-center text-xs text-magen-green-dark"
                    >
                      <RotateCcw size={13} /> Reactivate
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
