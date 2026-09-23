import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import {
  Pencil,
  Archive,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Phone,
  Mail,
  FileText,
  Building2,
  ClipboardList,
  Receipt,
} from "lucide-react";
import api from "../../api/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  _count?: {
    sites: number;
    invoices: number;
    clientContracts: number;
  };
}

interface Site {
  id: string;
  name: string;
  location: string | null;
  status: string;
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

interface ClientDetail extends Client {
  sites: Site[];
  clientContracts: Contract[];
  invoices: Invoice[];
  _count: {
    sites: number;
    employees: number;
    clientContracts: number;
    invoices: number;
    payments: number;
    operationalCosts: number;
  };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ClientFormState {
  name: string;
  location: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: ClientFormState = {
  name: "",
  location: "",
  phone: "",
  email: "",
  address: "",
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

// ─── Client Form Modal ────────────────────────────────────────────────────────

interface ClientModalProps {
  editingId: string | "new";
  form: ClientFormState;
  formError: string | null;
  isSaving: boolean;
  onChange: (f: ClientFormState) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

function ClientModal({
  editingId,
  form,
  formError,
  isSaving,
  onChange,
  onSubmit,
  onClose,
}: ClientModalProps) {
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
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {editingId === "new" ? "Add Client" : "Edit Client"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className="input"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Location</label>
              <input
                value={form.location}
                onChange={(e) => onChange({ ...form, location: e.target.value })}
                className="input"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => onChange({ ...form, phone: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              className="input"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Address</label>
            <input
              value={form.address}
              onChange={(e) => onChange({ ...form, address: e.target.value })}
              className="input"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              className="input resize-none"
              rows={2}
            />
          </div>

          {/* Modal footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? "Saving…" : editingId === "new" ? "Add Client" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [page, setPage] = useState(1);

  // Modal state
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Detail panel state
  const [detailClient, setDetailClient] = useState<ClientDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"sites" | "contracts" | "invoices">("sites");

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadClients(overridePage?: number, overrideSearch?: string) {
    setIsLoading(true);
    setError(null);
    const targetPage = overridePage ?? page;
    const effectiveSearch = overrideSearch !== undefined ? overrideSearch : search;
    try {
      const params: Record<string, unknown> = {
        page: targetPage,
        pageSize: PAGE_SIZE,
      };
      if (effectiveSearch.trim()) params.search = effectiveSearch.trim();
      if (statusFilter !== "ALL") params.status = statusFilter;

      const res = await api.get("/clients", { params });
      setClients(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load clients.");
    } finally {
      setIsLoading(false);
    }
  }

  // Global search (Header search bar) links here as /clients?q=<term> — pick
  // that up once on mount and seed the page's own search box with it.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearch(q);
      setPage(1);
      loadClients(1, q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadClients(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleSearch() {
    setPage(1);
    await loadClients(1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadClients(newPage);
  }

  async function loadClientDetail(id: string) {
    setIsLoadingDetail(true);
    setDetailClient(null);
    setDetailTab("sites");
    try {
      const res = await api.get(`/clients/${id}`);
      setDetailClient(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load client details.");
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

  function openEditForm(client: Client) {
    setForm({
      name: client.name,
      location: client.location ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    });
    setFormError(null);
    setEditingId(client.id);
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
      name: form.name.trim(),
      location: form.location.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/clients", payload);
      } else if (editingId) {
        await api.put(`/clients/${editingId}`, payload);
        if (detailClient?.id === editingId) {
          await loadClientDetail(editingId);
        }
      }
      closeForm();
      await loadClients();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save client.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(client: Client, status: Client["status"]) {
    try {
      await api.patch(`/clients/${client.id}/status`, { status });
      await loadClients();
      if (detailClient?.id === client.id) {
        setDetailClient(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update status.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {editingId && (
        <ClientModal
          editingId={editingId}
          form={form}
          formError={formError}
          isSaving={isSaving}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      <div className="flex gap-6 h-full">
        {/* ── Left: Client List ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {pagination.total} {pagination.total === 1 ? "client" : "clients"}
              </p>
            </div>
            <button onClick={openCreateForm} className="btn-primary">
              + Add Client
            </button>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1 bg-gray-200 rounded-xl p-1 w-fit">
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

          {/* Search */}
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by name, location, phone, email…"
              className="input w-72"
            />
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

          {/* Client list */}
          {isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
          ) : clients.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">No clients found.</div>
          ) : (
            <>
              <div className="space-y-2">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => loadClientDetail(client.id)}
                    className={
                      "card px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-magen-green/40 transition-colors " +
                      (detailClient?.id === client.id ? "border-magen-green/60 ring-1 ring-magen-green/30" : "")
                    }
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark text-sm font-semibold flex items-center justify-center flex-shrink-0">
                      {initials(client.name)}
                    </div>

                    {/* Name + location */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{client.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {client.location ?? "—"}
                        {client.phone ? ` · ${client.phone}` : ""}
                      </p>
                    </div>

                    {/* Counts */}
                    {client._count && (
                      <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                        <span title="Sites">
                          <Building2 size={12} className="inline mr-0.5" />
                          {client._count.sites}
                        </span>
                        <span title="Contracts">
                          <ClipboardList size={12} className="inline mr-0.5" />
                          {client._count.clientContracts}
                        </span>
                        <span title="Invoices">
                          <Receipt size={12} className="inline mr-0.5" />
                          {client._count.invoices}
                        </span>
                      </div>
                    )}

                    {/* Status badge */}
                    <span
                      className={
                        "text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 " +
                        statusBadgeClass(client.status)
                      }
                    >
                      {client.status}
                    </span>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openEditForm(client)}
                        title="Edit"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy border border-transparent hover:border-gray-200"
                      >
                        <Pencil size={15} />
                      </button>
                      {client.status !== "ARCHIVED" ? (
                        <button
                          onClick={() => handleStatusChange(client, "ARCHIVED")}
                          title="Archive"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 border border-transparent hover:border-gray-200"
                        >
                          <Archive size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(client, "ACTIVE")}
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
        {(detailClient || isLoadingDetail) && (
          <div className="w-96 flex-shrink-0">
            <div className="card p-5 space-y-4 sticky top-0">
              {isLoadingDetail ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
              ) : detailClient ? (
                <>
                  {/* Panel header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-magen-green-light text-magen-green-dark text-base font-semibold flex items-center justify-center flex-shrink-0">
                        {initials(detailClient.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{detailClient.name}</p>
                        <span
                          className={
                            "text-xs font-medium px-2 py-0.5 rounded-full " +
                            statusBadgeClass(detailClient.status)
                          }
                        >
                          {detailClient.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDetailClient(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1.5 text-sm text-gray-600 border-t border-gray-100 pt-3">
                    {detailClient.location && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailClient.location}</span>
                      </div>
                    )}
                    {detailClient.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailClient.phone}</span>
                      </div>
                    )}
                    {detailClient.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{detailClient.email}</span>
                      </div>
                    )}
                    {detailClient.address && (
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{detailClient.address}</span>
                      </div>
                    )}
                    {detailClient.notes && (
                      <p className="text-gray-500 text-xs mt-2 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
                        {detailClient.notes}
                      </p>
                    )}
                  </div>

                  {/* Counts summary */}
                  <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                    {[
                      { label: "Sites", value: detailClient._count.sites, icon: Building2 },
                      { label: "Contracts", value: detailClient._count.clientContracts, icon: ClipboardList },
                      { label: "Invoices", value: detailClient._count.invoices, icon: Receipt },
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
                      {(["sites", "contracts", "invoices"] as const).map((tab) => (
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
                    {detailTab === "sites" && (
                      detailClient.sites.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No sites.</p>
                      ) : (
                        detailClient.sites.map((site) => (
                          <div key={site.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{site.name}</p>
                              {site.location && (
                                <p className="text-xs text-gray-500">{site.location}</p>
                              )}
                            </div>
                            <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + statusBadgeClass(site.status)}>
                              {site.status}
                            </span>
                          </div>
                        ))
                      )
                    )}

                    {detailTab === "contracts" && (
                      detailClient.clientContracts.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No contracts.</p>
                      ) : (
                        detailClient.clientContracts.map((contract) => (
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
                      detailClient.invoices.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No invoices.</p>
                      ) : (
                        detailClient.invoices.map((invoice) => (
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
                      onClick={() => {
                        // Close the detail panel first — otherwise it stays
                        // open on top of the Edit modal.
                        setDetailClient(null);
                        openEditForm(detailClient);
                      }}
                      className="btn-secondary flex-1 justify-center text-xs"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {detailClient.status !== "ARCHIVED" ? (
                      <button
                        onClick={() => handleStatusChange(detailClient, "ARCHIVED")}
                        className="btn-secondary flex-1 justify-center text-xs text-gray-600"
                      >
                        <Archive size={13} /> Archive
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(detailClient, "ACTIVE")}
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
    </>
  );
}
