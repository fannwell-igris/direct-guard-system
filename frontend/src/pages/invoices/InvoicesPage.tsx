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
  Printer,
  Trash2,
  Minus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import Modal from "../../components/ui/Modal";
// This page calls the backend with plain `fetch`, not the shared axios
// client, so it doesn't get the password-confirmation prompt for free the
// way pages built on that client do (see api/client.ts's interceptor) —
// wired in by hand below for the new delete action instead.
import { requestPasswordConfirmation } from "../../lib/passwordConfirmController";
import magenLogoUrl from "../../assets/magen-logo.svg";

// Magen Security's own registration/contact details for the invoice
// letterhead — matches the real branded invoice template (address, phone,
// email, TPIN). Update here if any of these change; there's nowhere else
// in the app these are stored yet (see the removed NOTE below this file
// used to carry — no Settings/Client record holds them).
const COMPANY_TPIN = "2503459511";
const COMPANY_ADDRESS_LINES = ["13 Kabulonga Road,", "100/608, Ibex Hill Lusaka."];
const COMPANY_WEBSITE = "www.magensecurityltd.com";
const COMPANY_PHONES = ["+260 760-271807", "+260 974-763639"];
const COMPANY_EMAILS = ["info@magensecurityltd.com", "sales@magensecurityltd.com", "admin@magensecurityltd.com"];

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

// ─── PDF export ───────────────────────────────────────────────────────────────
// Rebuilt (2026-09-24) to match Magen Security's actual branded invoice
// letterhead (logo, address block, numbered item table, signature lines,
// footer with contact icons) instead of the earlier generic layout — see
// the real invoice sample this was matched against. The underlying data
// model still only carries ONE lump `amount` per invoice (no itemized line
// items like the paper invoice's separate Day/Night Guarding rows) — this
// prints that single amount as row "1" with the description built from
// billingPeriod/site, same as before. Ask before adding real multi-line-item
// support; that's a bigger, separate schema change, not bundled into this.
function printInvoice(inv: Invoice, payments: Payment[], preparedByName?: string | null, lineItems?: LineItem[]) {
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const cfg = statusConfigPlain(inv.status);

  const paymentRows = payments
    .slice()
    .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
    .map(
      (p) => `
    <tr>
      <td>${formatDate(p.paymentDate)}</td>
      <td>${p.paymentMethod ?? "—"}</td>
      <td>${p.reference ?? "—"}</td>
      <td class="num">${formatCurrency(p.amount)}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${inv.invoiceNumber}</title>
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
  .info-table td.invoice-no { color: #c0392b; font-weight: 700; }
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
  .totals tr.due td { font-weight: 800; }
  .totals tr.balance td { background: #fff7e6; }
  .notes { margin-top: 22px; font-size: 11px; color: #555; }
  .notes h3 { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 4px; }
  .payments-section { margin-top: 22px; }
  .payments-section h3 { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px; }
  .payments-section table { width: 100%; border-collapse: collapse; }
  .payments-section thead { background: #f3f4f6; color: #555; }
  .payments-section thead th { padding: 6px 10px; text-align: left; font-size: 9.5px; font-weight: 600; text-transform: uppercase; }
  .payments-section thead th.num { text-align: right; }
  .payments-section tbody tr { border-bottom: 1px solid #eef1f4; }
  .payments-section tbody td { padding: 6px 10px; font-size: 11px; }
  .payments-section td.num { text-align: right; }
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
    <h1>INVOICE</h1>
    <div class="status-pill">${cfg.label}</div>
  </div>

  <div class="meta-row">
    <div class="customer-box">
      <div class="bar">Customer Details</div>
      <div class="body">
        <strong>${inv.client?.name ?? "—"}</strong>
        ${inv.site ? `<div style="color:#666;font-size:11px;margin-top:2px;">${inv.site.siteName}</div>` : ""}
      </div>
    </div>
    <table class="info-table">
      <tr><td class="label">Invoice no#</td><td class="invoice-no">${inv.invoiceNumber}</td></tr>
      <tr><td class="label">Date</td><td>${formatDate(inv.invoiceDate)}</td></tr>
      <tr><td class="label">Due Date</td><td>${formatDate(inv.dueDate)}</td></tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="rownum"></th>
        <th>Description</th>
        <th class="num">Price (K)</th>
        <th class="num">Amount (K)</th>
      </tr>
    </thead>
    <tbody>
      ${(lineItems && lineItems.filter((li) => li.description.trim() && Number(li.amount) > 0).length > 1)
        ? lineItems
            .filter((li) => li.description.trim() && Number(li.amount) > 0)
            .map((li, i) => `
          <tr>
            <td class="rownum">${i + 1}</td>
            <td>${li.description}${inv.site ? ` (${inv.site.siteName})` : ""}</td>
            <td class="num">${formatCurrency(li.amount)}</td>
            <td class="num">${formatCurrency(li.amount)}</td>
          </tr>`).join("")
        : `<tr>
            <td class="rownum">1</td>
            <td>Security services${inv.billingPeriod ? ` — ${inv.billingPeriod}` : ""}${inv.site ? ` (${inv.site.siteName})` : ""}</td>
            <td class="num"></td>
            <td class="num">${formatCurrency(inv.amount)}</td>
          </tr>`
      }
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td class="label">Sub Total</td><td class="num">${formatCurrency(inv.amount)}</td></tr>
      <tr><td class="label">Discount</td><td class="num"></td></tr>
      <tr class="due"><td class="label">Total</td><td class="num">${formatCurrency(inv.amount)}</td></tr>
      <tr class="balance"><td class="label">Amount Paid</td><td class="num">${formatCurrency(inv.amountPaid)}</td></tr>
      <tr class="balance"><td class="label">Balance Due</td><td class="num">${formatCurrency(inv.outstandingBalance)}</td></tr>
    </table>
  </div>

  ${inv.notes ? `<div class="notes"><h3>Notes</h3><p>${inv.notes}</p></div>` : ""}

  ${payments.length > 0 ? `
  <div class="payments-section">
    <h3>Payment History</h3>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Method</th>
          <th>Reference</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </div>` : ""}

  <div class="signatures">
    <div class="sig-row"><span class="sig-label">Prepared by:</span><span class="sig-line">${preparedByName ?? "&nbsp;"}</span></div>
    <div class="sig-row"><span class="sig-label">Signature:</span><span class="sig-line">&nbsp;</span></div>
    <div class="sig-row"><span class="sig-label">Received by:</span><span class="sig-line">&nbsp;</span></div>
    <div class="sig-row"><span class="sig-label">Signature:</span><span class="sig-line">&nbsp;</span></div>
  </div>

  <div class="footer">
    <div>
      <div>Cell: ${COMPANY_PHONES.join(" &middot; ")}</div>
      <div>${COMPANY_EMAILS.join(" &middot; ")}</div>
      <div style="margin-top:4px;color:#999;">Generated ${generatedDate}</div>
    </div>
    <div class="tagline">Visible &middot; Vigilant &middot; Always Ready<span>Magen Security Limited</span></div>
  </div>
</body>
</html>`;

  // Electron blocks window.open() and blob: URLs. Instead, inject a <style>
  // that hides the entire app and shows only a print-only <div> containing
  // the invoice HTML, then call window.print(), then clean up.
  const PRINT_ID = "__invoice_print_root__";
  const STYLE_ID = "__invoice_print_style__";

  // Remove any leftover print elements from a previous call.
  document.getElementById(PRINT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  // The style hides everything except our print div during printing.
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @media print {
      body > *:not(#${PRINT_ID}) { display: none !important; }
      #${PRINT_ID} { display: block !important; position: static !important; }
    }
    #${PRINT_ID} { display: none; }
  `;
  document.head.appendChild(style);

  const div = document.createElement("div");
  div.id = PRINT_ID;
  // Strip the outer <!DOCTYPE html><html><head>...</head><body> wrapper —
  // we only need the inner body content since we're injecting into the
  // existing document.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  div.innerHTML = bodyMatch ? bodyMatch[1] : html;
  document.body.appendChild(div);

  // Also inject the invoice's <style> block into the document head so the
  // print styles apply correctly.
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  let invoiceStyle: HTMLStyleElement | null = null;
  if (styleMatch) {
    invoiceStyle = document.createElement("style");
    invoiceStyle.id = "__invoice_inline_style__";
    invoiceStyle.textContent = styleMatch[1];
    document.head.appendChild(invoiceStyle);
  }

  setTimeout(() => {
    window.print();
    // Clean up after the print dialog closes.
    setTimeout(() => {
      document.getElementById(PRINT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById("__invoice_inline_style__")?.remove();
    }, 1500);
  }, 200);
}

function statusConfigPlain(status: InvoiceStatus): { label: string; bg: string; fg: string } {
  switch (status) {
    case "DRAFT": return { label: "Draft", bg: "#f3f4f6", fg: "#4b5563" };
    case "ISSUED": return { label: "Issued", bg: "#dbeafe", fg: "#1d4ed8" };
    case "PARTIALLY_PAID": return { label: "Partially Paid", bg: "#fef3c7", fg: "#b45309" };
    case "PAID": return { label: "Paid", bg: "#dcfce7", fg: "#15803d" };
    case "OVERDUE": return { label: "Overdue", bg: "#fee2e2", fg: "#b91c1c" };
    case "CANCELLED": return { label: "Cancelled", bg: "#f3f4f6", fg: "#9ca3af" };
  }
}

// ─── Line items (frontend-only, summed into the single `amount` field) ────────

interface LineItem {
  description: string;
  amount: string; // kept as string while editing
}

function blankLineItem(): LineItem {
  return { description: "", amount: "" };
}

// ─── Receipt print ─────────────────────────────────────────────────────────────

function printReceipt(inv: Invoice, payment: Payment, preparedByName?: string | null) {
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Receipt — ${inv.invoiceNumber}</title>
<style>
  @page { size: A5 portrait; margin: 12mm 14mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 3px solid #09aa4c; margin-bottom: 16px; }
  .header img.logo { height: 48px; }
  .company-address { text-align: right; font-size: 9px; color: #444; line-height: 1.5; }
  .doc-title h1 { font-size: 26px; font-weight: 800; color: #111; letter-spacing: 1px; margin-bottom: 4px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d; margin-bottom: 14px; }
  .meta { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 11px; }
  .meta-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f3f4f6; }
  .meta-row:last-child { border-bottom: none; }
  .meta-row .label { color: #6b7280; }
  .meta-row .value { font-weight: 600; text-align: right; }
  .amount-box { background: #003770; color: #fff; border-radius: 8px; padding: 14px 16px; text-align: center; margin-bottom: 14px; }
  .amount-box .amt-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; margin-bottom: 4px; }
  .amount-box .amt-value { font-size: 24px; font-weight: 800; }
  .signatures { margin-top: 28px; display: flex; gap: 24px; }
  .sig { flex: 1; }
  .sig .line { border-bottom: 1px solid #999; margin-bottom: 4px; height: 24px; }
  .sig .sig-label { font-size: 9px; color: #6b7280; }
  .footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 9px; color: #9ca3af; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <img class="logo" src="${magenLogoUrl}" alt="Magen Security" />
    <div class="company-address">
      ${COMPANY_ADDRESS_LINES.map((l) => `<div>${l}</div>`).join("")}
      <div style="color:#003770;font-weight:600;">${COMPANY_WEBSITE}</div>
      <div>TPIN: ${COMPANY_TPIN}</div>
    </div>
  </div>

  <div class="doc-title"><h1>RECEIPT</h1></div>
  <div class="pill">Payment Confirmed</div>

  <div class="meta">
    <div class="meta-row"><span class="label">Invoice No.</span><span class="value">${inv.invoiceNumber}</span></div>
    <div class="meta-row"><span class="label">Client</span><span class="value">${inv.client?.name ?? "—"}</span></div>
    ${inv.site ? `<div class="meta-row"><span class="label">Site</span><span class="value">${inv.site.siteName}</span></div>` : ""}
    ${inv.billingPeriod ? `<div class="meta-row"><span class="label">Period</span><span class="value">${inv.billingPeriod}</span></div>` : ""}
    <div class="meta-row"><span class="label">Payment Date</span><span class="value">${formatDate(payment.paymentDate)}</span></div>
    ${payment.paymentMethod ? `<div class="meta-row"><span class="label">Method</span><span class="value">${payment.paymentMethod}</span></div>` : ""}
    ${payment.reference ? `<div class="meta-row"><span class="label">Reference</span><span class="value">${payment.reference}</span></div>` : ""}
    ${payment.notes ? `<div class="meta-row"><span class="label">Notes</span><span class="value">${payment.notes}</span></div>` : ""}
    <div class="meta-row"><span class="label">Invoice Total</span><span class="value">${formatCurrency(inv.amount)}</span></div>
    <div class="meta-row"><span class="label">Outstanding After</span><span class="value">${formatCurrency(inv.outstandingBalance)}</span></div>
  </div>

  <div class="amount-box">
    <div class="amt-label">Amount Received</div>
    <div class="amt-value">${formatCurrency(payment.amount)}</div>
  </div>

  <div class="signatures">
    <div class="sig"><div class="line"></div><div class="sig-label">Received by: ${preparedByName ?? ""}</div></div>
    <div class="sig"><div class="line"></div><div class="sig-label">Client signature</div></div>
  </div>

  <div class="footer">Generated ${generatedDate} · Magen Security Limited · Visible · Vigilant · Always Ready</div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const PRINT_ID = "__receipt_print_root__";
  const STYLE_ID = "__receipt_print_style__";
  document.getElementById(PRINT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @media print { body > *:not(#${PRINT_ID}) { display: none !important; } #${PRINT_ID} { display: block !important; position: static !important; } }
    #${PRINT_ID} { display: none; }
  `;
  document.head.appendChild(style);

  const div = document.createElement("div");
  div.id = PRINT_ID;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  div.innerHTML = bodyMatch ? bodyMatch[1] : html;
  document.body.appendChild(div);

  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  let receiptStyle: HTMLStyleElement | null = null;
  if (styleMatch) {
    receiptStyle = document.createElement("style");
    receiptStyle.id = "__receipt_inline_style__";
    receiptStyle.textContent = styleMatch[1];
    document.head.appendChild(receiptStyle);
  }

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.getElementById(PRINT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById("__receipt_inline_style__")?.remove();
    }, 1500);
  }, 200);
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
  // Line items (frontend-only). When more than one item is present,
  // billingPeriod is auto-derived from descriptions and amount is the sum.
  lineItems: LineItem[];
}

function blankInvoiceForm(): InvoiceForm {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  return { clientId: "", siteId: "", invoiceDate: today, dueDate: due, billingPeriod: "", amount: "", notes: "", lineItems: [blankLineItem()] };
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
  const { token, user } = useAuth();
  const authHeader = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  // Only Admin and Payroll (this system's Finance role) can create/edit/act on invoices & payments.
  const canEdit = user?.role === "ADMIN" || user?.role === "PAYROLL";

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
  // Some clients pay several months in advance and are only invoiced once
  // a quarter or year (their ClientContract.billingFrequency), not every
  // month — this surfaces that contract's own cycle + amount as a
  // one-click suggestion instead of leaving Finance to remember it, added
  // 2026-09-25 per explicit instruction. Only looked up while creating a
  // brand new invoice, never on edit.
  const [billingSuggestion, setBillingSuggestion] = useState<{ frequency: string; amount: number } | null>(null);

  // Live preview of the invoice number a brand-new invoice will get,
  // added 2026-09-25 per explicit instruction ("let me see the invoice
  // numbers as they are being made"). Purely a peek — the real number is
  // still assigned by the backend on save, so this is re-fetched whenever
  // the invoice date changes (numbering is per calendar year).
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<string | null>(null);

  // ── payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(blankPaymentForm());
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  // ── action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Track line items entered during create/edit so printInvoice can show them
  const [lastLineItems, setLastLineItems] = useState<LineItem[]>([]);

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

  // ─── Look up the client's own billing cycle (new invoices only) ──────────
  useEffect(() => {
    setBillingSuggestion(null);
    if (invoicePanel !== "add" || !invoiceForm.clientId) return;
    const params = new URLSearchParams({ clientId: invoiceForm.clientId, status: "ACTIVE", pageSize: "5" });
    if (invoiceForm.siteId) params.set("siteId", invoiceForm.siteId);
    fetch(`${API}/client-contracts?${params.toString()}`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => {
        const contract = (j.data ?? [])[0];
        if (contract && contract.billingFrequency !== "MONTHLY" && contract.billingFrequency !== "ONE_OFF") {
          setBillingSuggestion({ frequency: contract.billingFrequency, amount: Number(contract.amount) });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceForm.clientId, invoiceForm.siteId, invoicePanel]);

  // ─── Live "next invoice number" preview (new invoices only) ──────────────
  useEffect(() => {
    setNextInvoiceNumber(null);
    if (invoicePanel !== "add") return;
    const params = invoiceForm.invoiceDate ? `?date=${invoiceForm.invoiceDate}` : "";
    fetch(`${API}/invoices/next-number${params}`, { headers: authHeader })
      .then((r) => r.json())
      .then((j) => setNextInvoiceNumber(j.data?.invoiceNumber ?? null))
      .catch(() => {});
  }, [invoicePanel, invoiceForm.invoiceDate]);

  function applyBillingSuggestion() {
    if (!billingSuggestion) return;
    const label = billingSuggestion.frequency.charAt(0) + billingSuggestion.frequency.slice(1).toLowerCase();
    setInvoiceForm((f) => ({
      ...f,
      amount: String(billingSuggestion!.amount),
      billingPeriod: f.billingPeriod || label,
      lineItems: f.lineItems.length === 1 && !f.lineItems[0].amount
        ? [{ description: f.lineItems[0].description || "Security services", amount: String(billingSuggestion!.amount) }]
        : f.lineItems,
    }));
  }

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
      lineItems: [{ description: inv.billingPeriod ?? "Security services", amount: String(Number(inv.amount)) }],
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

    // Compute totals from line items
    const validItems = invoiceForm.lineItems.filter((li) => li.description.trim() && Number(li.amount) > 0);
    if (validItems.length === 0) return setInvoiceFormError("Add at least one line item with a description and amount.");
    const computedAmount = validItems.reduce((sum, li) => sum + Number(li.amount), 0);
    if (computedAmount <= 0) return setInvoiceFormError("Total amount must be greater than zero.");

    // Auto-build billingPeriod from line item descriptions when using multiple items
    const billingPeriod = invoiceForm.billingPeriod.trim()
      || (validItems.length > 1
        ? validItems.map((li) => li.description.trim()).join(", ")
        : validItems[0].description.trim());

    const payload = {
      clientId: invoiceForm.clientId,
      siteId: invoiceForm.siteId || null,
      invoiceDate: invoiceForm.invoiceDate,
      dueDate: invoiceForm.dueDate,
      billingPeriod: billingPeriod || null,
      amount: computedAmount,
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
      setLastLineItems(validItems);
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

  async function handleDeleteInvoice() {
    if (!selectedInvoice) return;
    if (!window.confirm(`Permanently delete invoice ${selectedInvoice.invoiceNumber}? This cannot be undone.`)) return;

    setActionLoading(true);
    setActionError(null);
    try {
      let password = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch(`${API}/invoices/${selectedInvoice.id}`, {
          method: "DELETE",
          headers: password ? { ...authHeader, "x-confirm-password": password } : authHeader,
        });
        if (res.ok) break;
        const err = await res.json().catch(() => ({}));
        if (err.code === "PASSWORD_CONFIRMATION_REQUIRED" || err.code === "PASSWORD_CONFIRMATION_INVALID") {
          const entered = await requestPasswordConfirmation();
          if (entered === null) return; // user cancelled the prompt
          password = entered;
          continue; // retry the DELETE with the password attached
        }
        throw new Error(err.message || `Server error ${res.status}`);
      }
      setSelectedInvoice(null);
      loadInvoices(page);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Delete failed.");
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
        {canEdit && (
          <button className="btn-primary flex items-center gap-2" onClick={openAddPanel}>
            <Plus size={16} />
            New Invoice
          </button>
        )}
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

        {/* ── Invoice Form (Add / Edit) — modal ─────────────────────────────── */}
        {invoicePanel !== "none" && (
          <Modal
            title={invoicePanel === "add" ? "New Invoice" : "Edit Invoice"}
            onClose={() => setInvoicePanel("none")}
            widthClass="max-w-md"
          >
                {invoiceFormError && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 border border-red-100 rounded-lg p-3 mb-4 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> {invoiceFormError}
                  </div>
                )}

                <form onSubmit={handleInvoiceSubmit} className="space-y-3">
                  {/* Live preview of the number this invoice will be assigned */}
                  {invoicePanel === "add" && (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
                      <span className="text-gray-500">Invoice number</span>
                      <span className="font-mono font-semibold text-gray-700">
                        {nextInvoiceNumber ?? "…"}
                      </span>
                    </div>
                  )}

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

                  {billingSuggestion && (
                    <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                      <span>
                        This client is billed <strong>{billingSuggestion.frequency}</strong> — K{billingSuggestion.amount.toLocaleString()} per cycle, not every month.
                      </span>
                      <button type="button" onClick={applyBillingSuggestion} className="shrink-0 font-semibold underline">
                        Use
                      </button>
                    </div>
                  )}

                  {/* Line items */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-600">Line Items *</label>
                      <button
                        type="button"
                        className="text-xs text-magen-green-dark font-medium flex items-center gap-0.5 hover:underline"
                        onClick={() => setInvoiceForm((f) => ({ ...f, lineItems: [...f.lineItems, blankLineItem()] }))}
                      >
                        <Plus size={11} /> Add row
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {invoiceForm.lineItems.map((li, idx) => (
                        <div key={idx} className="flex gap-1.5 items-center">
                          <input
                            type="text"
                            className="input flex-1 text-sm"
                            placeholder={`Description (e.g. Day Guarding — Oct 2026)`}
                            value={li.description}
                            onChange={(e) => {
                              const items = [...invoiceForm.lineItems];
                              items[idx] = { ...items[idx], description: e.target.value };
                              setInvoiceForm((f) => ({ ...f, lineItems: items }));
                            }}
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input w-28 text-sm text-right"
                            placeholder="0.00"
                            value={li.amount}
                            onChange={(e) => {
                              const items = [...invoiceForm.lineItems];
                              items[idx] = { ...items[idx], amount: e.target.value };
                              setInvoiceForm((f) => ({ ...f, lineItems: items }));
                            }}
                          />
                          {invoiceForm.lineItems.length > 1 && (
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-600 shrink-0"
                              onClick={() => setInvoiceForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }))}
                            >
                              <Minus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Running total */}
                    {invoiceForm.lineItems.length > 1 && (
                      <div className="flex justify-between text-xs text-gray-500 mt-1.5 px-0.5">
                        <span>Total</span>
                        <span className="font-semibold text-gray-700">
                          ZMW {invoiceForm.lineItems
                            .reduce((s, li) => s + (Number(li.amount) || 0), 0)
                            .toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Billing period — optional override when using multi-line */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Billing Period
                      {invoiceForm.lineItems.length > 1 && (
                        <span className="ml-1 font-normal text-gray-400">(auto-built from line items if blank)</span>
                      )}
                    </label>
                    <input type="text" className="input w-full" placeholder="e.g. September 2026"
                      value={invoiceForm.billingPeriod}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, billingPeriod: e.target.value }))} />
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
          </Modal>
        )}

        {/* ── Right panel: Invoice Detail ─────────────────────────────────── */}
        {selectedInvoice && (
          <div className="w-96 shrink-0">
            {/* ── Invoice Detail ── */}
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

                    {/* Print / export — read-only action, available to anyone who can view this invoice */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                      <button
                        className="btn-secondary text-xs flex items-center gap-1"
                        onClick={() => printInvoice(selectedInvoice, payments, user?.fullName, lastLineItems)}
                      >
                        <Printer size={12} /> Print / Export PDF
                      </button>
                    </div>

                    {/* Quick actions */}
                    {canEdit && (
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
                        {(selectedInvoice.status === "DRAFT" || selectedInvoice.status === "ISSUED" || selectedInvoice.status === "OVERDUE") && Number(selectedInvoice.amountPaid) === 0 && (
                          <button
                            className="btn-danger text-xs flex items-center gap-1"
                            onClick={handleCancel}
                            disabled={actionLoading}
                          >
                            <XCircle size={12} /> Cancel
                          </button>
                        )}
                        {user?.role === "ADMIN" && (selectedInvoice.status === "DRAFT" || selectedInvoice.status === "CANCELLED" || selectedInvoice.status === "OVERDUE") && Number(selectedInvoice.amountPaid) === 0 && (
                          <button
                            className="btn-danger text-xs flex items-center gap-1"
                            onClick={handleDeleteInvoice}
                            disabled={actionLoading}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    )}

                    {/* Record payment form */}
                    {canEdit && showPaymentForm && (
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
                            <div key={pmt.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-700">{formatCurrency(pmt.amount)}</p>
                                <p className="text-xs text-gray-400">{formatDate(pmt.paymentDate)}</p>
                                {pmt.paymentMethod && <p className="text-xs text-gray-400">{pmt.paymentMethod}</p>}
                                {pmt.reference && <p className="text-xs text-gray-400">Ref: {pmt.reference}</p>}
                                {pmt.notes && <p className="text-xs text-gray-400">{pmt.notes}</p>}
                              </div>
                              <button
                                className="shrink-0 text-xs text-gray-400 hover:text-magen-navy flex items-center gap-0.5 mt-0.5"
                                title="Print receipt for this payment"
                                onClick={() => printReceipt(selectedInvoice, pmt, user?.fullName)}
                              >
                                <Printer size={11} /> Receipt
                              </button>
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
          </div>
        )}
      </div>
    </div>
  );
}

