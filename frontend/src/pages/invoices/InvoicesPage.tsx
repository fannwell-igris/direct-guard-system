import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
  MapPin,
  Calendar,
  FileText,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

interface Client {
  id: string;
  name: string;
}

interface Site {
  id: string;
  siteName: string;
  clientId?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  siteId: string | null;
  invoiceDate: string;
  billingPeriod: string | null;
  dueDate: string;
  amount: string | number;
  amountPaid: string | number;
  outstandingBalance: string | number;
  status: InvoiceStatus;
  notes: string | null;
  client: { id: string; name: string };
  site: { id: string; siteName: string } | null;
  _count?: { payments: number };
}

interface Payment {
  id: string;
  invoiceId: string;
  clientId: string;
  paymentDate: string;
  amount: string | number;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const PAGE_SIZE = 20;

const STATUS_TABS: { label: string; value: InvoiceStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Issued", value: "ISSUED" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Partial", value: "PARTIALLY_PAID" },
  { label: "Paid", value: "PAID" },
  { label: "Cancelled", value: "CANCELLED" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number | null | undefined): string {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return `ZMW ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-ZM", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().slice(0, 10);
}

function statusConfig(status: InvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", bg: "bg-gray-100 text-gray-600 border-gray-200", icon: <FileText size={11} /> };
    case "ISSUED":
      return { label: "Issued", bg: "bg-blue-50 text-blue-700 border-blue-100", icon: <Send size={11} /> };
    case "PARTIALLY_PAID":
      return { label: "Partial", bg: "bg-amber-50 text-amber-700 border-amber-100", icon: <Clock size={11} /> };
    case "PAID":
      return { label: "Paid", bg: "bg-magen-green-light text-magen-green-dark border-magen-green/20", icon: <CheckCircle2 size={11} /> };
    case "OVERDUE":
      return { label: "Overdue", bg: "bg-red-50 text-red-700 border-red-100", icon: <AlertTriangle size={11} /> };
    case "CANCELLED":
      return { label: "Cancelled", bg: "bg-gray-100 text-gray-400 border-gray-200 line-through", icon: <XCircle size={11} /> };
  }
}

function paidPercent(inv: Invoice): number {
  const total = Number(inv.amount);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(inv.amountPaid) / total) * 100));
}

// ─── Blank forms ──────────────────────────────────────────────────────────────

interface InvoiceForm {
  clientId: string;
  siteId: string;
  invoiceDate: string;
  dueDate: string;
  billingPeriod: string;
  amount: string;
  notes: string;
}

function blankInvoiceForm(): InvoiceForm {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  return { clientId: "", siteId: "", invoiceDate: today, dueDate: due, billingPeriod: "", amount: "", notes: "" };
}

interface PaymentForm {
  paymentDate: string;
  amount: string;
  paymentMethod: string;
  reference: string;
  notes: string;
}

function blankPaymentForm(): PaymentForm {
  return { paymentDate: new Date().toISOString().slice(0, 10), amount: "", paymentMethod: "", reference: "", notes: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { token } = useAuth();
  const authHeader = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── list state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── filter state
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [clientFilter, setClientFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // ── reference data
  const [clients, setClients] = useState<Client[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [filteredSites, setFilteredSites] = useState<Site[]>([]);

  // ── detail panel
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── invoice form (add / edit)
  const [invoicePanel, setInvoicePanel] = useState<"none" | "add" | "edit">("none");
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(blankInvoiceForm());
  const [formSites, setFormSites] = useState<Site[]>([]);
  const [invoiceFormError, setInvoiceFormError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  // ── payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(blankPaymentForm());
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  // ── action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ─── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/clients?pageSize=200`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setClients(j.data ?? []))
      .catch(() => {});

    fetch(`${API}/sites?pageSize=500`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setAllSites(j.data ?? []))
      .catch(() => {});
  }, []);

  // ─── Scope filter sites to selected client ────────────────────────────────
  useEffect(() => {
    if (clientFilter) {
      setFilteredSites(allSites.filter((s) => s.clientId === clientFilter));
      setSiteFilter("");
    } else {
      setFilteredSites(allSites);
    }
  }, [clientFilter, allSites]);

  // ─── Scope form sites to form's client ───────────────────────────────────
  useEffect(() => {
    setFormSites(allSites.filter((s) => !invoiceForm.clientId || s.clientId === invoiceForm.clientId));
    setInvoiceForm((f) => ({ ...f, siteId: "" }));
  }, [invoiceForm.clientId, allSites]);

  // ─── Reload on filter / page change ──────────────────────────────────────
  useEffect(() => {
    setPage(1);
    loadInvoices(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, clientFilter, siteFilter]);

  useEffect(() => {
    loadInvoices(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadInvoices(p: number) {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (statusFilter) params.set("status", statusFilter);
      if (clientFilter) params.set("clientId", clientFilter);
      if (siteFilter) params.set("siteId", siteFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`${API}/invoices?${params}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setInvoices(json.data ?? []);
      setPagination(json.pagination ?? { page: p, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  // ─── Invoice detail ───────────────────────────────────────────────────────
  async function loadInvoiceDetail(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    setPayments([]);
    setShowPaymentForm(false);
    setActionError(null);
    try {
      const res = await fetch(`${API}/invoices/${id}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      const inv = json.data;
      setSelectedInvoice(inv);
      setPayments(inv?.payments ?? []);
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : "Failed to load invoice.");
    } finally {
      setDetailLoading(false);
    }
  }

  function selectInvoice(inv: Invoice) {
    if (selectedInvoice?.id === inv.id) {
      setSelectedInvoice(null);
      setInvoicePanel("none");
      return;
    }
    setInvoicePanel("none");
    loadInvoiceDetail(inv.id);
  }

  // ─── Invoice form ─────────────────────────────────────────────────────────
  function openAddPanel() {
    setSelectedInvoice(null);
    setInvoiceForm(blankInvoiceForm());
    setInvoiceFormError(null);
    setInvoicePanel("add");
  }

  function openEditPanel(inv: Invoice) {
    setInvoiceForm({
      clientId: inv.clientId,
      siteId: inv.siteId ?? "",
      invoiceDate: toDateInput(inv.invoiceDate),
      dueDate: toDateInput(inv.dueDate),
      billingPeriod: inv.billingPeriod ?? "",
      amount: String(Number(inv.amount)),
      notes: inv.notes ?? "",
    });
    setInvoiceFormError(null);
    setInvoicePanel("edit");
  }

  async function handleInvoiceSubmit(e: FormEvent) {
    e.preventDefault();
    setInvoiceFormError(null);
    if (!invoiceForm.clientId) return setInvoiceFormError("Please select a client.");
    if (!invoiceForm.invoiceDate) return setInvoiceFormError("Invoice date is required.");
    if (!invoiceForm.dueDate) return setInvoiceFormError("Due date is required.");
    if (!invoiceForm.amount || Number(invoiceForm.amount) <= 0) return setInvoiceFormError("Enter a valid amount.");

    const payload = {
      clientId: invoiceForm.clientId,
      siteId: invoiceForm.siteId || null,
      invoiceDate: invoiceForm.invoiceDate,
      dueDate: invoiceForm.dueDate,
      billingPeriod: invoiceForm.billingPeriod || null,
      amount: Number(invoiceForm.amount),
      notes: invoiceForm.notes || null,
    };

    setInvoiceSaving(true);
    try {
      const isEdit = invoicePanel === "edit" && selectedInvoice;
      const url = isEdit ? `${API}/invoices/${selectedInvoice!.id}` : `${API}/invoices`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      const savedJson = await res.json();
      setInvoicePanel("none");
      loadInvoices(page);
      loadInvoiceDetail(savedJson.data.id);
    } catch (e: unknown) {
      setInvoiceFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setInvoiceSaving(false);
    }
  }

  // ─── Issue / Cancel ───────────────────────────────────────────────────────
  async function handleIssue() {
    if (!selectedInvoice) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API}/invoices/${selectedInvoice.id}/issue`, { method: "POST", headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      await loadInvoiceDetail(selectedInvoice.id);
      loadInvoices(page);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!selectedInvoice) return;
    if (!window.confirm(`Cancel invoice ${selectedInvoice.invoiceNumber}? This cannot be undone.`)) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API}/invoices/${selectedInvoice.id}/cancel`, { method: "POST", headers: authHeader });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      await loadInvoiceDetail(selectedInvoice.id);
      loadInvoices(page);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Payment form ─────────────────────────────────────────────────────────
  async function handlePaymentSubmit(e: FormEvent) {
    e.preventDefault();
    setPaymentFormError(null);
    if (!selectedInvoice) return;
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return setPaymentFormError("Enter a valid amount.");
    if (!paymentForm.paymentDate) return setPaymentFormError("Payment date is required.");

    setPaymentSaving(true);
    try {
      const res = await fetch(`${API}/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          paymentDate: paymentForm.paymentDate,
          amount: Number(paymentForm.amount),
          paymentMethod: paymentForm.paymentMethod || null,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      setShowPaymentForm(false);
      setPaymentForm(blankPaymentForm());
      await loadInvoiceDetail(selectedInvoice.id);
      loadInvoices(page);
    } catch (e: unknown) {
      setPaymentFormError(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setPaymentSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-magen-navy">Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Billing, payment tracking and outstanding balances</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAddPanel}>
          <Plus size={16} />
          New Invoice
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mt-5 border-b border-gray-200 overflow-x-auto pb-px">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={
              "px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 -mb-px " +
              (statusFilter === tab.value
                ? "border-magen-green text-magen-green-dark bg-magen-green-light/40"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 mt-5">
        {/* ── Left: filters + list ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Filter row */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              className="select"
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            >
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              className="select"
              value={siteFilter}
              onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
            >
              <option value="">All sites</option>
              {filteredSites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
            </select>

            <input
              type="date"
              className="input"
              title="From date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
            <input
              type="date"
              className="input"
              title="To date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />

            {(clientFilter || siteFilter || dateFrom || dateTo) && (
              <button
                className="btn-secondary text-sm"
                onClick={() => { setClientFilter(""); setSiteFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              >
                Clear
              </button>
            )}

            <span className="ml-auto text-sm text-gray-500 self-center">
              {pagination.total} invoice{pagination.total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Error */}
          {listError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl p-4 mb-4 text-sm">
              <AlertCircle size={16} className="shrink-0" /> {listError}
            </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {loading ? (
              <div className="card p-12 text-center text-gray-400 text-sm">Loading…</div>
            ) : invoices.length === 0 ? (
              <div className="card p-12 text-center">
                <FileText size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">No invoices found</p>
                <p className="text-xs text-gray-400 mt-1">Create the first invoice with the button above.</p>
              </div>
            ) : (
              invoices.map((inv) => {
                const cfg = statusConfig(inv.status);
                const pct = paidPercent(inv);
                const isSelected = selectedInvoice?.id === inv.id;
                return (
                  <div
                    key={inv.id}
                    onClick={() => selectInvoice(inv)}
                    className={
                      "card p-4 cursor-pointer hover:border-magen-green/30 hover:shadow-md transition-all " +
                      (isSelected ? "border-magen-green/60 ring-1 ring-magen-green/30" : "")
                    }
                  >
                    <div className="flex items-start gap-4">
                      {/* Invoice number + status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-magen-navy text-sm">{inv.invoiceNumber}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                          {inv._count?.payments ? (
                            <span className="text-xs text-gray-400">{inv._count.payments} payment{inv._count.payments !== 1 ? "s" : ""}</span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><Building2 size={11} />{inv.client?.name}</span>
                          {inv.site && <span className="flex items-center gap-1"><MapPin size={11} />{inv.site.siteName}</span>}
                          <span className="flex items-center gap-1"><Calendar size={11} />Issued {formatDate(inv.invoiceDate)}</span>
                          <span className="flex items-center gap-1"><Calendar size={11} />Due {formatDate(inv.dueDate)}</span>
                          {inv.billingPeriod && <span className="text-gray-400">· {inv.billingPeriod}</span>}
                        </div>

                        {/* Progress bar */}
                        {inv.status !== "DRAFT" && inv.status !== "CANCELLED" && (
                          <div className="mt-2">
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                              <div
                                className={`h-full rounded-full transition-all ${inv.status === "PAID" ? "bg-magen-green" : "bg-amber-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {pct}% paid · Outstanding {formatCurrency(inv.outstandingBalance)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-800">{formatCurrency(inv.amount)}</p>
                        {Number(inv.amountPaid) > 0 && (
                          <p className="text-xs text-magen-green-dark mt-0.5">
                            {formatCurrency(inv.amountPaid)} paid
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <div className="flex items-center gap-1">
                <button className="btn-secondary p-2" disabled={pagination.page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? "bg-magen-navy text-white" : "hover:bg-gray-100 text-gray-600"}`}
                  >
                    {p}
                  </button>
                ))}
                <button className="btn-secondary p-2" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        {(invoicePanel !== "none" || selectedInvoice) && (
          <div className="w-96 shrink-0">

            {/* ── Invoice Form (Add / Edit) ── */}
            {invoicePanel !== "none" && (
              <div className="card p-5 mb-4 sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-magen-navy">
                    {invoicePanel === "add" ? "New Invoice" : "Edit Invoice"}
                  </h2>
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" onClick={() => setInvoicePanel("none")}>
                    <X size={16} />
                  </button>
                </div>

                {invoiceFormError && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-100 rounded-lg p-3 mb-4 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> {invoiceFormError}
                  </div>
                )}

                <form onSubmit={handleInvoiceSubmit} className="space-y-3">
                  {/* Client — only editable on create */}
                  {invoicePanel === "add" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Client *</label>
                      <select
                        className="select w-full"
                        value={invoiceForm.clientId}
                        onChange={(e) => setInvoiceForm((f) => ({ ...f, clientId: e.target.value }))}
                        required
                      >
                        <option value="">Select client…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Site */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Site (optional)</label>
                    <select
                      className="select w-full"
                      value={invoiceForm.siteId}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, siteId: e.target.value }))}
                      disabled={invoicePanel === "add" && !invoiceForm.clientId}
                    >
                      <option value="">{invoicePanel === "add" && !invoiceForm.clientId ? "Select a client first" : "No specific site"}</option>
                      {formSites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
                    </select>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Date *</label>
                      <input type="date" className="input w-full" value={invoiceForm.invoiceDate}
                        onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceDate: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Due Date *</label>
                      <input type="date" className="input w-full" value={invoiceForm.dueDate}
                        onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))} required />
                    </div>
                  </div>

                  {/* Billing period */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Billing Period</label>
                    <input type="text" className="input w-full" placeholder="e.g. September 2026"
                      value={invoiceForm.billingPeriod}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, billingPeriod: e.target.value }))} />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (ZMW) *</label>
                    <input type="number" step="0.01" min="0.01" className="input w-full" placeholder="0.00"
                      value={invoiceForm.amount}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))} required />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                    <textarea className="input w-full resize-none" rows={2} placeholder="Optional notes…"
                      value={invoiceForm.notes}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="btn-primary flex-1" disabled={invoiceSaving}>
                      {invoiceSaving ? "Saving…" : invoicePanel === "add" ? "Create Invoice" : "Save Changes"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setInvoicePanel("none")} disabled={invoiceSaving}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Invoice Detail ── */}
            {selectedInvoice && (
              <div className="card p-5 sticky top-6">
                {detailLoading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
                ) : detailError ? (
                  <div className="flex items-center gap-2 text-red-600 text-sm"><AlertCircle size={15} />{detailError}</div>
                ) : (
                  <>
                    {/* Invoice header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-lg font-bold text-magen-navy">{selectedInvoice.invoiceNumber}</p>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border mt-1 ${statusConfig(selectedInvoice.status).bg}`}>
                          {statusConfig(selectedInvoice.status).icon}
                          {statusConfig(selectedInvoice.status).label}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-800">{formatCurrency(selectedInvoice.amount)}</p>
                        {Number(selectedInvoice.outstandingBalance) > 0 && selectedInvoice.status !== "CANCELLED" && (
                          <p className="text-xs text-red-500 mt-0.5">{formatCurrency(selectedInvoice.outstandingBalance)} outstanding</p>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="space-y-1.5 text-sm mb-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        {selectedInvoice.client?.name}
                      </div>
                      {selectedInvoice.site && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin size={14} className="text-gray-400 shrink-0" />
                          {selectedInvoice.site.siteName}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar size={14} className="text-gray-400 shrink-0" />
                        Issued {formatDate(selectedInvoice.invoiceDate)}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock size={14} className={`shrink-0 ${selectedInvoice.status === "OVERDUE" ? "text-red-400" : "text-gray-400"}`} />
                        Due {formatDate(selectedInvoice.dueDate)}
                      </div>
                      {selectedInvoice.billingPeriod && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <FileText size={14} className="text-gray-400 shrink-0" />
                          {selectedInvoice.billingPeriod}
                        </div>
                      )}
                    </div>

                    {/* Payment progress */}
                    {selectedInvoice.status !== "CANCELLED" && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>Paid: {formatCurrency(selectedInvoice.amountPaid)}</span>
                          <span>{paidPercent(selectedInvoice)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${selectedInvoice.status === "PAID" ? "bg-magen-green" : "bg-amber-400"}`}
                            style={{ width: `${paidPercent(selectedInvoice)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                          <span>Outstanding: {formatCurrency(selectedInvoice.outstandingBalance)}</span>
                          <span>Total: {formatCurrency(selectedInvoice.amount)}</span>
                        </div>
                      </div>
                    )}

                    {/* Action error */}
                    {actionError && (
                      <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-100 rounded-lg p-3 mb-3 text-sm">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" /> {actionError}
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {selectedInvoice.status !== "CANCELLED" && (
                        <button
                          className="btn-secondary text-xs flex items-center gap-1"
                          onClick={() => openEditPanel(selectedInvoice)}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      )}
                      {selectedInvoice.status === "DRAFT" && (
                        <button
                          className="btn-primary text-xs flex items-center gap-1"
                          onClick={handleIssue}
                          disabled={actionLoading}
                        >
                          <Send size={12} /> Issue
                        </button>
                      )}
                      {(selectedInvoice.status === "ISSUED" || selectedInvoice.status === "OVERDUE" || selectedInvoice.status === "PARTIALLY_PAID") && (
                        <button
                          className="btn-primary text-xs flex items-center gap-1"
                          onClick={() => { setShowPaymentForm(true); setPaymentForm(f => ({ ...f, amount: String(Number(selectedInvoice.outstandingBalance)) })); }}
                        >
                          <CreditCard size={12} /> Record Payment
                        </button>
                      )}
                      {(selectedInvoice.status === "DRAFT" || selectedInvoice.status === "ISSUED") && Number(selectedInvoice.amountPaid) === 0 && (
                        <button
                          className="btn-danger text-xs flex items-center gap-1"
                          onClick={handleCancel}
                          disabled={actionLoading}
                        >
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                    </div>

                    {/* Record payment form */}
                    {showPaymentForm && (
                      <div className="border border-magen-green/20 bg-magen-green-light/30 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-magen-navy">Record Payment</p>
                          <button className="text-gray-400 hover:text-gray-600" onClick={() => setShowPaymentForm(false)}>
                            <X size={14} />
                          </button>
                        </div>

                        {paymentFormError && (
                          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 mb-3">
                            {paymentFormError}
                          </div>
                        )}

                        <form onSubmit={handlePaymentSubmit} className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Date *</label>
                              <input type="date" className="input w-full text-sm" value={paymentForm.paymentDate}
                                onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} required />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (ZMW) *</label>
                              <input type="number" step="0.01" min="0.01" className="input w-full text-sm" placeholder="0.00"
                                value={paymentForm.amount}
                                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} required />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Method</label>
                            <select className="select w-full text-sm" value={paymentForm.paymentMethod}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                              <option value="">Select method…</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                              <option value="Cash">Cash</option>
                              <option value="Cheque">Cheque</option>
                              <option value="Mobile Money">Mobile Money</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Reference</label>
                            <input type="text" className="input w-full text-sm" placeholder="Transaction ref, cheque no…"
                              value={paymentForm.reference}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                            <input type="text" className="input w-full text-sm" placeholder="Optional…"
                              value={paymentForm.notes}
                              onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button type="submit" className="btn-primary flex-1 text-sm" disabled={paymentSaving}>
                              {paymentSaving ? "Saving…" : "Record"}
                            </button>
                            <button type="button" className="btn-secondary text-sm" onClick={() => setShowPaymentForm(false)}>Cancel</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Payments list */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Payment History
                        {payments.length > 0 && <span className="ml-1 font-normal normal-case text-gray-400">({payments.length})</span>}
                      </p>
                      {payments.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No payments recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {payments.map((pmt) => (
                            <div key={pmt.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-gray-700">{formatCurrency(pmt.amount)}</p>
                                <p className="text-xs text-gray-400">{formatDate(pmt.paymentDate)}</p>
                                {pmt.paymentMethod && <p className="text-xs text-gray-400">{pmt.paymentMethod}</p>}
                                {pmt.reference && <p className="text-xs text-gray-400">Ref: {pmt.reference}</p>}
                              </div>
                              {pmt.notes && <p className="text-xs text-gray-400 text-right max-w-[120px]">{pmt.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {selectedInvoice.notes && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                        <p className="text-sm text-gray-600">{selectedInvoice.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
