import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Building2,
  MapPin,
  Calendar,
  Tag,
  DollarSign,
  FileText,
  AlertCircle,
  Wallet,
} from "lucide-react";
import Modal from "../../components/ui/Modal";

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

interface Department {
  id: string;
  name: string;
}

// General expenses — money spent that isn't tied to a specific client/site
// (e.g. a supervisor's fuel money, head-office supplies). Added 2026-09-25;
// the backend module already existed but had no UI to create entries with.
interface GeneralExpense {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description?: string | null;
  notes?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
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

// ─── General Expenses: form state ─────────────────────────────────────────────

interface GeneralExpenseFormState {
  expenseDate: string; // "YYYY-MM-DD"
  departmentId: string;
  category: string;
  customCategory: string;
  amount: string;
  description: string;
  notes: string;
}

function todayInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function blankGeneralExpenseForm(): GeneralExpenseFormState {
  return {
    expenseDate: todayInput(),
    departmentId: "",
    category: "",
    customCategory: "",
    amount: "",
    description: "",
    notes: "",
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-ZM", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OperationalCostsPage() {
  const { token, user } = useAuth();
  // Only Admin and Payroll (this system's Finance role) can create/edit operational costs.
  const canEdit = user?.role === "ADMIN" || user?.role === "PAYROLL";
  const authHeader = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── tab: Operational Costs (per-site) vs General Expenses (not tied to a site)
  const [viewTab, setViewTab] = useState<"operational" | "general">("operational");
  const [departments, setDepartments] = useState<Department[]>([]);

  // ── list state
  const [costs, setCosts] = useState<OperationalCost[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── filter state
  const [clientFilter, setClientFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Default to current month so the list opens showing this month's costs.
  const currentMonthValue = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [monthFrom, setMonthFrom] = useState(currentMonthValue);
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

  // ── General Expenses: list/filter/panel state
  const [genExpenses, setGenExpenses] = useState<GeneralExpense[]>([]);
  const [genPagination, setGenPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genDepartmentFilter, setGenDepartmentFilter] = useState("");
  const [genCategoryFilter, setGenCategoryFilter] = useState("");
  const [genPage, setGenPage] = useState(1);
  const [genPanelMode, setGenPanelMode] = useState<"none" | "add" | "edit">("none");
  const [genEditingId, setGenEditingId] = useState<string | null>(null);
  const [selectedGenExpense, setSelectedGenExpense] = useState<GeneralExpense | null>(null);
  const [genForm, setGenForm] = useState<GeneralExpenseFormState>(blankGeneralExpenseForm());
  const [genSaving, setGenSaving] = useState(false);
  const [genFormError, setGenFormError] = useState<string | null>(null);

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

    fetch(`${API}/departments?pageSize=200`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setDepartments(j.data ?? []))
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
    setMonthFrom(currentMonthValue);
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

  // "Has filters" is true when anything is set beyond the default (current month, no other filters).
  const hasFilters =
    clientFilter ||
    siteFilter ||
    categoryFilter ||
    monthFrom !== currentMonthValue ||
    monthTo;
  const pageTotal = totalAmount(costs);

  // ═══════════════════════════════════════════════════════════════════════════
  // General Expenses
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (viewTab === "general") loadGenExpenses(genPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab, genDepartmentFilter, genCategoryFilter, genPage]);

  async function loadGenExpenses(overridePage?: number) {
    const p = overridePage ?? genPage;
    setGenLoading(true);
    setGenError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (genDepartmentFilter) params.set("departmentId", genDepartmentFilter);
      if (genCategoryFilter) params.set("category", genCategoryFilter);

      const res = await fetch(`${API}/general-expenses?${params}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setGenExpenses(json.data ?? []);
      setGenPagination(json.pagination ?? { page: p, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Failed to load general expenses.");
    } finally {
      setGenLoading(false);
    }
  }

  function applyGenFilters() {
    setGenPage(1);
    loadGenExpenses(1);
  }

  function clearGenFilters() {
    setGenDepartmentFilter("");
    setGenCategoryFilter("");
    setGenPage(1);
  }

  function openGenAddPanel() {
    setGenForm(blankGeneralExpenseForm());
    setGenFormError(null);
    setGenEditingId(null);
    setSelectedGenExpense(null);
    setGenPanelMode("add");
  }

  function openGenEditPanel(exp: GeneralExpense) {
    setGenForm({
      expenseDate: exp.expenseDate.slice(0, 10),
      departmentId: exp.departmentId ?? "",
      category: SUGGESTED_CATEGORIES.includes(exp.category) ? exp.category : "Other",
      customCategory: SUGGESTED_CATEGORIES.includes(exp.category) ? "" : exp.category,
      amount: String(Number(exp.amount)),
      description: exp.description ?? "",
      notes: exp.notes ?? "",
    });
    setGenFormError(null);
    setGenEditingId(exp.id);
    setSelectedGenExpense(exp);
    setGenPanelMode("edit");
  }

  function closeGenPanel() {
    setGenPanelMode("none");
    setGenEditingId(null);
    setSelectedGenExpense(null);
    setGenFormError(null);
  }

  async function handleGenSubmit(e: FormEvent) {
    e.preventDefault();
    setGenFormError(null);

    const resolvedCategory =
      genForm.category === "Other" || !SUGGESTED_CATEGORIES.includes(genForm.category)
        ? genForm.customCategory.trim()
        : genForm.category;

    if (!genForm.expenseDate) return setGenFormError("Please select a date.");
    if (!resolvedCategory) return setGenFormError("Please enter a category.");
    if (!genForm.amount || isNaN(Number(genForm.amount)) || Number(genForm.amount) <= 0)
      return setGenFormError("Please enter a valid amount greater than zero.");

    const payload = {
      expenseDate: genForm.expenseDate,
      departmentId: genForm.departmentId || null,
      category: resolvedCategory,
      amount: Number(genForm.amount),
      description: genForm.description.trim() || null,
      notes: genForm.notes.trim() || null,
    };

    setGenSaving(true);
    try {
      const url = genPanelMode === "edit" && genEditingId
        ? `${API}/general-expenses/${genEditingId}`
        : `${API}/general-expenses`;
      const method = genPanelMode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, { method, headers: jsonHeaders, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }

      closeGenPanel();
      loadGenExpenses(genPage);
    } catch (e: unknown) {
      setGenFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setGenSaving(false);
    }
  }

  const hasGenFilters = genDepartmentFilter || genCategoryFilter;
  const genPageTotal = genExpenses.reduce((sum, r) => sum + Number(r.amount), 0);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-magen-navy">
            {viewTab === "operational" ? "Operational Costs" : "General Expenses"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewTab === "operational"
              ? "Track per-site expenses by month and category"
              : "Expenses that aren't tied to a specific client or site (fuel money, head-office supplies, etc.)"}
          </p>
        </div>
        {canEdit && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={viewTab === "operational" ? openAddPanel : openGenAddPanel}
          >
            <Plus size={16} />
            {viewTab === "operational" ? "Add Cost Entry" : "Add Expense"}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mt-4 border-b border-gray-200">
        <button
          className={
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
            (viewTab === "operational"
              ? "border-magen-green text-magen-navy"
              : "border-transparent text-gray-400 hover:text-gray-600")
          }
          onClick={() => setViewTab("operational")}
        >
          <MapPin size={14} /> Operational Costs
        </button>
        <button
          className={
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
            (viewTab === "general"
              ? "border-magen-green text-magen-navy"
              : "border-transparent text-gray-400 hover:text-gray-600")
          }
          onClick={() => setViewTab("general")}
        >
          <Wallet size={14} /> General Expenses
        </button>
      </div>

      {viewTab === "operational" ? (
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
                          {canEdit && (
                            <button
                              className="p-1.5 rounded-lg text-gray-400 hover:text-magen-green hover:bg-magen-green-light transition-colors"
                              title="Edit"
                              onClick={() => openEditPanel(cost)}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
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

        {/* ── Add / Edit panel — modal ────────────────────────────────────── */}
        {panelMode !== "none" && (
          <Modal
            title={panelMode === "add" ? "Add Cost Entry" : "Edit Cost Entry"}
            onClose={closePanel}
            widthClass="max-w-md"
          >
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
          </Modal>
        )}
      </div>
      ) : (
      <div className="flex gap-6 mt-6">
        {/* ── Left: filters + list ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Filter row */}
          <div className="card p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Department */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
                <select
                  className="select w-full"
                  value={genDepartmentFilter}
                  onChange={(e) => { setGenDepartmentFilter(e.target.value); setGenPage(1); }}
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
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
                  value={genCategoryFilter}
                  onChange={(e) => setGenCategoryFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyGenFilters()}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button className="btn-primary text-sm py-1.5" onClick={applyGenFilters}>
                Apply filters
              </button>
              {hasGenFilters && (
                <button className="btn-secondary text-sm py-1.5" onClick={clearGenFilters}>
                  Clear
                </button>
              )}
              {hasGenFilters && genExpenses.length > 0 && (
                <span className="ml-auto text-sm text-gray-500">
                  Showing {genPagination.total} result{genPagination.total !== 1 ? "s" : ""} ·{" "}
                  <span className="font-semibold text-gray-700">
                    Page total: {formatCurrency(genPageTotal)}
                  </span>
                </span>
              )}
            </div>
          </div>

          {genError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl p-4 mb-4 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {genError}
            </div>
          )}

          <div className="card overflow-hidden">
            {genLoading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
            ) : genExpenses.length === 0 ? (
              <div className="p-12 text-center">
                <Wallet size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">No general expenses found</p>
                <p className="text-xs text-gray-400 mt-1">
                  {hasGenFilters ? "Try clearing the filters." : "Add the first entry with the button above."}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Date</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Department</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Category</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Amount</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Description</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {genExpenses.map((exp) => (
                      <tr
                        key={exp.id}
                        className={
                          "hover:bg-gray-50/70 transition-colors cursor-pointer " +
                          (genEditingId === exp.id ? "bg-magen-green-light/40" : "")
                        }
                        onClick={() => openGenEditPanel(exp)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                            <Calendar size={13} className="text-gray-400 shrink-0" />
                            {formatDate(exp.expenseDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Building2 size={13} className="text-gray-400 shrink-0" />
                            {exp.department?.name ?? "General / not department-specific"}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 text-xs font-medium px-2 py-0.5 rounded-full">
                            <Tag size={10} />
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="font-semibold text-gray-800">{formatCurrency(exp.amount)}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-gray-500 truncate text-xs">{exp.description || "—"}</p>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <button
                              className="p-1.5 rounded-lg text-gray-400 hover:text-magen-green hover:bg-magen-green-light transition-colors"
                              title="Edit"
                              onClick={() => openGenEditPanel(exp)}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {genExpenses.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Page total ({genExpenses.length} entr{genExpenses.length !== 1 ? "ies" : "y"})
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-800">{formatCurrency(genPageTotal)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {genPagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>
                Page {genPagination.page} of {genPagination.totalPages} · {genPagination.total} total entr{genPagination.total !== 1 ? "ies" : "y"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary p-2"
                  disabled={genPagination.page <= 1}
                  onClick={() => setGenPage(genPagination.page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(genPagination.totalPages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      className={
                        "w-8 h-8 rounded-lg text-sm font-medium transition-colors " +
                        (p === genPagination.page ? "bg-magen-navy text-white" : "hover:bg-gray-100 text-gray-600")
                      }
                      onClick={() => setGenPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="btn-secondary p-2"
                  disabled={genPagination.page >= genPagination.totalPages}
                  onClick={() => setGenPage(genPagination.page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Add / Edit panel — modal ────────────────────────────────────── */}
        {genPanelMode !== "none" && (
          <Modal
            title={genPanelMode === "add" ? "Add Expense" : "Edit Expense"}
            onClose={closeGenPanel}
            widthClass="max-w-md"
          >
              {genPanelMode === "edit" && selectedGenExpense && (
                <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm">
                  <p className="font-medium text-gray-700">{selectedGenExpense.department?.name ?? "General / not department-specific"}</p>
                  <p className="text-gray-500 text-xs">{formatDate(selectedGenExpense.expenseDate)}</p>
                </div>
              )}

              {genFormError && (
                <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-100 rounded-lg p-3 mb-4 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {genFormError}
                </div>
              )}

              <form onSubmit={handleGenSubmit} className="space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Calendar size={12} /> Date *</span>
                  </label>
                  <input
                    type="date"
                    className="input w-full"
                    value={genForm.expenseDate}
                    onChange={(e) => setGenForm((f) => ({ ...f, expenseDate: e.target.value }))}
                    required
                  />
                </div>

                {/* Department (optional) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Building2 size={12} /> Department</span>
                  </label>
                  <select
                    className="select w-full"
                    value={genForm.departmentId}
                    onChange={(e) => setGenForm((f) => ({ ...f, departmentId: e.target.value }))}
                  >
                    <option value="">Not department-specific</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    <span className="flex items-center gap-1"><Tag size={12} /> Category *</span>
                  </label>
                  <select
                    className="select w-full"
                    value={genForm.category}
                    onChange={(e) => setGenForm((f) => ({ ...f, category: e.target.value }))}
                    required={genForm.category !== "Other"}
                  >
                    <option value="">Select category…</option>
                    {SUGGESTED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {(genForm.category === "Other" || (genForm.category && !SUGGESTED_CATEGORIES.includes(genForm.category))) && (
                    <input
                      type="text"
                      className="input w-full mt-2"
                      placeholder="Describe category…"
                      value={genForm.customCategory}
                      onChange={(e) => setGenForm((f) => ({ ...f, customCategory: e.target.value }))}
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
                    value={genForm.amount}
                    onChange={(e) => setGenForm((f) => ({ ...f, amount: e.target.value }))}
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
                    placeholder="e.g. Fuel money for supervisor site visits"
                    value={genForm.description}
                    onChange={(e) => setGenForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                  <textarea
                    className="input w-full resize-none"
                    rows={3}
                    placeholder="Additional notes…"
                    value={genForm.notes}
                    onChange={(e) => setGenForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn-primary flex-1" disabled={genSaving}>
                    {genSaving ? "Saving…" : genPanelMode === "add" ? "Add Entry" : "Save Changes"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={closeGenPanel} disabled={genSaving}>
                    Cancel
                  </button>
                </div>
              </form>
          </Modal>
        )}
      </div>
      )}
    </div>
  );
}
