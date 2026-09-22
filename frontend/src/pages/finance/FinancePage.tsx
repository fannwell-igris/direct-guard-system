import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Building2,
  RefreshCw, Plus, Trash2, Edit2, Check, X, ChevronLeft,
  ChevronRight, FileText, CreditCard, Banknote, PiggyBank,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const API = "http://localhost:3000/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  outstandingBalance: number;
  status: "DRAFT" | "ISSUED" | "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "CANCELLED";
  client: { id: string; name: string };
  site?: { id: string; siteName: string };
  billingPeriod?: string;
}

interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "UNDER_REVIEW" | "FINALIZED" | "PAID";
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount?: number;
  createdAt: string;
}

interface OperationalCost {
  id: string;
  month: string;
  costCategory: string;
  amount: number;
  notes?: string;
  client?: { id: string; name: string };
  site?: { id: string; siteName: string };
}

interface GeneralExpense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  department?: { id: string; name: string };
}

interface AccountEntry {
  id: string;
  label: string;
  type: "cash" | "bank";
  balance: number;
  notes?: string;
  updatedAt: string;
}

// ─── LocalStorage helpers for Cash & Accounts ────────────────────────────────

const LS_KEY = "magen_finance_accounts";

function loadAccounts(): AccountEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [
    { id: "1", label: "Petty Cash", type: "cash", balance: 0, notes: "", updatedAt: new Date().toISOString() },
    { id: "2", label: "Main Bank Account", type: "bank", balance: 0, notes: "", updatedAt: new Date().toISOString() },
  ];
}

function saveAccounts(entries: AccountEntry[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(n: number) {
  return "ZMW " + n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMonth(s: string) {
  if (!s) return "—";
  const d = new Date(s + "-01");
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────

type Tab = "overview" | "accounts" | "income" | "expenses" | "payroll";

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string;
  color: "green" | "blue" | "red" | "amber" | "navy";
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    navy: "bg-blue-950 border-blue-900 text-white",
  };
  const iconColors: Record<string, string> = {
    green: "text-emerald-500",
    blue: "text-blue-500",
    red: "text-red-500",
    amber: "text-amber-500",
    navy: "text-blue-200",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
        <Icon size={18} className={iconColors[color]} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

// ── Print helper ──────────────────────────────────────────────────────────────

function printFinanceSummary(data: {
  invoices: Invoice[];
  payrollRuns: PayrollRun[];
  opCosts: OperationalCost[];
  genExpenses: GeneralExpense[];
  accounts: AccountEntry[];
}) {
  const { invoices, payrollRuns, opCosts, genExpenses, accounts } = data;
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalReceived = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.outstandingBalance, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;
  const totalOpCosts = opCosts.reduce((s, c) => s + c.amount, 0);
  const totalGenExp = genExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPayroll = payrollRuns.reduce((s, r) => s + (r.totalNet ?? 0), 0);
  const totalExpenses = totalOpCosts + totalGenExp + totalPayroll;
  const netPosition = totalReceived - totalExpenses;
  const cashOnHand = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
  const bankTotal = accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthInvoices = invoices.filter((i) => i.invoiceDate?.slice(0, 7) === currentMonth);
  const monthIncome = monthInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const monthOpCosts = opCosts.filter((c) => c.month?.slice(0, 7) === currentMonth).reduce((s, c) => s + c.amount, 0);
  const printDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const accountRows = accounts.map((a) =>
    `<tr><td>${a.label}</td><td style="text-align:right">${fmt(a.balance)}</td><td>${a.type === "cash" ? "Cash" : "Bank"}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Finance Summary — ${printDate}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 32px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #003770; }
    .logo { font-size: 22px; font-weight: 800; color: #003770; letter-spacing: 0.05em; }
    .meta { text-align: right; color: #555; font-size: 12px; }
    .meta p { margin-top: 2px; }
    h2 { font-size: 14px; font-weight: 700; color: #003770; margin: 20px 0 10px; border-left: 3px solid #09aa4c; padding-left: 10px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; margin-bottom: 4px; }
    .kpi .value { font-size: 17px; font-weight: 700; color: #111; }
    .kpi .sub { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .kpi.green { background: #f0fdf4; border-color: #86efac; } .kpi.green .value { color: #15803d; }
    .kpi.red { background: #fef2f2; border-color: #fca5a5; } .kpi.red .value { color: #dc2626; }
    .kpi.amber { background: #fffbeb; border-color: #fcd34d; } .kpi.amber .value { color: #d97706; }
    .kpi.navy { background: #1e3a5f; border-color: #1e3a5f; } .kpi.navy .label, .kpi.navy .value, .kpi.navy .sub { color: #fff; }
    .breakdown-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .breakdown { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .breakdown h3 { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    table th { font-size: 11px; font-weight: 600; color: #6b7280; text-align: left; padding: 4px 0; border-bottom: 1px solid #e5e7eb; }
    table td { font-size: 12px; color: #374151; padding: 5px 0; border-bottom: 1px solid #f3f4f6; }
    table td:last-child { text-align: right; }
    .total-row td { font-weight: 700; border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 8px; }
    .positive { color: #15803d; } .negative { color: #dc2626; } .amber-c { color: #d97706; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">MAGEN</div>
      <div style="font-size:11px;color:#555;margin-top:4px;">Finance Management Report</div>
    </div>
    <div class="meta">
      <p><strong>Date:</strong> ${printDate}</p>
      <p><strong>Invoices loaded:</strong> ${invoices.length}</p>
      <p><strong>Payroll runs:</strong> ${payrollRuns.length}</p>
    </div>
  </div>

  <h2>Key Performance Indicators</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Total Invoiced</div><div class="value">${fmt(totalInvoiced)}</div><div class="sub">${invoices.length} invoices</div></div>
    <div class="kpi green"><div class="label">Total Received</div><div class="value">${fmt(totalReceived)}</div><div class="sub">${overdueCount} overdue</div></div>
    <div class="kpi red"><div class="label">Total Expenses</div><div class="value">${fmt(totalExpenses)}</div><div class="sub">ops + overhead + payroll</div></div>
    <div class="kpi ${netPosition >= 0 ? "green" : "red"}"><div class="label">Net Position</div><div class="value">${fmt(netPosition)}</div><div class="sub">received − expenses</div></div>
  </div>
  <div class="kpi-grid" style="margin-top:12px">
    <div class="kpi amber"><div class="label">Outstanding</div><div class="value">${fmt(totalOutstanding)}</div><div class="sub">unpaid invoices</div></div>
    <div class="kpi navy"><div class="label">Cash on Hand</div><div class="value">${fmt(cashOnHand)}</div><div class="sub">${accounts.filter((a) => a.type === "cash").length} account(s)</div></div>
    <div class="kpi navy"><div class="label">Bank Balance</div><div class="value">${fmt(bankTotal)}</div><div class="sub">${accounts.filter((a) => a.type === "bank").length} account(s)</div></div>
    <div class="kpi"><div class="label">This Month Income</div><div class="value">${fmt(monthIncome)}</div><div class="sub">vs ${fmt(monthOpCosts)} ops costs</div></div>
  </div>

  <h2>Financial Breakdown</h2>
  <div class="breakdown-grid">
    <div class="breakdown">
      <h3>Income</h3>
      <table>
        <tr><td>Total Invoiced</td><td>${fmt(totalInvoiced)}</td></tr>
        <tr><td>Collected</td><td class="positive">${fmt(totalReceived)}</td></tr>
        <tr class="total-row"><td>Outstanding</td><td class="amber-c">${fmt(totalOutstanding)}</td></tr>
      </table>
    </div>
    <div class="breakdown">
      <h3>Expenses</h3>
      <table>
        <tr><td>Operational Costs</td><td>${fmt(totalOpCosts)}</td></tr>
        <tr><td>General Expenses</td><td>${fmt(totalGenExp)}</td></tr>
        <tr><td>Payroll (net)</td><td>${fmt(totalPayroll)}</td></tr>
        <tr class="total-row"><td>Total</td><td class="negative">${fmt(totalExpenses)}</td></tr>
      </table>
    </div>
    <div class="breakdown">
      <h3>Funds on Hand</h3>
      <table>
        <thead><tr><th>Account</th><th>Balance</th><th>Type</th></tr></thead>
        <tbody>${accountRows || '<tr><td colspan="3" style="color:#9ca3af;font-style:italic">No accounts configured</td></tr>'}</tbody>
        ${accounts.length > 0 ? `<tr class="total-row"><td>Total</td><td>${fmt(cashOnHand + bankTotal)}</td><td></td></tr>` : ""}
      </table>
    </div>
  </div>

  <div class="footer">Generated by Magen Security Management System · ${printDate} · Confidential</div>

  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ invoices, payrollRuns, opCosts, genExpenses, accounts }: {
  invoices: Invoice[];
  payrollRuns: PayrollRun[];
  opCosts: OperationalCost[];
  genExpenses: GeneralExpense[];
  accounts: AccountEntry[];
}) {
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalReceived = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.outstandingBalance, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;

  const totalOpCosts = opCosts.reduce((s, c) => s + c.amount, 0);
  const totalGenExp = genExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPayroll = payrollRuns.reduce((s, r) => s + (r.totalNet ?? 0), 0);
  const totalExpenses = totalOpCosts + totalGenExp + totalPayroll;

  const netPosition = totalReceived - totalExpenses;
  const cashOnHand = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
  const bankTotal = accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthInvoices = invoices.filter((i) => i.invoiceDate?.slice(0, 7) === currentMonth);
  const monthIncome = monthInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const monthOpCosts = opCosts.filter((c) => c.month?.slice(0, 7) === currentMonth).reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => printFinanceSummary({ invoices, payrollRuns, opCosts, genExpenses, accounts })}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg px-3 py-1.5 shadow-sm hover:shadow transition-shadow"
        >
          <FileText size={13} /> Print Summary
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total Invoiced" value={fmt(totalInvoiced)} sub={`${invoices.length} invoices`} color="blue" icon={FileText} />
        <KpiTile label="Total Received" value={fmt(totalReceived)} sub={`${overdueCount} overdue`} color="green" icon={TrendingUp} />
        <KpiTile label="Total Expenses" value={fmt(totalExpenses)} sub="ops + overhead + payroll" color="red" icon={TrendingDown} />
        <KpiTile label="Net Position" value={fmt(netPosition)} sub="received − expenses" color={netPosition >= 0 ? "green" : "red"} icon={DollarSign} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Outstanding" value={fmt(totalOutstanding)} sub="unpaid invoices" color="amber" icon={CreditCard} />
        <KpiTile label="Cash on Hand" value={fmt(cashOnHand)} sub={`${accounts.filter((a) => a.type === "cash").length} account(s)`} color="navy" icon={Banknote} />
        <KpiTile label="Bank Balance" value={fmt(bankTotal)} sub={`${accounts.filter((a) => a.type === "bank").length} account(s)`} color="navy" icon={PiggyBank} />
        <KpiTile label="This Month Income" value={fmt(monthIncome)} sub={`vs ${fmt(monthOpCosts)} ops costs`} color="blue" icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Income Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total Invoiced</span><span className="font-medium">{fmt(totalInvoiced)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Collected</span><span className="font-medium text-emerald-600">{fmt(totalReceived)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-gray-500">Outstanding</span><span className="font-medium text-amber-600">{fmt(totalOutstanding)}</span></div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Expense Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Operational Costs</span><span className="font-medium">{fmt(totalOpCosts)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">General Expenses</span><span className="font-medium">{fmt(totalGenExp)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-gray-500">Payroll (net)</span><span className="font-medium">{fmt(totalPayroll)}</span></div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Funds on Hand</h3>
          <div className="space-y-2 text-sm">
            {accounts.length === 0 && <p className="text-gray-400 text-xs">No accounts configured. Add them in the Cash &amp; Accounts tab.</p>}
            {accounts.map((a) => (
              <div key={a.id} className="flex justify-between">
                <span className="text-gray-500">{a.label}</span>
                <span className="font-medium">{fmt(a.balance)}</span>
              </div>
            ))}
            {accounts.length > 0 && (
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-500 font-semibold">Total</span>
                <span className="font-bold">{fmt(cashOnHand + bankTotal)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cash & Accounts Tab ───────────────────────────────────────────────────────

function AccountsTab({ accounts, onChange }: { accounts: AccountEntry[]; onChange: (a: AccountEntry[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", type: "bank" as "cash" | "bank", balance: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", type: "bank" as "cash" | "bank", balance: "", notes: "" });

  function startEdit(a: AccountEntry) {
    setEditingId(a.id);
    setForm({ label: a.label, type: a.type, balance: String(a.balance), notes: a.notes ?? "" });
  }

  function saveEdit(id: string) {
    const updated = accounts.map((a) =>
      a.id === id ? { ...a, label: form.label, type: form.type, balance: parseFloat(form.balance) || 0, notes: form.notes, updatedAt: new Date().toISOString() } : a
    );
    onChange(updated);
    setEditingId(null);
  }

  function removeAccount(id: string) {
    onChange(accounts.filter((a) => a.id !== id));
  }

  function addAccount() {
    const newEntry: AccountEntry = {
      id: Date.now().toString(),
      label: addForm.label || "New Account",
      type: addForm.type,
      balance: parseFloat(addForm.balance) || 0,
      notes: addForm.notes,
      updatedAt: new Date().toISOString(),
    };
    onChange([...accounts, newEntry]);
    setAdding(false);
    setAddForm({ label: "", type: "bank", balance: "", notes: "" });
  }

  const cashTotal = accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
  const bankTotal = accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Cash &amp; Accounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manually record cash on hand and bank account balances. Balances are saved to this browser.</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Cash on Hand</p>
          <p className="text-xl font-bold text-gray-900">{fmt(cashTotal)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Bank Accounts</p>
          <p className="text-xl font-bold text-gray-900">{fmt(bankTotal)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Funds</p>
          <p className="text-xl font-bold text-magen-green">{fmt(cashTotal + bankTotal)}</p>
        </div>
      </div>

      {adding && (
        <div className="card border-2 border-magen-green/30">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">New Account</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name / Label</label>
              <input className="input" value={addForm.label} onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Zanaco Current Account" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select className="select" value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as "cash" | "bank" }))}>
                <option value="bank">Bank Account</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Balance (ZMW)</label>
              <input className="input" type="number" min="0" step="0.01" value={addForm.balance} onChange={(e) => setAddForm((f) => ({ ...f, balance: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
              <input className="input" value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Account number, bank branch, etc." />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={addAccount}>Save Account</button>
            <button className="btn-secondary text-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="card">
            {editingId === a.id ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input className="input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select className="select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "cash" | "bank" }))}>
                    <option value="bank">Bank Account</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Balance (ZMW)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button className="btn-primary text-sm flex items-center gap-1" onClick={() => saveEdit(a.id)}><Check size={13} /> Save</button>
                  <button className="btn-secondary text-sm flex items-center gap-1" onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.type === "cash" ? "bg-amber-100" : "bg-blue-100"}`}>
                    {a.type === "cash" ? <Banknote size={16} className="text-amber-600" /> : <Building2 size={16} className="text-blue-600" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">{a.label}</p>
                    <p className="text-xs text-gray-400">{a.type === "cash" ? "Cash" : "Bank Account"}{a.notes ? ` · ${a.notes}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{fmt(a.balance)}</p>
                    <p className="text-xs text-gray-400">Updated {fmtDate(a.updatedAt)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(a)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => removeAccount(a.id)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="card text-center py-8 text-gray-400">
            <PiggyBank size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No accounts yet. Click "Add Account" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Income Tab ────────────────────────────────────────────────────────────────

const INV_PAGE = 20;
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

function IncomeTab() {
  const { token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(INV_PAGE) });
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`${API}/invoices?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setInvoices(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(1); setPage(1); }, [load]);

  const pages = Math.max(1, Math.ceil(total / INV_PAGE));
  const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalOut = invoices.reduce((s, i) => s + i.outstandingBalance, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className="select text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["DRAFT","ISSUED","PAID","PARTIALLY_PAID","OVERDUE","CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input className="input text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input className="input text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => load(page)} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Invoiced</p><p className="font-bold text-gray-900">{fmt(totalAmount)}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Collected</p><p className="font-bold text-emerald-600">{fmt(totalPaid)}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Outstanding</p><p className="font-bold text-amber-600">{fmt(totalOut)}</p></div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Invoice #","Date","Due Date","Client","Site","Amount","Paid","Outstanding","Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              )}
              {!loading && invoices.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">No invoices found.</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-gray-900">{inv.invoiceNumber}</td>
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(inv.dueDate)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{inv.client?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500">{inv.site?.siteName ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{fmt(inv.amount)}</td>
                  <td className="px-4 py-2.5 text-emerald-600 whitespace-nowrap">{fmt(inv.amountPaid)}</td>
                  <td className="px-4 py-2.5 text-amber-600 whitespace-nowrap">{fmt(inv.outstandingBalance)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? ""}`}>
                      {inv.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
            <p className="text-xs text-gray-500">{total} records · page {page} of {pages}</p>
            <div className="flex gap-1">
              <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = page - 1; setPage(np); load(np); }} disabled={page <= 1}><ChevronLeft size={12} /></button>
              <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = page + 1; setPage(np); load(np); }} disabled={page >= pages}><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────

const EXP_PAGE = 20;

function ExpensesTab() {
  const { token } = useAuth();
  const [opCosts, setOpCosts] = useState<OperationalCost[]>([]);
  const [genExp, setGenExp] = useState<GeneralExpense[]>([]);
  const [opTotal, setOpTotal] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [opPage, setOpPage] = useState(1);
  const [genPage, setGenPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<"operational" | "general">("operational");
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const loadOp = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(EXP_PAGE) });
      if (monthFrom) params.set("monthFrom", monthFrom);
      if (monthTo) params.set("monthTo", monthTo);
      if (catFilter) params.set("costCategory", catFilter);
      const res = await fetch(`${API}/operational-costs?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setOpCosts(json.data ?? []);
      setOpTotal(json.pagination?.total ?? 0);
    } finally { setLoading(false); }
  }, [token, monthFrom, monthTo, catFilter]);

  const loadGen = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(EXP_PAGE) });
      if (catFilter) params.set("category", catFilter);
      const res = await fetch(`${API}/general-expenses?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setGenExp(json.data ?? []);
      setGenTotal(json.pagination?.total ?? 0);
    } finally { setLoading(false); }
  }, [token, catFilter]);

  useEffect(() => { loadOp(1); setOpPage(1); }, [loadOp]);
  useEffect(() => { loadGen(1); setGenPage(1); }, [loadGen]);

  const opPages = Math.max(1, Math.ceil(opTotal / EXP_PAGE));
  const genPages = Math.max(1, Math.ceil(genTotal / EXP_PAGE));
  const opSum = opCosts.reduce((s, c) => s + c.amount, 0);
  const genSum = genExp.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSubTab("operational")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === "operational" ? "bg-magen-navy text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
          Operational Costs <span className="ml-1.5 text-xs opacity-70">({opTotal})</span>
        </button>
        <button onClick={() => setSubTab("general")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === "general" ? "bg-magen-navy text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
          General Expenses <span className="ml-1.5 text-xs opacity-70">({genTotal})</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        {subTab === "operational" && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month From</label>
              <input className="input text-sm" type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month To</label>
              <input className="input text-sm" type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <input className="input text-sm" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} placeholder="Filter by category…" />
        </div>
        <button className="btn-secondary text-sm flex items-center gap-1.5"
          onClick={() => subTab === "operational" ? loadOp(opPage) : loadGen(genPage)} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {subTab === "operational" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Page Total</p><p className="font-bold text-gray-900">{fmt(opSum)}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Records Found</p><p className="font-bold text-gray-900">{opTotal}</p></div>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Month","Client","Site","Category","Amount","Notes"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
                  {!loading && opCosts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No records found.</td></tr>}
                  {opCosts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtMonth(c.month)}</td>
                      <td className="px-4 py-2.5">{c.client?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{c.site?.siteName ?? "—"}</td>
                      <td className="px-4 py-2.5"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{c.costCategory}</span></td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{fmt(c.amount)}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{c.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {opPages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-500">{opTotal} records · page {opPage} of {opPages}</p>
                <div className="flex gap-1">
                  <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = opPage - 1; setOpPage(np); loadOp(np); }} disabled={opPage <= 1}><ChevronLeft size={12} /></button>
                  <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = opPage + 1; setOpPage(np); loadOp(np); }} disabled={opPage >= opPages}><ChevronRight size={12} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {subTab === "general" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Page Total</p><p className="font-bold text-gray-900">{fmt(genSum)}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Records Found</p><p className="font-bold text-gray-900">{genTotal}</p></div>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Date","Department","Category","Description","Amount"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
                  {!loading && genExp.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No expenses found.</td></tr>}
                  {genExp.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-2.5">{e.department?.name ?? "—"}</td>
                      <td className="px-4 py-2.5"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{e.category}</span></td>
                      <td className="px-4 py-2.5 text-gray-700">{e.description}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {genPages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-500">{genTotal} records · page {genPage} of {genPages}</p>
                <div className="flex gap-1">
                  <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = genPage - 1; setGenPage(np); loadGen(np); }} disabled={genPage <= 1}><ChevronLeft size={12} /></button>
                  <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = genPage + 1; setGenPage(np); loadGen(np); }} disabled={genPage >= genPages}><ChevronRight size={12} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Payroll Costs Tab ─────────────────────────────────────────────────────────

const PR_PAGE = 20;
const PR_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  FINALIZED: "bg-purple-100 text-purple-700",
  PAID: "bg-emerald-100 text-emerald-700",
};

function PayrollCostsTab() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PR_PAGE) });
      const res = await fetch(`${API}/payroll/runs?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setRuns(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PR_PAGE));
  const totalNet = runs.reduce((s, r) => s + (r.totalNet ?? 0), 0);
  const totalGross = runs.reduce((s, r) => s + (r.totalGross ?? 0), 0);
  const totalDeductions = runs.reduce((s, r) => s + (r.totalDeductions ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Payroll Costs</h2>
          <p className="text-xs text-gray-500 mt-0.5">Summary of payroll runs — gross pay, deductions, and net cost to the company.</p>
        </div>
        <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => load(page)} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Gross Pay (page)</p><p className="font-bold text-gray-900">{fmt(totalGross)}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Deductions (page)</p><p className="font-bold text-red-600">{fmt(totalDeductions)}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500 mb-1">Net Cost (page)</p><p className="font-bold text-gray-900">{fmt(totalNet)}</p></div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Period","Created","Employees","Gross Pay","Deductions","Net Pay","Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
              {!loading && runs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No payroll runs found.</td></tr>}
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap font-medium text-gray-900">
                    {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{r.employeeCount ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{fmt(r.totalGross ?? 0)}</td>
                  <td className="px-4 py-2.5 text-red-600 whitespace-nowrap">{fmt(r.totalDeductions ?? 0)}</td>
                  <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap">{fmt(r.totalNet ?? 0)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PR_STATUS_COLORS[r.status] ?? ""}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
            <p className="text-xs text-gray-500">{total} runs · page {page} of {pages}</p>
            <div className="flex gap-1">
              <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = page - 1; setPage(np); load(np); }} disabled={page <= 1}><ChevronLeft size={12} /></button>
              <button className="btn-secondary text-xs px-2 py-1" onClick={() => { const np = page + 1; setPage(np); load(np); }} disabled={page >= pages}><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main FinancePage ─────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "overview", label: "Overview", icon: TrendingUp },
  { key: "accounts", label: "Cash & Accounts", icon: PiggyBank },
  { key: "income", label: "Income", icon: FileText },
  { key: "expenses", label: "Expenses", icon: TrendingDown },
  { key: "payroll", label: "Payroll Costs", icon: Wallet },
];

export default function FinancePage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [opCosts, setOpCosts] = useState<OperationalCost[]>([]);
  const [genExpenses, setGenExpenses] = useState<GeneralExpense[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const [accounts, setAccounts] = useState<AccountEntry[]>(loadAccounts);

  function handleAccountsChange(updated: AccountEntry[]) {
    setAccounts(updated);
    saveAccounts(updated);
  }

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [invRes, prRes, opRes, genRes] = await Promise.all([
        fetch(`${API}/invoices?pageSize=500`, { headers }),
        fetch(`${API}/payroll/runs?pageSize=500`, { headers }),
        fetch(`${API}/operational-costs?pageSize=500`, { headers }),
        fetch(`${API}/general-expenses?pageSize=500`, { headers }),
      ]);
      const [invJson, prJson, opJson, genJson] = await Promise.all([
        invRes.json(), prRes.json(), opRes.json(), genRes.json(),
      ]);
      setInvoices(invJson.data ?? []);
      setPayrollRuns(prJson.data ?? []);
      setOpCosts(opJson.data ?? []);
      setGenExpenses(genJson.data ?? []);
    } finally {
      setLoadingOverview(false);
    }
  }, [token]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-subtitle">Cash &amp; accounts, income, expenses, and payroll costs</p>
        </div>
        {activeTab === "overview" && (
          <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={loadOverview} disabled={loadingOverview}>
            <RefreshCw size={13} className={loadingOverview ? "animate-spin" : ""} /> Refresh
          </button>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        loadingOverview
          ? <div className="text-center py-16 text-gray-400 text-sm">Loading finance overview…</div>
          : <OverviewTab invoices={invoices} payrollRuns={payrollRuns} opCosts={opCosts} genExpenses={genExpenses} accounts={accounts} />
      )}
      {activeTab === "accounts" && <AccountsTab accounts={accounts} onChange={handleAccountsChange} />}
      {activeTab === "income" && <IncomeTab />}
      {activeTab === "expenses" && <ExpensesTab />}
      {activeTab === "payroll" && <PayrollCostsTab />}
    </div>
  );
}
