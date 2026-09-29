import { useEffect, useState, useCallback } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  MapPin,
  Calendar,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Trash2,
  Printer,
  Minus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import Modal from "../../components/ui/Modal";
import { requestPasswordConfirmation } from "../../lib/passwordConfirmController";
import magenLogoUrl from "../../assets/magen-logo.svg";

// ─── Company details for printable quotation ──────────────────────────────────
const COMPANY_TPIN = "2503459511";
const COMPANY_ADDRESS_LINES = ["13 Kabulonga Road,", "100/608, Ibex Hill Lusaka."];
const COMPANY_WEBSITE = "www.magensecurityltd.com";
const COMPANY_PHONES = ["+260 760-271807", "+260 974-763639"];
const COMPANY_EMAILS = ["info@magensecurityltd.com", "sales@magensecurityltd.com"];

// ─── Types ────────────────────────────────────────────────────────────────────

type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

interface LineItem {
  description: string;
  amount: number;
}

interface Quotation {
  id: string;
  quotationNumber: string;
  customerName: string;
  customerLocation: string | null;
  quotationDate: string;
  validUntil: string | null;
  lineItems: LineItem[];
  discount: string | number | null;
  amount: string | number;
  preparedBy: string;
  status: QuotationStatus;
  notes: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface LineItemDraft {
  description: string;
  amount: string;
}

interface FormState {
  customerName: string;
  customerLocation: string;
  quotationDate: string;
  validUntil: string;
  lineItems: LineItemDraft[];
  discount: string;
  notes: string;
  startingNumber: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const PAGE_SIZE = 20;

const STATUS_TABS: { label: string; value: QuotationStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Sent", value: "SENT" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Expired", value: "EXPIRED" },
];

const EMPTY_LINE_ITEM: LineItemDraft = { description: "", amount: "" };

const EMPTY_FORM: FormState = {
  customerName: "",
  customerLocation: "",
  quotationDate: new Date().toISOString().slice(0, 10),
  validUntil: "",
  lineItems: [{ ...EMPTY_LINE_ITEM }],
  discount: "",
  notes: "",
  startingNumber: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number | null | undefined): string {
  const n = Number(val);
  if (isNaN(n)) return "—";
  return `K ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-ZM", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().slice(0, 10);
}

function statusConfig(status: QuotationStatus) {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", bg: "bg-gray-100 text-gray-600 border-gray-200", icon: <FileText size={11} /> };
    case "SENT":
      return { label: "Sent", bg: "bg-blue-50 text-blue-700 border-blue-100", icon: <Send size={11} /> };
    case "ACCEPTED":
      return { label: "Accepted", bg: "bg-green-50 text-green-700 border-green-100", icon: <CheckCircle2 size={11} /> };
    case "REJECTED":
      return { label: "Rejected", bg: "bg-red-50 text-red-600 border-red-100", icon: <XCircle size={11} /> };
    case "EXPIRED":
      return { label: "Expired", bg: "bg-amber-50 text-amber-700 border-amber-100", icon: <Clock size={11} /> };
  }
}

function statusConfigPlain(status: QuotationStatus) {
  switch (status) {
    case "DRAFT": return { label: "Draft", bg: "#f3f4f6", fg: "#374151" };
    case "SENT": return { label: "Sent", bg: "#eff6ff", fg: "#1d4ed8" };
    case "ACCEPTED": return { label: "Accepted", bg: "#f0fdf4", fg: "#15803d" };
    case "REJECTED": return { label: "Rejected", bg: "#fef2f2", fg: "#dc2626" };
    case "EXPIRED": return { label: "Expired", bg: "#fffbeb", fg: "#b45309" };
  }
}

function calcSubtotal(items: LineItemDraft[]): number {
  return items.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

// ─── Print helper ─────────────────────────────────────────────────────────────

function printQuotation(q: Quotation) {
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const cfg = statusConfigPlain(q.status);
  const lineItems: LineItem[] = Array.isArray(q.lineItems) ? q.lineItems : [];
  const subtotal = lineItems.reduce((sum, li) => sum + Number(li.amount), 0);
  const discount = Number(q.discount ?? 0);
  const total = Math.max(0, subtotal - discount);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Quotation ${q.quotationNumber}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 18mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid #09aa4c; }
  .header img.logo { height: 56px; }
  .company-address { text-align: right; font-size: 10px; color: #444; line-height: 1.5; }
  .company-address .website { color: #003770; font-weight: 600; }
  .company-address .tpin { margin-top: 3px; color: #666; }
  .doc-title { margin: 20px 0 16px; }
  .doc-title h1 { font-size: 30px; font-weight: 800; color: #111; letter-spacing: 1px; }
  .status-pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: ${cfg.bg}; color: ${cfg.fg}; }
  .meta-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
  .customer-box { flex: 1; border: 1px solid #d8dee6; border-radius: 3px; overflow: hidden; }
  .customer-box .bar { background: #003770; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 10px; }
  .customer-box .body { padding: 8px 10px; font-size: 12px; line-height: 1.5; }
  .info-table { border-collapse: collapse; }
  .info-table td { border: 1px solid #d8dee6; padding: 5px 10px; font-size: 11px; }
  .info-table td.label { background: #003770; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; font-size: 9.5px; }
  .info-table td.quo-no { color: #003770; font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead { background: #003770; color: #fff; }
  table.items thead th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  table.items thead th.num { text-align: right; }
  table.items tbody td { padding: 9px 10px; font-size: 11.5px; border-bottom: 1px solid #eef1f4; vertical-align: top; }
  table.items td.rownum { width: 24px; color: #888; }
  table.items td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { width: 260px; margin-left: auto; margin-top: 4px; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 6px 10px; font-size: 11.5px; border: 1px solid #d8dee6; }
  .totals td.label { background: #003770; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.3px; }
  .totals td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td.num { font-weight: 700; }
  .notes { margin-top: 22px; font-size: 11px; color: #555; }
  .notes h3 { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 4px; }
  .signatures { margin-top: 46px; display: flex; flex-direction: column; gap: 22px; width: 300px; }
  .sig-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .sig-row .sig-label { color: #333; white-space: nowrap; }
  .sig-row .sig-line { flex: 1; border-bottom: 1px solid #999; min-width: 120px; padding-bottom: 2px; font-weight: 700; }
  .footer { margin-top: 36px; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9.5px; color: #555; flex-wrap: wrap; gap: 8px; }
  .footer .tagline { text-align: right; color: #09aa4c; font-weight: 700; }
  .footer .tagline span { display: block; color: #444; font-weight: 400; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <img class="logo" src="${magenLogoUrl}" alt="Magen Security" />
    <div class="company-address">
      ${COMPANY_ADDRESS_LINES.map((l) => `<div>${l}</div>`).join("")}
      <div class="website">${COMPANY_WEBSITE}</div>
      <div class="tpin">TPIN: ${COMPANY_TPIN}</div>
    </div>
  </div>

  <div class="doc-title">
    <h1>QUOTATION</h1>
    <div class="status-pill">${cfg.label}</div>
  </div>

  <div class="meta-row">
    <div class="customer-box">
      <div class="bar">Quoted To</div>
      <div class="body">
        <strong>${q.customerName}</strong>
        ${q.customerLocation ? `<br /><span style="color:#666">${q.customerLocation}</span>` : ""}
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">Quotation No.</td>
        <td class="quo-no">${q.quotationNumber}</td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td>${formatDate(q.quotationDate)}</td>
      </tr>
      ${q.validUntil ? `<tr><td class="label">Valid Until</td><td>${formatDate(q.validUntil)}</td></tr>` : ""}
      <tr><td class="label">Prepared By</td><td>${q.preparedBy}</td></tr>
      <tr>
        <td class="label">Generated</td>
        <td>${generatedDate}</td>
      </tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Description</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems.map((li, i) => `
      <tr>
        <td class="rownum">${i + 1}</td>
        <td>${li.description}</td>
        <td class="num">${formatCurrency(li.amount)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td class="label">Sub Total</td>
        <td class="num">${formatCurrency(subtotal)}</td>
      </tr>
      <tr>
        <td class="label">Discount</td>
        <td class="num">${discount > 0 ? formatCurrency(discount) : "—"}</td>
      </tr>
      <tr class="grand">
        <td class="label">Total</td>
        <td class="num">${formatCurrency(total)}</td>
      </tr>
    </table>
  </div>

  ${q.notes ? `<div class="notes"><h3>Notes</h3><p>${q.notes}</p></div>` : ""}

  <div class="signatures">
    <div class="sig-row">
      <span class="sig-label">Prepared By:</span>
      <span class="sig-line">${q.preparedBy}</span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Signature:</span>
      <span class="sig-line">&nbsp;</span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Received By:</span>
      <span class="sig-line">&nbsp;</span>
    </div>
    <div class="sig-row">
      <span class="sig-label">Signature:</span>
      <span class="sig-line">&nbsp;</span>
    </div>
  </div>

  <div class="footer">
    <div>
      ${COMPANY_PHONES.map((p) => `<div>📞 ${p}</div>`).join("")}
      ${COMPANY_EMAILS.map((e) => `<div>✉ ${e}</div>`).join("")}
    </div>
    <div class="tagline">
      Security You Can Trust
      <span>www.magensecurityltd.com</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuotationsPage() {
  const { token, user } = useAuth();

  // List state
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail panel
  const [selected, setSelected] = useState<Quotation | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-number preview
  const [nextNumber, setNextNumber] = useState<string>("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // ── Derived totals ──────────────────────────────────────────────────────────

  const subtotal = calcSubtotal(form.lineItems);
  const discountNum = parseFloat(form.discount) || 0;
  const total = Math.max(0, subtotal - discountNum);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchQuotations = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`${API}/quotations?${params}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load quotations.");
        setQuotations(json.data);
        setPagination(json.pagination);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error.");
      } finally {
        setLoading(false);
      }
    },
    [token, statusFilter]
  );

  useEffect(() => { fetchQuotations(1); }, [fetchQuotations]);

  // ── Auto-number preview ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!showForm || editId) return;
    const date = form.quotationDate || new Date().toISOString().slice(0, 10);
    fetch(`${API}/quotations/next-number?date=${date}`, { headers })
      .then((r) => r.json())
      .then((j) => setNextNumber(j.data?.quotationNumber ?? ""))
      .catch(() => {});
  }, [showForm, editId, form.quotationDate, token]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(q: Quotation) {
    setEditId(q.id);
    const lineItems: LineItemDraft[] =
      Array.isArray(q.lineItems) && q.lineItems.length > 0
        ? q.lineItems.map((li) => ({ description: li.description, amount: String(li.amount) }))
        : [{ ...EMPTY_LINE_ITEM }];
    setForm({
      customerName: q.customerName,
      customerLocation: q.customerLocation ?? "",
      quotationDate: toDateInput(q.quotationDate),
      validUntil: toDateInput(q.validUntil),
      lineItems,
      discount: q.discount != null ? String(Number(q.discount)) : "",
      notes: q.notes ?? "",
      startingNumber: "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setFormError(null);
  }

  function setLineItem(index: number, key: keyof LineItemDraft, value: string) {
    setForm((f) => {
      const items = f.lineItems.map((li, i) => i === index ? { ...li, [key]: value } : li);
      return { ...f, lineItems: items };
    });
  }

  function addLineItem() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE_ITEM }] }));
  }

  function removeLineItem(index: number) {
    setForm((f) => {
      const items = f.lineItems.filter((_, i) => i !== index);
      return { ...f, lineItems: items.length > 0 ? items : [{ ...EMPTY_LINE_ITEM }] };
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const lineItems = form.lineItems
        .filter((li) => li.description.trim() || li.amount)
        .map((li) => ({ description: li.description.trim(), amount: parseFloat(li.amount) || 0 }));

      if (lineItems.length === 0) {
        setFormError("At least one line item with a description is required.");
        setSubmitting(false);
        return;
      }

      const body: Record<string, unknown> = {
        customerName: form.customerName.trim(),
        customerLocation: form.customerLocation.trim() || null,
        quotationDate: form.quotationDate,
        validUntil: form.validUntil || null,
        lineItems,
        discount: form.discount ? parseFloat(form.discount) : null,
        notes: form.notes.trim() || null,
      };
      if (!editId && form.startingNumber.trim()) {
        body.startingNumber = parseInt(form.startingNumber.trim(), 10);
      }

      const url = editId ? `${API}/quotations/${editId}` : `${API}/quotations`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed.");

      closeForm();
      fetchQuotations(pagination.page);
      if (selected?.id === editId) setSelected(json.data);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Status transitions ──────────────────────────────────────────────────────

  async function transition(id: string, action: "send" | "accept" | "reject" | "expire") {
    try {
      const res = await fetch(`${API}/quotations/${id}/${action}`, { method: "POST", headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed.");
      fetchQuotations(pagination.page);
      if (selected?.id === id) setSelected(json.data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed.");
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(q: Quotation) {
    if (!window.confirm(`Delete quotation ${q.quotationNumber}? This cannot be undone.`)) return;
    const confirmed = await requestPasswordConfirmation();
    if (!confirmed) return;
    try {
      const res = await fetch(`${API}/quotations/${q.id}`, { method: "DELETE", headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed.");
      if (selected?.id === q.id) setSelected(null);
      fetchQuotations(pagination.page);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 h-full">
      {/* ── Left panel: list ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pagination.total} quotation{pagination.total !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-magen-green text-white rounded-lg text-sm font-semibold hover:bg-magen-green-dark transition-colors"
          >
            <Plus size={16} /> New Quotation
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); fetchQuotations(1); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-magen-green border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : quotations.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-gray-400">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No quotations yet</p>
            <p className="text-sm mt-1">Click "New Quotation" to create one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {quotations.map((q) => {
              const cfg = statusConfig(q.status);
              const isSelected = selected?.id === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => setSelected(isSelected ? null : q)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-magen-green bg-magen-green-light/20 shadow-sm"
                      : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">{q.quotationNumber}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.bg}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><User size={11} /> {q.customerName}</span>
                        {q.customerLocation && (
                          <span className="flex items-center gap-1"><MapPin size={11} /> {q.customerLocation}</span>
                        )}
                        <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(q.quotationDate)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900 text-sm">{formatCurrency(q.amount)}</div>
                      {q.validUntil && (
                        <div className="text-xs text-gray-400 mt-0.5">Valid until {formatDate(q.validUntil)}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-sm text-gray-500">
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchQuotations(pagination.page - 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchQuotations(pagination.page + 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: detail ── */}
      {selected && (
        <div className="w-80 xl:w-96 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 h-fit sticky top-0">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Quotation</div>
              <div className="text-lg font-bold text-gray-900">{selected.quotationNumber}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {/* Status pill */}
          {(() => {
            const cfg = statusConfig(selected.status);
            return (
              <span className={`self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg}`}>
                {cfg.icon} {cfg.label}
              </span>
            );
          })()}

          {/* Key details */}
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <User size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-900">{selected.customerName}</span>
            </div>
            {selected.customerLocation && (
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{selected.customerLocation}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-700">{formatDate(selected.quotationDate)}</span>
            </div>
            {selected.validUntil && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">Valid until {formatDate(selected.validUntil)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-500">Prepared by {selected.preparedBy}</span>
            </div>
          </div>

          {/* Line items */}
          {Array.isArray(selected.lineItems) && selected.lineItems.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden text-sm">
              <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Line Items
              </div>
              {selected.lineItems.map((li, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-3 py-2 border-t border-gray-100 first:border-t-0">
                  <span className="text-gray-700 min-w-0">{li.description}</span>
                  <span className="font-mono font-semibold text-gray-900 flex-shrink-0">{formatCurrency(li.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
            {(() => {
              const lineItems: LineItem[] = Array.isArray(selected.lineItems) ? selected.lineItems : [];
              const sub = lineItems.reduce((s, li) => s + Number(li.amount), 0);
              const disc = Number(selected.discount ?? 0);
              const tot = Math.max(0, sub - disc);
              return (
                <>
                  <div className="flex justify-between text-gray-500">
                    <span>Sub Total</span>
                    <span>{formatCurrency(sub)}</span>
                  </div>
                  {disc > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Discount</span>
                      <span>− {formatCurrency(disc)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                    <span>Total</span>
                    <span>{formatCurrency(tot)}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Notes */}
          {selected.notes && (
            <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-800">
              <div className="font-semibold mb-1 uppercase tracking-wide text-[10px] text-amber-500">Notes</div>
              {selected.notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            {/* Print */}
            <button
              onClick={() => printQuotation(selected)}
              className="flex items-center gap-2 w-full justify-center px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Printer size={14} /> Print Quotation
            </button>

            {/* Status transitions */}
            {(selected.status === "DRAFT" || selected.status === "SENT") && (
              <div className="flex gap-2">
                {selected.status === "DRAFT" && (
                  <button
                    onClick={() => transition(selected.id, "send")}
                    className="flex-1 flex items-center gap-1.5 justify-center px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <Send size={12} /> Mark Sent
                  </button>
                )}
                <button
                  onClick={() => transition(selected.id, "accept")}
                  className="flex-1 flex items-center gap-1.5 justify-center px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                >
                  <CheckCircle2 size={12} /> Accept
                </button>
                <button
                  onClick={() => transition(selected.id, "reject")}
                  className="flex-1 flex items-center gap-1.5 justify-center px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>
            )}

            {(selected.status === "DRAFT" || selected.status === "SENT") && (
              <button
                onClick={() => transition(selected.id, "expire")}
                className="flex items-center gap-1.5 justify-center w-full px-3 py-2 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-50 transition-colors"
              >
                <AlertCircle size={12} /> Mark Expired
              </button>
            )}

            {/* Edit / Delete — DRAFT only */}
            {selected.status === "DRAFT" && (
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(selected)}
                  className="flex-1 flex items-center gap-1.5 justify-center px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={12} /> Edit
                </button>
                {user?.role === "ADMIN" && (
                  <button
                    onClick={() => handleDelete(selected)}
                    className="flex items-center gap-1.5 justify-center px-3 py-2 border border-red-100 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Form modal ── */}
      {showForm && (
        <Modal onClose={closeForm} title={editId ? "Edit Quotation" : "New Quotation"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Customer Name *</label>
              <input
                required
                type="text"
                placeholder="e.g. Dawn Hollinrake"
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Customer location */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Location (optional)</label>
              <input
                type="text"
                placeholder="e.g. Lusaka"
                value={form.customerLocation}
                onChange={(e) => setForm((f) => ({ ...f, customerLocation: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Quotation Date *</label>
                <input
                  required
                  type="date"
                  value={form.quotationDate}
                  onChange={(e) => setForm((f) => ({ ...f, quotationDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Valid Until</label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Prepared by (read-only) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Prepared By</label>
              <input
                type="text"
                value={user?.fullName ?? ""}
                readOnly
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            {/* Line items */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Line Items *</label>
              <div className="space-y-2">
                {form.lineItems.map((li, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      type="text"
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => setLineItem(i, "description", e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-0"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={li.amount}
                      onChange={(e) => setLineItem(i, "amount", e.target.value)}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    {form.lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(i)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Minus size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="mt-2 flex items-center gap-1 text-xs text-magen-green hover:text-magen-green-dark font-semibold"
              >
                <Plus size={13} /> Add Line Item
              </button>
            </div>

            {/* Totals preview */}
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-500">
                <span>Sub Total</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 flex-shrink-0">Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right bg-white"
                />
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Starting number — only on new quotations */}
            {!editId && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Quotation Number</span>
                  {nextNumber && (
                    <span className="text-xs text-gray-400">
                      Next auto: <span className="font-mono font-semibold text-gray-700">{nextNumber}</span>
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={`Leave blank to use ${nextNumber || "next in sequence"}`}
                  value={form.startingNumber}
                  onChange={(e) => setForm((f) => ({ ...f, startingNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                />
                <p className="text-[11px] text-gray-400">
                  Enter a number to start the sequence from there. Future quotations will continue from that number automatically.
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Error */}
            {formError && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">{formError}</div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-magen-green text-white rounded-lg text-sm font-semibold hover:bg-magen-green-dark transition-colors disabled:opacity-60"
              >
                {submitting ? "Saving…" : editId ? "Save Changes" : "Create Quotation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
