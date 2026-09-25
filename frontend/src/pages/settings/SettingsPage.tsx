import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Settings, Clock, Gift, Minus, ShieldCheck, Plus, ToggleLeft, ToggleRight,
  Receipt, AlertTriangle,
} from "lucide-react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";

interface LookupRow {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

interface DeductionTypeRef {
  id: string;
  name: string;
}

interface StatutoryRule {
  id: string;
  name: string;
  ruleType: "PERCENTAGE" | "FIXED" | "BRACKETED";
  deductionTypeId: string;
  employeeRate: string | null;
  employerRate: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  deductionType?: { id: string; name: string };
}

type Tab = "shiftTypes" | "allowanceTypes" | "deductionTypes" | "statutoryRules" | "invoicing";

const TAB_CONFIG: Record<
  Exclude<Tab, "statutoryRules">,
  { label: string; endpoint: string; hasDescription: boolean; icon: React.ElementType }
> = {
  shiftTypes:     { label: "Shift Types",      endpoint: "/shift-types",     hasDescription: false, icon: Clock },
  allowanceTypes: { label: "Allowance Types",  endpoint: "/allowance-types", hasDescription: true,  icon: Gift },
  deductionTypes: { label: "Deduction Types",  endpoint: "/deduction-types", hasDescription: true,  icon: Minus },
  // Never actually read — the Invoicing tab has its own dedicated render
  // path (see `tab === "invoicing"` below) and never goes through the
  // generic TAB_CONFIG[tab] lookup that shiftTypes/allowanceTypes/
  // deductionTypes/statutoryRules use. This entry exists only so
  // TAB_CONFIG's type (which requires every non-statutoryRules Tab) is
  // satisfied — omitting it is what broke every deploy since 2026-09-25.
  invoicing:      { label: "Invoicing", endpoint: "", hasDescription: false, icon: Receipt },
};

const BASE_TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "shiftTypes",     label: "Shift Types",      icon: Clock },
  { key: "allowanceTypes", label: "Allowance Types",  icon: Gift },
  { key: "deductionTypes", label: "Deduction Types",  icon: Minus },
  { key: "statutoryRules", label: "Statutory Rules",  icon: ShieldCheck },
];

const ADMIN_ONLY_TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "invoicing", label: "Invoicing", icon: Receipt },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const ALL_TABS = isAdmin ? [...BASE_TABS, ...ADMIN_ONLY_TABS] : BASE_TABS;
  const [tab, setTab] = useState<Tab>("shiftTypes");

  // ── Invoicing tab state (Admin only) ──────────────────────────────────────
  const [nextInvoiceSeq, setNextInvoiceSeq] = useState("");
  const [invoicingLoading, setInvoicingLoading] = useState(false);
  const [invoicingError, setInvoicingError] = useState<string | null>(null);
  const [invoicingSaving, setInvoicingSaving] = useState(false);
  const [invoicingSaved, setInvoicingSaved] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wipeResetTo, setWipeResetTo] = useState("399");
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeResult, setWipeResult] = useState<{ deletedInvoices: number; deletedPayments: number } | null>(null);

  const currentYear = new Date().getFullYear();

  async function loadInvoicing() {
    setInvoicingLoading(true);
    setInvoicingError(null);
    try {
      const res = await api.get("/settings/finance");
      const sequences = res.data.data?.invoiceNumberSequences ?? {};
      setNextInvoiceSeq(String(sequences[String(currentYear)] ?? 1));
    } catch (err: any) {
      setInvoicingError(err.response?.data?.message ?? "Failed to load invoicing settings.");
    } finally {
      setInvoicingLoading(false);
    }
  }

  async function saveInvoicing(e: FormEvent) {
    e.preventDefault();
    setInvoicingSaving(true);
    setInvoicingError(null);
    setInvoicingSaved(false);
    try {
      const res = await api.get("/settings/finance");
      const sequences = { ...(res.data.data?.invoiceNumberSequences ?? {}) };
      sequences[String(currentYear)] = Number(nextInvoiceSeq);
      await api.put("/settings/finance", { invoiceNumberSequences: sequences });
      setInvoicingSaved(true);
    } catch (err: any) {
      setInvoicingError(err.response?.data?.message ?? "Failed to save.");
    } finally {
      setInvoicingSaving(false);
    }
  }

  const WIPE_PHRASE = "DELETE ALL INVOICES";

  async function handleWipeAll() {
    if (wipeConfirmText !== WIPE_PHRASE) return;
    setWiping(true);
    setWipeError(null);
    setWipeResult(null);
    try {
      const resetNumberingTo = wipeResetTo.trim() ? Number(wipeResetTo) : undefined;
      const res = await api.delete("/invoices", {
        data: { confirm: "WIPE_ALL_INVOICES", resetNumberingTo },
      });
      setWipeResult(res.data.data);
      setWipeConfirmText("");
      if (resetNumberingTo) setNextInvoiceSeq(String(resetNumberingTo));
    } catch (err: any) {
      setWipeError(err.response?.data?.message ?? "Failed to wipe invoices.");
    } finally {
      setWiping(false);
    }
  }

  // Lookup tabs state
  const [rows, setRows]               = useState<LookupRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [formName, setFormName]       = useState("");
  const [formDesc, setFormDesc]       = useState("");
  const [formError, setFormError]     = useState<string | null>(null);
  const [isSaving, setIsSaving]       = useState(false);

  // Statutory rules state
  const [rules, setRules]                   = useState<StatutoryRule[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<DeductionTypeRef[]>([]);
  const [showRuleForm, setShowRuleForm]     = useState(false);
  const [ruleForm, setRuleForm]             = useState({
    name: "", ruleType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    deductionTypeId: "", employeeRate: "", employerRate: "", effectiveFrom: "",
  });

  async function loadTab(t: Tab) {
    if (t === "invoicing") {
      await loadInvoicing();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (t === "statutoryRules") {
        const [rRes, dRes] = await Promise.all([
          api.get("/statutory-rules"),
          api.get("/deduction-types"),
        ]);
        setRules(rRes.data.data);
        setDeductionTypes(dRes.data.data);
      } else {
        const res = await api.get(TAB_CONFIG[t].endpoint);
        setRows(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTab(tab);
    setShowForm(false);
    setShowRuleForm(false);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleLookupSubmit(e: FormEvent) {
    e.preventDefault();
    if (tab === "statutoryRules") return;
    setFormError(null);
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = { name: formName.trim() };
      if (TAB_CONFIG[tab].hasDescription) payload.description = formDesc.trim() || null;
      await api.post(TAB_CONFIG[tab].endpoint, payload);
      setShowForm(false);
      setFormName(""); setFormDesc("");
      await loadTab(tab);
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(row: LookupRow) {
    try {
      await api.put(`${TAB_CONFIG[tab as Exclude<Tab, "statutoryRules">].endpoint}/${row.id}`, {
        isActive: !row.isActive,
      });
      await loadTab(tab);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update.");
    }
  }

  async function handleRuleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      await api.post("/statutory-rules", {
        name: ruleForm.name.trim(),
        ruleType: ruleForm.ruleType,
        deductionTypeId: ruleForm.deductionTypeId,
        employeeRate:  ruleForm.employeeRate  ? Number(ruleForm.employeeRate)  : null,
        employerRate:  ruleForm.employerRate  ? Number(ruleForm.employerRate)  : null,
        effectiveFrom: ruleForm.effectiveFrom,
      });
      setShowRuleForm(false);
      setRuleForm({ name: "", ruleType: "PERCENTAGE", deductionTypeId: "", employeeRate: "", employerRate: "", effectiveFrom: "" });
      await loadTab("statutoryRules");
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save rule.");
    } finally {
      setIsSaving(false);
    }
  }

  const isLookupTab = tab !== "statutoryRules" && tab !== "invoicing";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings size={22} className="text-magen-green" />
            Settings
          </h1>
          <p className="page-subtitle">Manage shift types, allowances, deductions, and statutory rules</p>
        </div>
        {tab !== "invoicing" && (
          <button
            onClick={() => isLookupTab ? setShowForm(true) : setShowRuleForm(true)}
            className="btn-primary"
          >
            <Plus size={15} />
            Add {isLookupTab ? TAB_CONFIG[tab].label.replace(/s$/, "") : "Rule"}
          </button>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {ALL_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* ── Lookup tab form ── */}
      {isLookupTab && showForm && (
        <Modal
          title={`New ${TAB_CONFIG[tab].label.replace(/s$/, "")}`}
          onClose={() => setShowForm(false)}
          widthClass="max-w-md"
        >
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{formError}</div>
          )}
          <form onSubmit={handleLookupSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input"
                placeholder="Enter name"
              />
            </div>
            {TAB_CONFIG[tab].hasDescription && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="input"
                  placeholder="Optional description"
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Lookup tab table ── */}
      {isLookupTab && (
        <div className="card overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No {TAB_CONFIG[tab].label.toLowerCase()} found.{" "}
              <button className="text-magen-green hover:underline" onClick={() => setShowForm(true)}>
                Add one
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  {TAB_CONFIG[tab].hasDescription && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    {TAB_CONFIG[tab].hasDescription && (
                      <td className="px-4 py-3 text-gray-500">{row.description ?? "—"}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        row.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(row)}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
                        title={row.isActive ? "Deactivate" : "Activate"}
                      >
                        {row.isActive
                          ? <ToggleRight size={18} className="text-magen-green" />
                          : <ToggleLeft size={18} />
                        }
                        {row.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Statutory Rules form ── */}
      {tab === "statutoryRules" && showRuleForm && (
        <Modal
          title="New Statutory Rule"
          onClose={() => setShowRuleForm(false)}
          widthClass="max-w-md"
        >
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{formError}</div>
          )}
          <form onSubmit={handleRuleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input required value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="input" placeholder="e.g. NAPSA Employee Contribution" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deduction Type *</label>
              <select required value={ruleForm.deductionTypeId} onChange={(e) => setRuleForm({ ...ruleForm, deductionTypeId: e.target.value })} className="select">
                <option value="" disabled>Select deduction type…</option>
                {deductionTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rule Type</label>
              <select value={ruleForm.ruleType} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value as "PERCENTAGE" | "FIXED" })} className="select">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed Amount</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employee Rate</label>
                <input type="number" step="0.0001" value={ruleForm.employeeRate} onChange={(e) => setRuleForm({ ...ruleForm, employeeRate: e.target.value })} className="input" placeholder="0.05" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employer Rate</label>
                <input type="number" step="0.0001" value={ruleForm.employerRate} onChange={(e) => setRuleForm({ ...ruleForm, employerRate: e.target.value })} className="input" placeholder="0.05" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Effective From *</label>
              <input type="date" required value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })} className="input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? "Saving…" : "Save Rule"}
              </button>
              <button type="button" onClick={() => setShowRuleForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Statutory Rules table ── */}
      {tab === "statutoryRules" && (
        <div className="card overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No statutory rules found.{" "}
              <button className="text-magen-green hover:underline" onClick={() => setShowRuleForm(true)}>
                Add one
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deduction Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rule Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Emp. Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employer Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Effective From</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{rule.name}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.deductionType?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.ruleType}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.employeeRate != null ? `${(Number(rule.employeeRate) * 100).toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.employerRate != null ? `${(Number(rule.employerRate) * 100).toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.effectiveFrom ? new Date(rule.effectiveFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        rule.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Invoicing tab (Admin only) ─────────────────────────────────────── */}
      {tab === "invoicing" && isAdmin && (
        <div className="space-y-6 max-w-xl">
          {invoicingError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{invoicingError}</div>
          )}

          {/* Numbering */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Receipt size={16} className="text-magen-green" /> Invoice Numbering
            </h2>
            <p className="text-sm text-gray-500">
              The next invoice created in {currentYear} will be numbered <span className="font-mono">INV-{currentYear}-{String(nextInvoiceSeq || 1).padStart(4, "0")}</span>.
              Change the number below to continue a different sequence.
            </p>
            {invoicingLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : (
              <form onSubmit={saveInvoicing} className="flex items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Next invoice number ({currentYear})</label>
                  <input
                    type="number"
                    min={1}
                    className="input w-40"
                    value={nextInvoiceSeq}
                    onChange={(e) => { setNextInvoiceSeq(e.target.value); setInvoicingSaved(false); }}
                  />
                </div>
                <button type="submit" disabled={invoicingSaving} className="btn-primary">
                  {invoicingSaving ? "Saving…" : "Save"}
                </button>
                {invoicingSaved && <span className="text-xs text-magen-green">Saved.</span>}
              </form>
            )}
          </div>

          {/* Danger zone */}
          <div className="card space-y-3 border-red-200">
            <h2 className="font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} /> Danger Zone
            </h2>
            <p className="text-sm text-gray-600">
              Permanently deletes <strong>every invoice and payment record</strong> in the system — including
              issued and paid ones. Use this only to clear out trial/test data before going live. This cannot be undone.
            </p>
            {wipeError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{wipeError}</div>
            )}
            {wipeResult && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Deleted {wipeResult.deletedInvoices} invoice(s) and {wipeResult.deletedPayments} payment(s).
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Restart numbering at ({currentYear})</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={wipeResetTo}
                  onChange={(e) => setWipeResetTo(e.target.value)}
                  placeholder="e.g. 399"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Type <span className="font-mono">{WIPE_PHRASE}</span> to confirm
                </label>
                <input
                  className="input"
                  value={wipeConfirmText}
                  onChange={(e) => setWipeConfirmText(e.target.value)}
                  placeholder={WIPE_PHRASE}
                />
              </div>
            </div>
            <button
              onClick={handleWipeAll}
              disabled={wiping || wipeConfirmText !== WIPE_PHRASE}
              className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {wiping ? "Deleting…" : "Delete ALL invoices and payments"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
