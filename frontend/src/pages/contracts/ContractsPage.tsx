import { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { Pencil, FileText, X } from "lucide-react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

type ContractStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "INACTIVE";
type BillingFrequency = "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "ONE_OFF";
type PayType = "MONTHLY" | "SHIFT";

interface ClientLite {
  id: string;
  name: string;
}
interface EmployeeLite {
  id: string;
  fullName: string;
}
interface SiteLite {
  id: string;
  siteName: string;
}

interface ClientContract {
  id: string;
  clientId: string;
  client?: ClientLite;
  siteId: string | null;
  site?: SiteLite | null;
  startDate: string;
  endDate: string;
  amount: string;
  billingFrequency: BillingFrequency;
  status: ContractStatus;
  notes: string | null;
}

interface EmployeeContract {
  id: string;
  employeeId: string;
  employee?: EmployeeLite;
  startDate: string;
  endDate: string;
  payType: PayType;
  salary: string | null;
  shiftRate: string | null;
  extraShiftRate: string | null;
  status: ContractStatus;
  notes: string | null;
}

// status is deliberately never an input field anywhere on this page -
// it's calculated server-side from startDate/endDate, cached, and
// returned read-only. See ClientContract.status / EmployeeContract.status
// comments in schema.prisma.
function StatusBadge({ status }: { status: ContractStatus }) {
  const styles: Record<ContractStatus, string> = {
    ACTIVE: "bg-magen-green-light text-magen-green-dark",
    EXPIRING_SOON: "bg-amber-100 text-amber-700",
    EXPIRED: "bg-red-100 text-red-700",
    INACTIVE: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={"text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 " + styles[status]}>
      {status.replace("_", " ")}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY per API conventions
}

export default function ContractsPage() {
  const { user } = useAuth();
  const canSeeFinancials = user?.role === "ADMIN" || user?.role === "HR" || user?.role === "PAYROLL";
  const [tab, setTab] = useState<"client" | "employee">("client");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">Client and employee contracts</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("client")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px " +
            (tab === "client"
              ? "border-magen-green text-magen-green-dark"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          Client Contracts
        </button>
        <button
          onClick={() => setTab("employee")}
          className={
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px " +
            (tab === "employee"
              ? "border-magen-green text-magen-green-dark"
              : "border-transparent text-gray-500 hover:text-gray-700")
          }
        >
          Employee Contracts
        </button>
      </div>

      {tab === "client" ? <ClientContractsTab /> : <EmployeeContractsTab />}
    </div>
  );
}

// ---------- Client Contracts ----------

const EMPTY_CLIENT_FORM = {
  clientId: "",
  siteId: "",
  startDate: "",
  endDate: "",
  amount: "",
  billingFrequency: "MONTHLY" as BillingFrequency,
  notes: "",
};

interface ClientContractModalProps {
  editingId: string | "new";
  form: typeof EMPTY_CLIENT_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_CLIENT_FORM>>;
  formError: string | null;
  isSaving: boolean;
  clients: ClientLite[];
  sites: SiteLite[];
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

function ClientContractModal({
  editingId,
  form,
  setForm,
  formError,
  isSaving,
  clients,
  sites,
  onClose,
  onSubmit,
}: ClientContractModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId === "new" ? "Add Contract" : "Edit Contract"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form content */}
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
                disabled={editingId !== "new"}
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {editingId !== "new" && (
                <p className="text-xs text-gray-500">Client can't be changed after creation.</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Site (optional)</label>
              <select
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">No specific site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Start Date *</label>
                <input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">End Date *</label>
                <input
                  required
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Amount (K) *</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Billing Frequency</label>
                <select
                  value={form.billingFrequency}
                  onChange={(e) =>
                    setForm({ ...form, billingFrequency: e.target.value as BillingFrequency })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUALLY">Annually</option>
                  <option value="ONE_OFF">One-off</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientContractsTab() {
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_CLIENT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [contractsRes, clientsRes, sitesRes] = await Promise.all([
        api.get("/client-contracts"),
        api.get("/clients", { params: { pageSize: 100 } }),
        api.get("/sites", { params: { pageSize: 100 } }),
      ]);
      setContracts(contractsRes.data.data);
      setClients(clientsRes.data.data);
      setSites(sitesRes.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load client contracts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateForm() {
    setForm(EMPTY_CLIENT_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEditForm(c: ClientContract) {
    setForm({
      clientId: c.clientId,
      siteId: c.siteId ?? "",
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      amount: c.amount,
      billingFrequency: c.billingFrequency,
      notes: c.notes ?? "",
    });
    setFormError(null);
    setEditingId(c.id);
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
      siteId: form.siteId || null,
      startDate: form.startDate,
      endDate: form.endDate,
      amount: Number(form.amount),
      billingFrequency: form.billingFrequency,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/client-contracts", payload);
      } else if (editingId) {
        // clientId is not editable after creation on the backend - only
        // send fields the PUT endpoint actually accepts.
        const { clientId, ...editable } = payload;
        await api.put(`/client-contracts/${editingId}`, editable);
      }
      closeForm();
      await loadAll();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save contract.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {editingId !== null && (
        <ClientContractModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          clients={clients}
          sites={sites}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={openCreateForm}
            className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"
          >
            + Add Client Contract
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="text-sm text-gray-500">No client contracts found.</div>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => (
              <div
                key={c.id}
                className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                  <FileText size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{c.client?.name ?? c.clientId}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.site?.siteName ?? "—"} · {formatDate(c.startDate)}–{formatDate(c.endDate)} ·{" "}
                    {c.billingFrequency}
                  </p>
                </div>

                {canSeeFinancials && (
                  <p className="text-sm text-gray-900 flex-shrink-0">K{Number(c.amount).toLocaleString()}</p>
                )}

                <StatusBadge status={c.status} />

                <button
                  onClick={() => openEditForm(c)}
                  title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy flex-shrink-0"
                >
                  <Pencil size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Employee Contracts ----------

const EMPTY_EMPLOYEE_FORM = {
  employeeId: "",
  startDate: "",
  endDate: "",
  payType: "MONTHLY" as PayType,
  salary: "",
  shiftRate: "",
  extraShiftRate: "",
  notes: "",
};

interface EmployeeContractModalProps {
  editingId: string | "new";
  form: typeof EMPTY_EMPLOYEE_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_EMPLOYEE_FORM>>;
  formError: string | null;
  isSaving: boolean;
  employees: EmployeeLite[];
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

function EmployeeContractModal({
  editingId,
  form,
  setForm,
  formError,
  isSaving,
  employees,
  onClose,
  onSubmit,
}: EmployeeContractModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId === "new" ? "Add Contract" : "Edit Contract"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form content */}
        <form onSubmit={onSubmit}>
          <div className="px-6 py-5 space-y-4">
            {formError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Employee *</label>
              <select
                required
                disabled={editingId !== "new"}
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="">Select an employee...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
              {editingId !== "new" && (
                <p className="text-xs text-gray-500">Employee can't be changed after creation.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Start Date *</label>
                <input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">End Date *</label>
                <input
                  required
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Pay Type</label>
              <select
                value={form.payType}
                onChange={(e) => setForm({ ...form, payType: e.target.value as PayType })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="MONTHLY">Monthly salary</option>
                <option value="SHIFT">Per shift</option>
              </select>
            </div>

            {form.payType === "MONTHLY" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Monthly Salary (K) *</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Shift Rate (K) *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.shiftRate}
                    onChange={(e) => setForm({ ...form, shiftRate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Extra Shift Rate (K)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Defaults to shift rate"
                    value={form.extraShiftRate}
                    onChange={(e) => setForm({ ...form, extraShiftRate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmployeeContractsTab() {
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [contractsRes, employeesRes] = await Promise.all([
        api.get("/employee-contracts"),
        // Terminated employees shouldn't show up for new contracts, and
        // their existing contracts are filtered out of the list below.
        api.get("/employees", { params: { pageSize: 100, employmentStatus: "ACTIVE" } }),
      ]);
      setContracts(contractsRes.data.data);
      setEmployees(employeesRes.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load employee contracts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `employees` only holds ACTIVE employees (see loadAll), so any contract
  // whose employeeId isn't in this set belongs to someone who's since been
  // terminated — hide those from the list below.
  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);
  const visibleContracts = useMemo(
    () => contracts.filter((c) => activeEmployeeIds.has(c.employeeId)),
    [contracts, activeEmployeeIds]
  );

  function openCreateForm() {
    setForm(EMPTY_EMPLOYEE_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEditForm(c: EmployeeContract) {
    setForm({
      employeeId: c.employeeId,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      payType: c.payType,
      salary: c.salary ?? "",
      shiftRate: c.shiftRate ?? "",
      extraShiftRate: c.extraShiftRate ?? "",
      notes: c.notes ?? "",
    });
    setFormError(null);
    setEditingId(c.id);
  }

  function closeForm() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    // Only send the rate field relevant to the chosen payType - matches
    // the backend's own validation (MONTHLY requires salary; SHIFT
    // requires shiftRate, extraShiftRate optional).
    const payload: Record<string, unknown> = {
      employeeId: form.employeeId,
      startDate: form.startDate,
      endDate: form.endDate,
      payType: form.payType,
      notes: form.notes.trim() || null,
    };
    if (form.payType === "MONTHLY") {
      payload.salary = Number(form.salary);
    } else {
      payload.shiftRate = Number(form.shiftRate);
      if (form.extraShiftRate) payload.extraShiftRate = Number(form.extraShiftRate);
    }

    try {
      if (editingId === "new") {
        await api.post("/employee-contracts", payload);
      } else if (editingId) {
        const { employeeId, ...editable } = payload;
        await api.put(`/employee-contracts/${editingId}`, editable);
      }
      closeForm();
      await loadAll();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save contract.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {editingId !== null && (
        <EmployeeContractModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          formError={formError}
          isSaving={isSaving}
          employees={employees}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={openCreateForm}
            className="bg-magen-green text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"
          >
            + Add Employee Contract
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : visibleContracts.length === 0 ? (
          <div className="text-sm text-gray-500">No employee contracts found.</div>
        ) : (
          <div className="space-y-2">
            {visibleContracts.map((c) => (
              <div
                key={c.id}
                className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-magen-green-light text-magen-green-dark flex items-center justify-center flex-shrink-0">
                  <FileText size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {c.employee?.fullName ?? c.employeeId}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {formatDate(c.startDate)}–{formatDate(c.endDate)} ·{" "}
                    {c.payType === "MONTHLY" ? "Monthly salary" : "Per shift"}
                  </p>
                </div>

                <p className="text-sm text-gray-900 flex-shrink-0">
                  {c.payType === "MONTHLY"
                    ? `K${Number(c.salary).toLocaleString()}/mo`
                    : `K${Number(c.shiftRate).toLocaleString()}/shift`}
                </p>

                <StatusBadge status={c.status} />

                <button
                  onClick={() => openEditForm(c)}
                  title="Edit"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-magen-navy flex-shrink-0"
                >
                  <Pencil size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
