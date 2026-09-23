import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Printer } from "lucide-react";
import api from "../../api/client";

interface Client { id: string; name: string; }
interface Site { id: string; siteName: string; }

interface PayrollLineItem {
  id: string;
  employeeId: string;
  employee?: { fullName: string; position: string | null };
  payType: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  paymentStatus: string;
}

interface PayrollRun {
  id: string;
  period: string;
  scope: string;
  status: string;
  clientId: string | null;
  siteId: string | null;
  client?: { name: string } | null;
  site?: { siteName: string } | null;
  totalGrossPay: string;
  totalDeductions: string;
  totalNetPay: string;
  createdBy: string | null;
  reviewedBy: string | null;
  finalizedBy: string | null;
  paidBy: string | null;
  dateCreated: string;
  lineItems?: PayrollLineItem[];
}

interface GenerateFormState {
  period: string;
  scope: string;
  clientId: string;
  siteId: string;
  createdBy: string;
}

interface ValidationResult {
  runId: string;
  period: string;
  status: string;
  totalEmployees: number;
  readyCount: number;
  blockingErrorCount: number;
  warningCount: number;
  canApprove: boolean;
  blockingErrors: { employeeId: string; employeeName: string; issue: string; blocking: boolean }[];
  warnings: { employeeId: string; employeeName: string; issue: string; blocking: boolean }[];
  summary: string;
}

interface CompareResult {
  current: { id: string; period: string; headcount: number; totalGross: number; totalNet: number };
  previous: { id: string; period: string; headcount: number; totalGross: number; totalNet: number };
  diff: { headcount: number; grossPayDiff: number; netPayDiff: number };
  newEmployees: { employeeId: string; name: string; netPay: number }[];
  removedEmployees: { employeeId: string; name: string; netPay: number }[];
  payChanges: { employeeId: string; name: string; previousNet: number; currentNet: number; netDiff: number }[];
}

interface Payslip {
  id: string;
  employeeId: string;
  employee?: { fullName: string; position: string | null };
  payslipNumber: string;
  position: string | null;
  department: string | null;

  basicSalary: string;
  shiftEarnings: string;
  allowanceBreakdown: { name: string; amount: number }[] | null;
  allowances: string;
  overtime: string;
  bonuses: string;
  otherEarnings: string;
  grossPay: string;

  paye: string;
  napsa: string;
  nhima: string;
  loanDeduction: string;
  advanceDeduction: string;
  otherDeductions: string;
  totalDeductions: string;
  netPay: string;

  napsaEmployer: string;
  nhimaEmployer: string;
  totalEmployerContributions: string;

  employeeNumber: string | null;
  nrcNumber: string | null;
  contractStartDate: string | null;
  generatedAt: string;
}

const EMPTY_GENERATE_FORM: GenerateFormState = {
  period: new Date().toISOString().slice(0, 7) + "-01",
  scope: "ALL",
  clientId: "",
  siteId: "",
  createdBy: "",
};

function fmt(n: string | number) {
  return `K ${Number(n).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

function fmtNum(n: number) {
  return `K ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

function statusClass(status: string) {
  switch (status) {
    case "DRAFT": return "bg-gray-100 text-gray-600";
    case "REVIEWED": return "bg-blue-100 text-blue-700";
    case "FINALIZED": return "bg-yellow-100 text-yellow-700";
    case "PAID": return "bg-green-100 text-green-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function printPayrollRun(run: PayrollRun, lineItems: PayrollLineItem[]) {
  const periodLabel = new Date(run.period).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  let scopeLabel = run.scope;
  if (run.scope === "CLIENT" && run.client?.name) scopeLabel = `CLIENT — ${run.client.name}`;
  if (run.scope === "SITE" && run.site?.siteName) scopeLabel = `SITE — ${run.site.siteName}`;

  const totalGross = lineItems.reduce((s, li) => s + Number(li.grossPay), 0);
  const totalDeductions = lineItems.reduce((s, li) => s + Number(li.totalDeductions), 0);
  const totalNet = lineItems.reduce((s, li) => s + Number(li.netPay), 0);

  const rows = lineItems.map((li) => `
    <tr>
      <td>${li.employee?.fullName ?? li.employeeId}</td>
      <td>${li.employee?.position ?? "—"}</td>
      <td>${li.payType}</td>
      <td class="num">${fmt(li.grossPay)}</td>
      <td class="num">${fmt(li.totalDeductions)}</td>
      <td class="num">${fmt(li.netPay)}</td>
      <td class="status ${li.paymentStatus === "PAID" ? "paid" : ""}">${li.paymentStatus}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Payroll Run — ${periodLabel}</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #003770; padding-bottom: 10px; }
  .logo { font-size: 22px; font-weight: 900; color: #003770; letter-spacing: -0.5px; }
  .logo span { color: #09aa4c; }
  .generated { font-size: 10px; color: #666; text-align: right; }
  h1 { font-size: 15px; font-weight: 700; color: #003770; margin-bottom: 3px; }
  .meta { font-size: 10px; color: #555; margin-bottom: 12px; }
  .meta strong { color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead { background: #003770; color: #fff; }
  thead th { padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.num { text-align: right; }
  tbody tr { border-bottom: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 5px 8px; font-size: 10.5px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.status { font-weight: 600; color: #666; }
  td.status.paid { color: #09aa4c; }
  tfoot tr { background: #003770; color: #fff; }
  tfoot td { padding: 6px 8px; font-weight: 700; font-size: 11px; }
  tfoot td.num { text-align: right; }
  .footer { margin-top: 14px; font-size: 9.5px; color: #999; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">MAGEN<span>.</span></div>
    <div class="generated">
      <strong>Magen Security Services</strong><br/>
      Generated: ${generatedDate}
    </div>
  </div>
  <h1>Payroll Run Report &mdash; ${periodLabel}</h1>
  <div class="meta">
    Scope: <strong>${scopeLabel}</strong> &nbsp;&bull;&nbsp; Status: <strong>${run.status}</strong>
  </div>
  <table>
    <thead>
      <tr>
        <th>Guard / Employee</th>
        <th>Position</th>
        <th>Pay Type</th>
        <th class="num">Gross Pay</th>
        <th class="num">Deductions</th>
        <th class="num">Net Pay</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3"><strong>TOTALS</strong></td>
        <td class="num">${fmtNum(totalGross)}</td>
        <td class="num">${fmtNum(totalDeductions)}</td>
        <td class="num">${fmtNum(totalNet)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">Magen Security &middot; Confidential &mdash; For internal use only</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function printPayslip(payslip: Payslip, runPeriod: string) {
  const periodLabel = new Date(runPeriod).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const earningsRows = [
    { label: "Basic Salary", amount: Number(payslip.basicSalary) },
    ...(Number(payslip.shiftEarnings) > 0 ? [{ label: "Shift Earnings", amount: Number(payslip.shiftEarnings) }] : []),
    ...(payslip.allowanceBreakdown && payslip.allowanceBreakdown.length > 0
      ? payslip.allowanceBreakdown.map((a) => ({ label: a.name, amount: Number(a.amount) }))
      : Number(payslip.allowances) > 0
      ? [{ label: "Allowances", amount: Number(payslip.allowances) }]
      : []),
    ...(Number(payslip.overtime) > 0 ? [{ label: "Overtime", amount: Number(payslip.overtime) }] : []),
    ...(Number(payslip.bonuses) > 0 ? [{ label: "Bonuses", amount: Number(payslip.bonuses) }] : []),
    ...(Number(payslip.otherEarnings) > 0 ? [{ label: "Other Earnings", amount: Number(payslip.otherEarnings) }] : []),
  ];

  const deductionRows = [
    ...(Number(payslip.paye) > 0 ? [{ label: "PAYE", amount: Number(payslip.paye) }] : []),
    ...(Number(payslip.napsa) > 0 ? [{ label: "NAPSA", amount: Number(payslip.napsa) }] : []),
    ...(Number(payslip.nhima) > 0 ? [{ label: "NHIMA", amount: Number(payslip.nhima) }] : []),
    ...(Number(payslip.loanDeduction) > 0 ? [{ label: "Loan Repayment", amount: Number(payslip.loanDeduction) }] : []),
    ...(Number(payslip.advanceDeduction) > 0 ? [{ label: "Salary Advance", amount: Number(payslip.advanceDeduction) }] : []),
    ...(Number(payslip.otherDeductions) > 0 ? [{ label: "Other Deductions", amount: Number(payslip.otherDeductions) }] : []),
  ];

  const employerRows = [
    ...(Number(payslip.napsaEmployer) > 0 ? [{ label: "NAPSA (Employer)", amount: Number(payslip.napsaEmployer) }] : []),
    ...(Number(payslip.nhimaEmployer) > 0 ? [{ label: "NHIMA (Employer)", amount: Number(payslip.nhimaEmployer) }] : []),
  ];

  const earningsHtml = earningsRows.map((r) => `
      <tr><td>${r.label}</td><td class="amt">${fmtNum(r.amount)}</td></tr>`).join("");
  const deductionsHtml = deductionRows.length
    ? deductionRows.map((r) => `
      <tr><td class="neg">${r.label}</td><td class="amt neg">- ${fmtNum(r.amount)}</td></tr>`).join("")
    : `<tr><td class="neg">No deductions</td><td class="amt neg">- ${fmtNum(0)}</td></tr>`;
  const employerHtml = employerRows.length
    ? employerRows.map((r) => `
      <tr><td>${r.label}</td><td class="amt">${fmtNum(r.amount)}</td></tr>`).join("")
    : "";

  const refRows: { label: string; value: string }[] = [
    { label: "Payslip No.", value: payslip.payslipNumber },
    ...(payslip.employeeNumber ? [{ label: "Employee No.", value: payslip.employeeNumber }] : []),
    { label: "Position", value: payslip.position ?? payslip.employee?.position ?? "—" },
    ...(payslip.department ? [{ label: "Department", value: payslip.department }] : []),
    ...(payslip.nrcNumber ? [{ label: "NRC No.", value: payslip.nrcNumber }] : []),
    ...(payslip.contractStartDate
      ? [{ label: "Contract Start", value: new Date(payslip.contractStartDate).toLocaleDateString("en-GB") }]
      : []),
  ];
  const refHtml = refRows.map((r) => `<div><span class="ref-label">${r.label}:</span> ${r.value}</div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Payslip — ${payslip.employee?.fullName ?? payslip.employeeId}</title>
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #003770; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { font-size: 20px; font-weight: 900; color: #003770; }
  .logo span { color: #09aa4c; }
  .co { font-size: 9px; color: #666; margin-top: 2px; }
  .slip-label { font-size: 9px; color: #003770; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: right; }
  .slip-date { font-size: 9px; color: #999; text-align: right; margin-top: 2px; }
  .employee-block { margin-bottom: 8px; }
  .employee-name { font-size: 15px; font-weight: 700; color: #003770; }
  .employee-pos { font-size: 10px; color: #555; margin-top: 1px; }
  .period-badge { display: inline-block; background: #f0f4ff; color: #003770; border: 1px solid #c7d6f0; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 600; margin-top: 6px; }
  .ref-block { font-size: 9.5px; color: #555; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; margin: 8px 0 10px; padding: 6px 8px; background: #f9fafb; border-radius: 4px; }
  .ref-label { color: #888; }
  .col-title { font-size: 9.5px; text-transform: uppercase; color: #888; font-weight: 700; margin: 10px 0 2px; }
  .breakdown { width: 100%; border-collapse: collapse; }
  .breakdown th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #888; padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  .breakdown td { padding: 3.5px 6px; font-size: 10.5px; border-bottom: 1px solid #f3f4f6; }
  .breakdown td.amt { text-align: right; font-variant-numeric: tabular-nums; }
  .breakdown td.neg { color: #dc2626; }
  .totals-row td { font-weight: 700; border-top: 1px solid #d1d5db; border-bottom: none !important; }
  .employer-note { font-size: 8.5px; color: #999; margin-top: 2px; font-style: italic; }
  .net-block { margin-top: 12px; background: #003770; color: #fff; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
  .net-label { font-size: 11px; font-weight: 600; opacity: 0.85; }
  .net-amount { font-size: 20px; font-weight: 900; color: #09aa4c; }
  .footer { margin-top: 10px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 5px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">MAGEN<span>.</span></div>
      <div class="co">Magen Security Services</div>
    </div>
    <div>
      <div class="slip-label">Pay Slip</div>
      <div class="slip-date">Generated: ${generatedDate}</div>
    </div>
  </div>
  <div class="employee-block">
    <div class="employee-name">${payslip.employee?.fullName ?? payslip.employeeId}</div>
    <div class="employee-pos">${payslip.position ?? payslip.employee?.position ?? "—"}</div>
    <div class="period-badge">${periodLabel}</div>
  </div>
  <div class="ref-block">${refHtml}</div>

  <div class="col-title">Earnings</div>
  <table class="breakdown">
    <tbody>
      ${earningsHtml}
      <tr class="totals-row"><td>Gross Earnings</td><td class="amt">${fmt(payslip.grossPay)}</td></tr>
    </tbody>
  </table>

  <div class="col-title">Deductions</div>
  <table class="breakdown">
    <tbody>
      ${deductionsHtml}
      <tr class="totals-row"><td class="neg">Total Deductions</td><td class="amt neg">- ${fmt(payslip.totalDeductions)}</td></tr>
    </tbody>
  </table>

  ${employerHtml ? `
  <div class="col-title">Employer Contributions</div>
  <table class="breakdown">
    <tbody>
      ${employerHtml}
      <tr class="totals-row"><td>Total</td><td class="amt">${fmt(payslip.totalEmployerContributions)}</td></tr>
    </tbody>
  </table>
  <div class="employer-note">Paid by the employer on top of gross pay — not deducted from the employee, and not included in Net Pay below.</div>
  ` : ""}

  <div class="net-block">
    <div class="net-label">Take-Home Pay</div>
    <div class="net-amount">${fmt(payslip.netPay)}</div>
  </div>
  <div class="footer">Magen Security &middot; Confidential &mdash; This is a computer-generated payslip</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

type DetailTab = "employees" | "payslips" | "validate" | "compare";

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate form
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateFormState>(EMPTY_GENERATE_FORM);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Detail panel
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("employees");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBy, setActionBy] = useState("");
  const [isActioning, setIsActioning] = useState(false);

  // Payslips
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [isGeneratingPayslips, setIsGeneratingPayslips] = useState(false);

  // Validation
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);

  // Compare
  const [compareRunId, setCompareRunId] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  async function loadRuns() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get("/payroll/runs");
      setRuns(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load payroll runs.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadClients() {
    try {
      const res = await api.get("/clients", { params: { pageSize: 100 } });
      setClients(res.data.data);
    } catch {}
  }

  async function loadSites() {
    try {
      const res = await api.get("/sites", { params: { pageSize: 100 } });
      setSites(res.data.data);
    } catch {}
  }

  useEffect(() => {
    loadRuns();
    loadClients();
    loadSites();
  }, []);

  async function openRunDetail(run: PayrollRun) {
    try {
      const res = await api.get(`/payroll/runs/${run.id}`);
      setSelectedRun(res.data.data);
      setDetailTab("employees");
      setActionError(null);
      setActionBy("");
      setValidation(null);
      setCompareResult(null);
      setCompareError(null);
      setCompareRunId("");
      setPayslips([]);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load run details.");
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setGenerateError(null);
    setIsGenerating(true);
    try {
      const payload: Record<string, unknown> = {
        period: generateForm.period,
        scope: generateForm.scope,
        createdBy: generateForm.createdBy.trim() || null,
      };
      if (generateForm.scope === "CLIENT" && generateForm.clientId) payload.clientId = generateForm.clientId;
      if (generateForm.scope === "SITE" && generateForm.siteId) payload.siteId = generateForm.siteId;
      await api.post("/payroll/runs", payload);
      setShowGenerateForm(false);
      setGenerateForm(EMPTY_GENERATE_FORM);
      await loadRuns();
    } catch (err: any) {
      setGenerateError(err.response?.data?.message ?? "Failed to generate payroll.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleWorkflowAction(action: "review" | "finalize" | "mark-paid") {
    if (!selectedRun) return;
    setActionError(null);
    setIsActioning(true);
    if (!actionBy.trim()) {
      setActionError("Please enter your name first.");
      setIsActioning(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = { performedBy: actionBy.trim() };
      await api.post(`/payroll/runs/${selectedRun.id}/${action}`, payload);
      setActionBy("");
      await openRunDetail(selectedRun);
      await loadRuns();
    } catch (err: any) {
      setActionError(err.response?.data?.message ?? `Failed to ${action}.`);
    } finally {
      setIsActioning(false);
    }
  }

  async function handleGeneratePayslips() {
    if (!selectedRun) return;
    setIsGeneratingPayslips(true);
    setActionError(null);
    try {
      await api.post(`/payroll/runs/${selectedRun.id}/generate-payslips`);
      // Switch to payslips tab and load them
      setDetailTab("payslips");
      await loadPayslips(selectedRun.id);
    } catch (err: any) {
      setActionError(err.response?.data?.message ?? "Failed to generate payslips.");
    } finally {
      setIsGeneratingPayslips(false);
    }
  }

  async function loadPayslips(runId: string) {
    setPayslipsLoading(true);
    try {
      const res = await api.get("/payroll/payslips", { params: { runId, pageSize: 100 } });
      setPayslips(res.data.data ?? []);
    } catch {
      setPayslips([]);
    } finally {
      setPayslipsLoading(false);
    }
  }

  async function loadValidation() {
    if (!selectedRun) return;
    setValidationLoading(true);
    setValidation(null);
    try {
      const res = await api.get(`/payroll/runs/${selectedRun.id}/validate`);
      setValidation(res.data.data);
    } catch (err: any) {
      setActionError(err.response?.data?.message ?? "Failed to run validation.");
    } finally {
      setValidationLoading(false);
    }
  }

  async function handleCompare(e: FormEvent) {
    e.preventDefault();
    if (!selectedRun || !compareRunId.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const res = await api.get(`/payroll/runs/${selectedRun.id}/compare`, {
        params: { previousRunId: compareRunId.trim() },
      });
      setCompareResult(res.data.data);
    } catch (err: any) {
      setCompareError(err.response?.data?.message ?? "Failed to compare runs.");
    } finally {
      setCompareLoading(false);
    }
  }

  function handleDetailTabChange(tab: DetailTab) {
    setDetailTab(tab);
    if (tab === "payslips" && selectedRun && payslips.length === 0) {
      loadPayslips(selectedRun.id);
    }
    if (tab === "validate" && selectedRun && !validation) {
      loadValidation();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">{runs.length} run{runs.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => { setShowGenerateForm(true); setGenerateError(null); setGenerateForm(EMPTY_GENERATE_FORM); }}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700"
        >
          + Generate Payroll Run
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {/* Generate form */}
      {showGenerateForm && (
        <form onSubmit={handleGenerate} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 max-w-lg">
          <h2 className="text-sm font-semibold text-gray-900">Generate Payroll Run</h2>
          {generateError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{generateError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Period *</label>
              <input type="month" required
                value={generateForm.period.slice(0, 7)}
                onChange={(e) => setGenerateForm({ ...generateForm, period: e.target.value + "-01" })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Scope *</label>
              <select value={generateForm.scope}
                onChange={(e) => setGenerateForm({ ...generateForm, scope: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="ALL">All Employees</option>
                <option value="CLIENT">By Client</option>
                <option value="SITE">By Site</option>
              </select>
            </div>
          </div>
          {generateForm.scope === "CLIENT" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Client</label>
              <select value={generateForm.clientId}
                onChange={(e) => setGenerateForm({ ...generateForm, clientId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {generateForm.scope === "SITE" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Site</label>
              <select value={generateForm.siteId}
                onChange={(e) => setGenerateForm({ ...generateForm, siteId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">Select site...</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Created By</label>
            <input value={generateForm.createdBy} placeholder="Your name"
              onChange={(e) => setGenerateForm({ ...generateForm, createdBy: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isGenerating}
              className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60">
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            <button type="button" onClick={() => setShowGenerateForm(false)}
              className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-6 items-start">
        {/* Runs table */}
        <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No payroll runs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-left px-4 py-3">Scope</th>
                  <th className="text-right px-4 py-3">Gross</th>
                  <th className="text-right px-4 py-3">Net Pay</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr key={run.id} className={selectedRun?.id === run.id ? "bg-green-50" : ""}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {new Date(run.period).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {run.scope === "ALL" ? "All Employees" :
                       run.scope === "CLIENT" ? (run.client?.name ?? "Client") :
                       (run.site?.siteName ?? "Site")}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt(run.totalGrossPay)}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(run.totalNetPay)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusClass(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openRunDetail(run)} className="text-green-600 hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Run detail panel */}
        {selectedRun && (
          <div className="w-96 shrink-0 bg-white border border-gray-200 rounded-lg self-start">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {new Date(selectedRun.period).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(selectedRun.status)}`}>
                  {selectedRun.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printPayrollRun(selectedRun, selectedRun.lineItems ?? [])}
                  title="Print Run"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                >
                  <Printer size={12} />
                  Print Run
                </button>
                <button onClick={() => setSelectedRun(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Gross</p>
                <p className="text-xs font-medium text-gray-800">{fmt(selectedRun.totalGrossPay)}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Deductions</p>
                <p className="text-xs font-medium text-red-600">- {fmt(selectedRun.totalDeductions)}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Net Pay</p>
                <p className="text-xs font-semibold text-green-600">{fmt(selectedRun.totalNetPay)}</p>
              </div>
            </div>

            {/* Detail tabs */}
            <div className="flex border-b border-gray-100 text-xs">
              {(["employees", "payslips", "validate", "compare"] as DetailTab[]).map((t) => (
                <button key={t}
                  onClick={() => handleDetailTabChange(t)}
                  className={`flex-1 py-2 font-medium capitalize ${detailTab === t ? "border-b-2 border-green-600 text-green-700" : "text-gray-500 hover:text-gray-700"}`}>
                  {t === "validate" ? "Validate" : t === "compare" ? "Compare" : t === "payslips" ? "Payslips" : "Employees"}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {/* Employees tab */}
              {detailTab === "employees" && (
                <>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    {selectedRun.createdBy && <p>Created by <span className="text-gray-700">{selectedRun.createdBy}</span></p>}
                    {selectedRun.reviewedBy && <p>Reviewed by <span className="text-gray-700">{selectedRun.reviewedBy}</span></p>}
                    {selectedRun.finalizedBy && <p>Finalized by <span className="text-gray-700">{selectedRun.finalizedBy}</span></p>}
                    {selectedRun.paidBy && <p>Paid by <span className="text-gray-700">{selectedRun.paidBy}</span></p>}
                  </div>

                  {selectedRun.lineItems && selectedRun.lineItems.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 uppercase">Employees ({selectedRun.lineItems.length})</p>
                      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                        {selectedRun.lineItems.map((li) => (
                          <div key={li.id} className="flex items-center justify-between py-1.5 text-xs">
                            <div>
                              <p className="font-medium text-gray-900">{li.employee?.fullName}</p>
                              <p className="text-gray-400">{li.payType}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{fmt(li.netPay)}</p>
                              <span className={li.paymentStatus === "PAID" ? "text-green-600" : "text-gray-400"}>
                                {li.paymentStatus}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {actionError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{actionError}</div>
                  )}

                  {/* Workflow actions */}
                  {selectedRun.status !== "PAID" && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-600">Your name</label>
                        <input value={actionBy} placeholder="e.g. Fannwell"
                          onChange={(e) => setActionBy(e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                      </div>
                      {selectedRun.status === "DRAFT" && (
                        <button onClick={() => handleWorkflowAction("review")} disabled={isActioning}
                          className="w-full text-sm bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700 disabled:opacity-60">
                          {isActioning ? "..." : "Mark as Reviewed"}
                        </button>
                      )}
                      {selectedRun.status === "REVIEWED" && (
                        <button onClick={() => handleWorkflowAction("finalize")} disabled={isActioning}
                          className="w-full text-sm bg-yellow-600 text-white rounded px-3 py-2 hover:bg-yellow-700 disabled:opacity-60">
                          {isActioning ? "..." : "Finalize"}
                        </button>
                      )}
                      {selectedRun.status === "FINALIZED" && (
                        <button onClick={() => handleWorkflowAction("mark-paid")} disabled={isActioning}
                          className="w-full text-sm bg-green-600 text-white rounded px-3 py-2 hover:bg-green-700 disabled:opacity-60">
                          {isActioning ? "..." : "Mark as Paid"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Generate Payslips — available once FINALIZED or PAID */}
                  {(selectedRun.status === "FINALIZED" || selectedRun.status === "PAID") && (
                    <div className="border-t pt-3">
                      <button onClick={handleGeneratePayslips} disabled={isGeneratingPayslips}
                        className="w-full text-sm border border-green-600 text-green-700 rounded px-3 py-2 hover:bg-green-50 disabled:opacity-60">
                        {isGeneratingPayslips ? "Generating payslips..." : "Generate / Refresh Payslips"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Payslips tab */}
              {detailTab === "payslips" && (
                <div className="space-y-2">
                  {(selectedRun.status === "FINALIZED" || selectedRun.status === "PAID") && (
                    <button onClick={handleGeneratePayslips} disabled={isGeneratingPayslips}
                      className="w-full text-xs border border-green-600 text-green-700 rounded px-2 py-1.5 hover:bg-green-50 disabled:opacity-60">
                      {isGeneratingPayslips ? "Generating..." : "Generate / Refresh Payslips"}
                    </button>
                  )}
                  {payslipsLoading ? (
                    <p className="text-xs text-gray-500">Loading payslips...</p>
                  ) : payslips.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {selectedRun.status === "FINALIZED" || selectedRun.status === "PAID"
                        ? "No payslips yet — click Generate above."
                        : "Payslips are only available once the run is Finalized."}
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {payslips.map((ps) => (
                        <div key={ps.id} className="py-2 flex justify-between text-xs items-center">
                          <div>
                            <p className="font-medium text-gray-900">{ps.employee?.fullName}</p>
                            <p className="text-gray-400">{ps.employee?.position ?? "—"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-medium text-green-700">{fmt(ps.netPay)}</p>
                              <p className="text-gray-400">Gross {fmt(ps.grossPay)}</p>
                            </div>
                            <button
                              onClick={() => printPayslip(ps, selectedRun.period)}
                              title="Print payslip"
                              className="text-gray-400 hover:text-gray-700 border border-gray-200 rounded p-1 hover:bg-gray-50"
                            >
                              <Printer size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Validate tab */}
              {detailTab === "validate" && (
                <div className="space-y-3">
                  <button onClick={loadValidation} disabled={validationLoading}
                    className="w-full text-xs border border-gray-300 text-gray-700 rounded px-2 py-1.5 hover:bg-gray-50 disabled:opacity-60">
                    {validationLoading ? "Running..." : "Run Validation Check"}
                  </button>
                  {validation && (
                    <div className="space-y-2">
                      <p className={`text-xs font-medium px-2 py-1.5 rounded ${validation.canApprove ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {validation.summary}
                      </p>
                      <div className="grid grid-cols-3 gap-1 text-center text-xs">
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className="font-semibold text-gray-800">{validation.totalEmployees}</p>
                          <p className="text-gray-400">Employees</p>
                        </div>
                        <div className="bg-green-50 rounded p-1.5">
                          <p className="font-semibold text-green-700">{validation.readyCount}</p>
                          <p className="text-gray-400">Ready</p>
                        </div>
                        <div className={`rounded p-1.5 ${validation.blockingErrorCount > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                          <p className={`font-semibold ${validation.blockingErrorCount > 0 ? "text-red-700" : "text-gray-800"}`}>{validation.blockingErrorCount}</p>
                          <p className="text-gray-400">Errors</p>
                        </div>
                      </div>
                      {validation.blockingErrors.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-red-600">Blocking Errors</p>
                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {validation.blockingErrors.map((e, i) => (
                              <div key={i} className="bg-red-50 rounded px-2 py-1 text-xs">
                                <span className="font-medium text-gray-800">{e.employeeName}</span>
                                <span className="text-red-600"> — {e.issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {validation.warnings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-yellow-600">Warnings</p>
                          <div className="max-h-28 overflow-y-auto space-y-1">
                            {validation.warnings.map((w, i) => (
                              <div key={i} className="bg-yellow-50 rounded px-2 py-1 text-xs">
                                <span className="font-medium text-gray-800">{w.employeeName}</span>
                                <span className="text-yellow-700"> — {w.issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Compare tab */}
              {detailTab === "compare" && (
                <div className="space-y-3">
                  <form onSubmit={handleCompare} className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-600">Compare against (previous run ID)</label>
                      <select value={compareRunId}
                        onChange={(e) => setCompareRunId(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs">
                        <option value="">Select a run to compare with...</option>
                        {runs.filter((r) => r.id !== selectedRun.id).map((r) => (
                          <option key={r.id} value={r.id}>
                            {new Date(r.period).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} — {r.status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" disabled={!compareRunId || compareLoading}
                      className="w-full text-xs border border-gray-300 text-gray-700 rounded px-2 py-1.5 hover:bg-gray-50 disabled:opacity-60">
                      {compareLoading ? "Comparing..." : "Compare"}
                    </button>
                  </form>

                  {compareError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{compareError}</p>
                  )}

                  {compareResult && (
                    <div className="space-y-3">
                      {/* Diff summary */}
                      <div className="grid grid-cols-3 gap-1 text-center text-xs">
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className={`font-semibold ${compareResult.diff.headcount > 0 ? "text-green-700" : compareResult.diff.headcount < 0 ? "text-red-600" : "text-gray-800"}`}>
                            {compareResult.diff.headcount > 0 ? "+" : ""}{compareResult.diff.headcount}
                          </p>
                          <p className="text-gray-400">Headcount</p>
                        </div>
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className={`font-semibold ${compareResult.diff.grossPayDiff > 0 ? "text-red-600" : compareResult.diff.grossPayDiff < 0 ? "text-green-700" : "text-gray-800"}`}>
                            {compareResult.diff.grossPayDiff > 0 ? "+" : ""}{fmtNum(compareResult.diff.grossPayDiff)}
                          </p>
                          <p className="text-gray-400">Gross Δ</p>
                        </div>
                        <div className="bg-gray-50 rounded p-1.5">
                          <p className={`font-semibold ${compareResult.diff.netPayDiff > 0 ? "text-red-600" : compareResult.diff.netPayDiff < 0 ? "text-green-700" : "text-gray-800"}`}>
                            {compareResult.diff.netPayDiff > 0 ? "+" : ""}{fmtNum(compareResult.diff.netPayDiff)}
                          </p>
                          <p className="text-gray-400">Net Δ</p>
                        </div>
                      </div>

                      {compareResult.newEmployees.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-green-600 mb-1">New ({compareResult.newEmployees.length})</p>
                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {compareResult.newEmployees.map((e) => (
                              <div key={e.employeeId} className="flex justify-between text-xs">
                                <span className="text-gray-700">{e.name}</span>
                                <span className="text-green-700">{fmtNum(e.netPay)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {compareResult.removedEmployees.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-600 mb-1">Removed ({compareResult.removedEmployees.length})</p>
                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {compareResult.removedEmployees.map((e) => (
                              <div key={e.employeeId} className="flex justify-between text-xs">
                                <span className="text-gray-700">{e.name}</span>
                                <span className="text-red-600">{fmtNum(e.netPay)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {compareResult.payChanges.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1">Pay Changes ({compareResult.payChanges.length})</p>
                          <div className="space-y-0.5 max-h-28 overflow-y-auto">
                            {compareResult.payChanges.map((c) => (
                              <div key={c.employeeId} className="flex justify-between text-xs">
                                <span className="text-gray-700">{c.name}</span>
                                <span className={c.netDiff > 0 ? "text-red-600" : "text-green-700"}>
                                  {c.netDiff > 0 ? "+" : ""}{fmtNum(c.netDiff)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {compareResult.newEmployees.length === 0 && compareResult.removedEmployees.length === 0 && compareResult.payChanges.length === 0 && (
                        <p className="text-xs text-gray-500">No differences found between the two runs.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
