import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface Lookup {
  id: string;
  name?: string;
  fullName?: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  departmentId: string | null;
  assignedToEmployeeId: string | null;
  assignedBy: string | null;
  dueDate: string | null;
  priority: "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  notes: string | null;
  department?: { id: string; name: string };
  assignedToEmployee?: { id: string; fullName: string };
}

interface FormState {
  title: string;
  description: string;
  departmentId: string;
  assignedToEmployeeId: string;
  assignedBy: string;
  dueDate: string;
  priority: Task["priority"];
  notes: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  departmentId: "",
  assignedToEmployeeId: "",
  assignedBy: "",
  dueDate: "",
  priority: "NORMAL",
  notes: "",
};

const PRIORITY_OPTIONS: Task["priority"][] = ["NORMAL", "HIGH", "URGENT", "CRITICAL"];
const STATUS_OPTIONS: Task["status"][] = ["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [employees, setEmployees] = useState<Lookup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadLookups() {
    try {
      const [depRes, empRes] = await Promise.all([
        api.get("/departments"),
        api.get("/employees", { params: { pageSize: 100 } }),
      ]);
      setDepartments(depRes.data.data);
      setEmployees(empRes.data.data);
    } catch {
      // Non-fatal -- dropdowns just show no options if this fails.
    }
  }

  async function loadTasks() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get("/tasks");
      setTasks(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load tasks.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLookups();
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEditForm(task: Task) {
    setForm({
      title: task.title,
      description: task.description ?? "",
      departmentId: task.departmentId ?? "",
      assignedToEmployeeId: task.assignedToEmployeeId ?? "",
      assignedBy: task.assignedBy ?? "",
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      priority: task.priority,
      notes: task.notes ?? "",
    });
    setFormError(null);
    setEditingId(task.id);
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
      title: form.title.trim(),
      description: form.description.trim() || null,
      departmentId: form.departmentId || null,
      assignedToEmployeeId: form.assignedToEmployeeId || null,
      assignedBy: form.assignedBy.trim() || null,
      dueDate: form.dueDate || null,
      priority: form.priority,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId === "new") {
        await api.post("/tasks", payload);
      } else if (editingId) {
        await api.put(`/tasks/${editingId}`, payload);
      }
      closeForm();
      await loadTasks();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save task.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(task: Task, status: Task["status"]) {
    try {
      await api.put(`/tasks/${task.id}`, { status });
      await loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update status.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">{tasks.length} total</p>
        </div>
        <button
          onClick={openCreateForm}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700"
        >
          + Add Task
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {editingId && (
        <Modal
          title={editingId === "new" ? "New Task" : "Edit Task"}
          onClose={closeForm}
          widthClass="max-w-lg"
        >
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Department</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Assigned To</label>
              <select
                value={form.assignedToEmployeeId}
                onChange={(e) => setForm({ ...form, assignedToEmployeeId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Task["priority"] })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
        </Modal>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No tasks found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Assigned To</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                  <td className="px-4 py-3 text-gray-600">{task.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{task.assignedToEmployee?.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{task.priority}</td>
                  <td className="px-4 py-3">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task, e.target.value as Task["status"])}
                      className={
                        "text-xs font-medium px-2 py-1 rounded-full border-0 " +
                        (task.status === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : task.status === "CANCELLED"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-green-100 text-green-700")
                      }
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEditForm(task)} className="text-green-600 hover:underline">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

