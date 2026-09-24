import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, Plus } from "lucide-react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface Department {
  id: string;
  name: string;
  description: string | null;
  headOfDepartment: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  _count?: { employees: number; tasks: number; departmentRequests: number };
}

interface FormState {
  name: string;
  description: string;
  headOfDepartment: string;
}

const EMPTY_FORM: FormState = { name: "", description: "", headOfDepartment: "" };

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-600",
  ARCHIVED: "bg-red-100 text-red-700",
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadDepartments() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get("/departments", { params: { pageSize: 100 } });
      setDepartments(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load departments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }
  function openEdit(d: Department) {
    setForm({
      name: d.name,
      description: d.description ?? "",
      headOfDepartment: d.headOfDepartment ?? "",
    });
    setFormError(null);
    setEditingId(d.id);
  }
  function closeForm() {
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        headOfDepartment: form.headOfDepartment.trim() || null,
      };
      if (editingId === "new") {
        await api.post("/departments", payload);
      } else {
        await api.put(`/departments/${editingId}`, payload);
      }
      closeForm();
      await loadDepartments();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save department.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleArchive(d: Department) {
    try {
      await api.put(`/departments/${d.id}`, {
        status: d.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED",
      });
      await loadDepartments();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update department.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 size={22} className="text-magen-green" />
            Departments
          </h1>
          <p className="page-subtitle">
            {departments.length} department{departments.length !== 1 ? "s" : ""} — used for user
            accounts, tasks, and department requests
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={15} /> Add Department
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {editingId && (
        <Modal
          title={editingId === "new" ? "New Department" : "Edit Department"}
          onClose={closeForm}
          widthClass="max-w-md"
        >
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="e.g. Finance"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Head of Department</label>
              <input
                value={form.headOfDepartment}
                onChange={(e) => setForm({ ...form, headOfDepartment: e.target.value })}
                className="input"
                placeholder="Optional"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={closeForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : departments.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No departments yet.{" "}
            <button className="text-magen-green hover:underline" onClick={openCreate}>Add one</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Head</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employees</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-3 text-gray-500">{d.headOfDepartment ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{d._count?.employees ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[d.status]}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(d)} className="text-xs text-magen-green hover:underline font-medium">
                          Edit
                        </button>
                        <button onClick={() => toggleArchive(d)} className="text-xs text-gray-500 hover:underline">
                          {d.status === "ARCHIVED" ? "Restore" : "Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
