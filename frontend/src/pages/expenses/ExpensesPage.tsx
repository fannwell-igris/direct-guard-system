import { useEffect, useState, FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Plus,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
  MapPin,
  Calendar,
  Tag,
  DollarSign,
  FileText,
  AlertCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
}

interface Site {
  id: string;
  siteName: string;
  clientId?: string;
}

interface OperationalCost {
  id: string;
  clientId: string;
  siteId: string;
  month: string;
  costCategory: string;
  amount: string | number;
  description?: string | null;
  notes?: string | null;
  date: string;
  client: { id: string; name: string };
  site: { id: string; siteName: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API = "http://localhost:3000/api";
const PAGE_SIZE = 20;

// Suggested categories — user can type their own since it's free text on backend
const SUGGESTED_CATEGORIES = [
  "Fuel",
  "Utilities",
  "Equipment",
  "Maintenance",
  "Transport",
  "Communication",
  "Uniforms",
  "Training",
  "Office Supplies",
  "Other",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number | null | undefined): string {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return `ZMW ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZM", { year: "numeric", month: "long" });
}

/** Returns the current month as "YYYY-MM-01" for the API */
function thisMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Returns "YYYY-MM" string for an <input type="month"> from a date string */
function toMonthInput(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Converts "YYYY-MM" from <input type="month"> to "YYYY-MM-01" for the API */
function fromMonthInput(val: string): string {
  return val ? `${val}-01` : "";
}

function totalAmount(rows: OperationalCost[]): number {
  return rows.reduce((sum, r) => sum + Number(r.amount), 0);
}

// ─── Blank form state ─────────────────────────────────────────────────────────

interface FormState {
  clientId: string;
  siteId: string;
  month: string; // "YYYY-MM"
  costCategory: string;
  customCategory: string; // when typing a category not in the list
  amount: string;
  description: string;
  notes: string;
}

function blankForm(): FormState {
  const now = new Date();
  return {
    clientId: "",
    siteId: "",
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    costCategory: "",
    customCategory: "",
    amount: "",
    description: "",
    notes: "",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OperationalCostsPage() {
  const { token } = useAuth();
  const authHeader = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── list state
  const [costs, setCosts] = useState<OperationalCost[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── filter state
  const [clientFilter, setClientFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [page, setPage] = useState(1);

  // ── reference data
  const [clients, setClients] = useState<Client[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);

  // ── panel state
  const [panelMode, setPanelMode] = useState<"none" | "add" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCost, setSelectedCost] = useState<OperationalCost | null>(null);

  // ── form state
  const [form, setForm] = useState<FormState>(blankForm());
  const [formSites, setFormSites] = useState<Site[]>([]); // sites scoped to form's clientId
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Load reference data on mount ─────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/clients?pageSize=200&status=ACTIVE`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setClients(j.data ?? []))
      .catch(() => {});

    fetch(`${API}/sites?pageSize=500`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setAllSites(j.data ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Filter sites by selected client (filter row) ────────────────────────
  useEffect(() => {
    if (clientFilter) {
      setFilteredSites(allSites.filter((s) => s.clientId === clientFilter || !s.clientId));
      setSiteFilter("");
    } else {
      setFilteredSites(allSites);
    }
  }, [clientFilter, allSites]);

  // ─── Filter sites by selected client (form) ──────────────────────────────
  useEffect(() => {
    if (form.clientId) {
      setFormSites(allSites.filter((s) => s.clientId === form.clientId || !s.clientId));
    } else {
      setFormSites(allSites);
    }
    setForm((f) => ({ ...f, siteId: "" }));
  }, [form.clientId, allSites]);

  // ─── Reload list when filters / page change ────────────────────────────────
  useEffect(() => {
    loadCosts(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter, siteFilter, categoryFilter, monthFrom, monthTo, page]);

  async function loadCosts(overridePage?: number) {
    const p = overridePage ?? page;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (clientFilter) params.set("clientId", clientFilter);
      if (siteFilter) params.set("siteId", siteFilter);
      if (categoryFilter) params.set("costCategory", categoryFilter);
      if (monthFrom) params.set("monthFrom", fromMonthInput(monthFrom));
      if (monthTo) params.set("monthTo", fromMonthInput(monthTo));

      const res = await fetch(`${API}/operational-costs?${params}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setCosts(json.data ?? []);
      setPagination(json.pagination ?? { page: p, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load operational costs.");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    setPage(1);
    loadCosts(1);
  }

  function clearFilters() {
    setClientFilter("");
    setSiteFilter("");
    setCategoryFilter("");
    setMonthFrom("");
    setMonthTo("");
    setPage(1);
  }

  // ─── Panel helpers ─────────────────────────────────────────────────────────

  function openAddPanel() {
    setForm(blankForm());
    setFormError(null);
    setEditingId(null);
    setSelectedCost(null);
    setPanelMode("add");
  }

  function openEditPanel(cost: OperationalCost) {
    setForm({
      clientId: cost.clientId,
      siteId: cost.siteId,
      month: toMonthInput(cost.month),
      costCategory: SUGGESTED_CATEGORIES.includes(cost.costCategory) ? cost.costCategory : "Other",
      customCategory: SUGGESTED_CATEGORIES.includes(cost.costCategory) ? "" : cost.costCategory,
      amount: String(Number(cost.amount)),
      description: cost.description ?? "",
      notes: cost.notes ?? "",
    });
    setFormError(null);
    setEditingId(cost.id);
    setSelectedCost(cost);
    setPanelMode("edit");
  }

  function closePanel() {
    setPanelMode("none");
    setEditingId(null);
    setSelectedCost(null);
    setFormError(null);
  }

  // ─── Form submission ───────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Resolve category: if "Other" (or not in list), use customCategory
    const resolvedCategory =
      form.costCategory === "Other" || !SUGGESTED_CATEGORIES.includes(form.costCategory)
        ? form.customCategory.trim()
        : form.costCategory;

    if (!form.clientId) return setFormError("Please select a client.");
    if (!form.siteId) return setFormError("Please select a site.");
    if (!form.month) return setFormError("Please select a month.");
    if (!resolvedCategory) return setFormError("Please enter a cost category.");
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      return setFormError("Please enter a valid amount greater than zero.");

    const payload = {
      clientId: form.clientId,
      siteId: form.siteId,
      month: fromMonthInput(form.month),
      costCategory: resolvedCategory,
      amount: Number(form.amount),
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      const url = panelMode === "edit" && editingId
        ? `${API}/operational-costs/${editingId}`
        : `${API}/operational-costs`;
      const method = panelMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }

      closePanel();
      loadCosts(page);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Pagination ────────────────────────────────────────────────────────────

  function goToPage(p: number) {
    setPage(p);
  }

  const hasFilters = clientFilter || siteFilter || categoryFilter || monthFrom || monthTo;
  const pageTotal = totalAmount(costs);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-magen-navy">Operational Costs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track per-site expenses by month and category
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddPanel}>
          <Plus size={16} />
          Add Cost Entry
        </button>
      </div>

      <div className="flex gap-6 mt-6">
        {/* ── Left: filters + list ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Filter row */}
          <div className="card p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Client */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
                <select
                  className="select w-full"
                  value={clientFilter}
                  onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Site */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
                <select
                  className="select w-full"
                  value={siteFilter}
                  onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
                >
                  <option value="">All sites</option>
                  {filteredSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Fuel"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>

              {/* Month From */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From month</label>
                <input
                  type="month"
                  className="input w-full"
                  value={monthFrom}
                  onChange={(e) => { setMonthFrom(e.target.value); setPage(1); }}
                />
              </div>

              {/* Month To */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To month</label>
                <input
                  type="month"
                  className="input w-full"
                  value={monthTo}
                  onChange={(e) => { setMonthTo(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2 mt-3">
              <button className="btn-primary text-sm py-1.5" onClick={applyFilters}>
                Apply filters
              </button>
              {hasFilters && (
                <button className="btn-secondary text-sm py-1.5" onClick={clearFilters}>
                  Clear
                </button>
              )}
              {hasFilters && costs.length > 0 && (
                <span className="ml-auto text-sm text-gray-500">
                  Showing {pagination.total} result{pagination.total !== 1 ? "s" : ""} ·{" "}
                  <span className="font-semibold text-gray-700">
                    Page total: {formatCurrency(pageTotal)}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl p-4 mb-4 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Table */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
            ) : costs.length === 0 ? (
              <div className="p-12 text-center">
                <DollarSign size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">No cost entries found</p>
                <p className="text-xs text-gray-400 mt-1">
                  {hasFilters ? "Try clearing the filters." : "Add the first entry with the button above."}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Month</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Client</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Site</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Category</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Amount</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Description</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {costs.map((cost) => (
                      <tr
                        key={cost.id}
                        className={
                          "hover:bg-gray-50/70 transition-colors cursor-pointer " +
                          (editingId === cost.id ? "bg-magen-green-light/40" : "")
                        }
                        onClick={() => openEditPanel(cost)}
                      >
                        {/* Month */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                            <Calendar size={13} className="text-gray-400 shrink-0" />
                            {formatMonth(cost.month)}
                          </div>
                        </td>

                        {/* Client */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Building2 size={13} className="text-gray-400 shrink-0" />
                            {cost.client?.name ?? "—"}
                          </div>
                        </td>

                        {/* Site */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <MapPin size={13} className="text-gray-400 shrink-0" />
                            {cost.site?.siteName ?? "—"}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 text-xs font-medium px-2 py-0.5 rounded-full">
                            <Tag size={10} />
                            {cost.costCategory}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="font-semibold text-gray-800">
                            {formatCurrency(cost.amount)}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-gray-500 truncate text-xs">
                            {cost.description || "—"}
                          </p>
                        </td>

                        {/* Edit */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="p-1.5 rounded-lg text-gray-400 hover:text-magen-green hover:bg-magen-green-light transition-colors"
                            title="Edit"
                            onClick={() => openEditPanel(cost)}
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Page total row */}
                  {costs.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Page total ({costs.length} entr{costs.length !== 1 ? "ies" : "y"})
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-800">
                          {formatCurrency(pageTotal)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} total entr{pagination.total !== 1 ? "ies" : "y"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary p-2"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      className={
                        "w-8 h-8 rounded-lg text-sm font-medium transition-colors " +
                        (p === pagination.page
                          ? "bg-magen-navy text-white"
                          : "hover:bg-gray-100 text-gray-600")
                      }
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="btn-secondary p-2"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Add / Edit panel ──────────────────────────────────────── */}
        {panelMode !== "none" && (
          <div className="w-96 shrink-0">
            <div className="card p-5 sticky top-6">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-magen-navy">
                  {panelMode === "add" ? "Add Cost Entry" : "Edit Cost Entry"}
                </h2>
                <button
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  onClick={closePanel}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Selected cost summary (edit mode) */}
              {panelMode === "edit" && selectedCost && (
                <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm">
                  <p className="font-medium text-gray-700 truncate">{selectedCost.client?.name}</p>
                  <p className="text-gray-500 text-xs truncate">{selectedCost.site?.siteName}</p>
                  <p className="text-gray-500 text-xs">{formatMonth(selectedCost.month)}</p>
                </div>
              )}

              {/* Form error */}
              {formError && (
                <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-100 rounded-lg p-3 mb-4 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Client */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Building2 size={12} /> Client *</span>
                  </label>
                  <select
                    className="select w-full"
                    value={form.clientId}
                    onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                    required
                  >
                    <option value="">Select client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Site */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><MapPin size={12} /> Site *</span>
                  </label>
                  <select
                    className="select w-full"
                    value={form.siteId}
                    onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
                    required
                    disabled={!form.clientId}
                  >
                    <option value="">{form.clientId ? "Select site…" : "Select a client first"}</option>
                    {formSites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteName}</option>
                    ))}
                  </select>
                </div>

                {/* Month */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Calendar size={12} /> Month *</span>
                  </label>
                  <input
                    type="month"
                    className="input w-full"
                    value={form.month}
                    onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Tag size={12} /> Cost Category *</span>
                  </label>
                  <select
                    className="select w-full"
                    value={form.costCategory}
                    onChange={(e) => setForm((f) => ({ ...f, costCategory: e.target.value }))}
                    required={form.costCategory !== "Other"}
                  >
                    <option value="">Select category…</option>
                    {SUGGESTED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {/* Custom category input when "Other" selected or not in list */}
                  {(form.costCategory === "Other" || (form.costCategory && !SUGGESTED_CATEGORIES.includes(form.costCategory))) && (
                    <input
                      type="text"
                      className="input w-full mt-2"
                      placeholder="Describe category…"
                      value={form.customCategory}
                      onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                    />
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><DollarSign size={12} /> Amount (ZMW) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input w-full"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><FileText size={12} /> Description</span>
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Brief description of the expense"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                  <textarea
                    className="input w-full resize-none"
                    rows={3}
                    placeholder="Additional notes…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : panelMode === "add" ? "Add Entry" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closePanel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
