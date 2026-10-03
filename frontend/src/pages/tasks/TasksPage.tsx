import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../contexts/AuthContext";

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
  createdAt: string | null;
  priority: "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  completedBy: string | null;   // name of the person who last changed the status
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

// Roles that can create and fully edit tasks.
const CAN_MANAGE_ROLES = new Set(["ADMIN", "MANAGER", "FINANCE"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityBadge(p: Task["priority"]) {
  switch (p) {
    case "CRITICAL": return "bg-red-100 text-red-700";
    case "URGENT":   return "bg-orange-100 text-orange-700";
    case "HIGH":     return "bg-amber-100 text-amber-700";
    default:         return "bg-gray-100 text-gray-600";
  }
}

function statusBadge(s: Task["status"]) {
  switch (s) {
    case "COMPLETED":  return "bg-green-100 text-green-700";
    case "IN_PROGRESS": return "bg-blue-100 text-blue-700";
    case "ON_HOLD":    return "bg-amber-100 text-amber-700";
    case "CANCELLED":  return "bg-gray-100 text-gray-500";
    default:           return "bg-slate-100 text-slate-600"; // OPEN
  }
}

function statusLabel(s: Task["status"]) {
  switch (s) {
    case "IN_PROGRESS": return "In Progress";
    case "ON_HOLD":     return "On Hold";
    default:            return s.charAt(0) + s.slice(1).toLowerCase();
  }
}

/** Returns a human-readable countdown / overdue label for a due date. */
function dueDateLabel(dueDateStr: string | null): { text: string; cls: string } | null {
  if (!dueDateStr) return null;
  const now = new Date();
  const due = new Date(dueDateStr);
  // Normalise both to midnight local time for day-level comparison
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dueDay.getTime() - nowDay.getTime()) / 86_400_000);

  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, cls: "text-red-500" };
  if (diff === 0) return { text: "Due today", cls: "text-orange-500 font-semibold" };
  if (diff === 1) return { text: "Due tomorrow", cls: "text-amber-600" };
  if (diff <= 7)  return { text: `${diff}d left`, cls: "text-amber-500" };
  return {
    text: due.toLocaleDateString("en-ZM", { day: "numeric", month: "short", year: "numeric" }),
    cls: "text-gray-400",
  };
}

function fmtDateTime(str: string | null) {
  if (!str) return null;
  return new Date(str).toLocaleString("en-ZM", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Password prompt (inline modal) ────────────────────────────────────────────

function PasswordPrompt({ onConfirm, onCancel }: { onConfirm: (pw: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState("");
  return (
    <Modal title="Confirm password to undo" onClose={onCancel} widthClass="max-w-sm">
      <p className="text-sm text-gray-600 mb-3">
        Enter your password to revert this completed task back to open.
      </p>
      <input
        type="password"
        autoFocus
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
        placeholder="Your password…"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (pw) onConfirm(pw); } }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!pw}
          onClick={() => onConfirm(pw)}
          className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-50 flex-1"
        >
          Confirm
        </button>
        <button type="button" onClick={onCancel} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user } = useAuth();
  const canManage = !!user && CAN_MANAGE_ROLES.has(user.role);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [employees, setEmployees] = useState<Lookup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Password-gate for undoing a COMPLETED task
  const [pendingUndo, setPendingUndo] = useState<{ task: Task; status: Task["status"] } | null>(null);

  async function loadLookups() {
    try {
      const [depRes, empRes] = await Promise.all([
        api.get("/departments"),
        api.get("/employees", { params: { pageSize: 100 } }),
      ]);
      setDepartments(depRes.data.data);
      setEmployees(empRes.data.data);
    } catch {
      // Non-fatal — dropdowns just show no options if this fails.
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

  // Status change — if reverting a COMPLETED task, require password first.
  async function handleStatusChange(task: Task, newStatus: Task["status"]) {
    if (task.status === "COMPLETED" && newStatus !== "COMPLETED") {
      // Gate behind password prompt
      setPendingUndo({ task, status: newStatus });
      return;
    }
    await commitStatusChange(task, newStatus);
  }

  async function commitStatusChange(task: Task, newStatus: Task["status"], password?: string) {
    try {
      const headers: Record<string, string> = {};
      if (password) headers["x-confirm-password"] = password;
      await api.put(`/tasks/${task.id}`, { status: newStatus }, { headers });
      await loadTasks();
    } catch (err: any) {
      if (err.response?.data?.code === "PASSWORD_CONFIRMATION_INVALID") {
        setError("Incorrect password — status not changed.");
      } else {
        setError(err.response?.data?.message ?? "Failed to update status.");
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">{tasks.length} total</p>
        </div>
        {canManage && (
          <button
            onClick={openCreateForm}
            className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700"
          >
            + Add Task
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Password gate for undoing COMPLETED tasks */}
      {pendingUndo && (
        <PasswordPrompt
          onConfirm={async (pw) => {
            const { task, status } = pendingUndo;
            setPendingUndo(null);
            await commitStatusChange(task, status, pw);
          }}
          onCancel={() => setPendingUndo(null)}
        />
      )}

      {/* Edit / create modal — only reachable by canManage roles */}
      {canManage && editingId && (
        <Modal
          title={editingId === "new" ? "New Task" : "Edit Task"}
          onClose={closeForm}
          widthClass="max-w-lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="text-sm font-medium text-gray-700">Assigned By</label>
                <input
                  value={form.assignedBy}
                  onChange={(e) => setForm({ ...form, assignedBy: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="Name of assigner"
                />
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

              <div className="space-y-1 col-span-2">
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
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
                <th className="text-left px-4 py-3">Due / Given</th>
                <th className="text-left px-4 py-3">Status</th>
                {canManage && <th className="text-right px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => {
                const due = dueDateLabel(task.dueDate);
                const isCompleted = task.status === "COMPLETED";
                const isCancelled = task.status === "CANCELLED";
                return (
                  <tr key={task.id} className={isCompleted ? "bg-green-50/40" : isCancelled ? "bg-gray-50/60 opacity-70" : ""}>
                    {/* Title + description + assignedBy */}
                    <td className="px-4 py-3 max-w-xs">
                      <p className={`font-medium text-gray-900 ${isCompleted ? "line-through text-gray-500" : ""}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{task.description}</p>
                      )}
                      {task.assignedBy && (
                        <p className="text-xs text-gray-400 mt-0.5">by {task.assignedBy}</p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {task.department?.name ?? "—"}
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {task.assignedToEmployee?.fullName ?? "—"}
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                    </td>

                    {/* Due date + given date */}
                    <td className="px-4 py-3 min-w-[130px]">
                      {task.dueDate && (
                        <div>
                          <p className={`text-xs font-medium ${due?.cls ?? "text-gray-400"}`}>
                            {due?.text ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            Due {new Date(task.dueDate).toLocaleDateString("en-ZM", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      )}
                      {task.createdAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Given {new Date(task.createdAt).toLocaleDateString("en-ZM", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                      {!task.dueDate && !task.createdAt && <span className="text-gray-400">—</span>}
                    </td>

                    {/* Status — inline select + completion info */}
                    <td className="px-4 py-3 min-w-[160px]">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value as Task["status"])}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusBadge(task.status)}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                      {/* Who toggled + when */}
                      {isCompleted && task.completedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          ✓ {fmtDateTime(task.completedAt)}
                          {task.completedBy ? ` · ${task.completedBy}` : ""}
                        </p>
                      )}
                      {task.status === "COMPLETED" && (
                        <p className="text-xs text-amber-600 mt-0.5">🔒 Password needed to undo</p>
                      )}
                    </td>

                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditForm(task)}
                          className="text-green-600 hover:underline text-xs"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
