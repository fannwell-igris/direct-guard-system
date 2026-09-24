import { useEffect, useState } from "react";
import api from "../../api/client";

interface Department {
  id: string;
  name: string;
}

interface GeneralExpense {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description: string | null;
  department?: { id: string; name: string } | null;
  paidBy: string | null;
  receiptReference: string | null;
  notes: string | null;
}

function formatCurrency(val: string | number | null | undefined): string {
  const n = Number(val);
  if (Number.isNaN(n)) return "—";
  return `ZMW ${n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

/**
 * Read-only view of General Expenses scoped to the Marketing department
 * (brief section 7: "Marketing Expenses (link to General Expenses)" —
 * reuse the existing Finance module rather than build a separate one).
 * Marketers can see what's been logged against their department; actually
 * recording an expense still goes through Admin/Finance on the main
 * Expenses page, per the "Only Admin and Finance can edit Finance"
 * instruction (see permissions.ts).
 */
export default function MarketingExpensesPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<string>("");
  const [expenses, setExpenses] = useState<GeneralExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/departments").then((res) => {
      const depts: Department[] = res.data.data;
      setDepartments(depts);
      // Default to a department literally named "Marketing" if one exists,
      // so this page is useful the moment that department is created —
      // falls back to "all departments" if not, rather than showing empty.
      const marketing = depts.find((d) => d.name.toLowerCase() === "marketing");
      if (marketing) setDepartmentId(marketing.id);
    }).catch(() => {});
  }, []);

  async function loadExpenses() {
    setIsLoading(true); setError(null);
    try {
      const params: Record<string, string> = { pageSize: "200" };
      if (departmentId) params.departmentId = departmentId;
      const res = await api.get("/general-expenses", { params });
      setExpenses(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load expenses.");
    } finally { setIsLoading(false); }
  }

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Marketing Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {expenses.length} expense{expenses.length !== 1 ? "s" : ""} — total {formatCurrency(total)}
          </p>
        </div>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-400">
        Read-only — recording or editing an expense is done by Admin/Finance on the main Expenses page.
      </p>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-400">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">No expenses logged for this department yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(e.expenseDate)}</td>
                  <td className="px-4 py-3 text-gray-700">{e.category}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.description ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
