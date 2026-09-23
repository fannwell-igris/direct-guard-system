import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { UserCog, Plus } from "lucide-react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  departmentId: string | null;
  department?: { id: string; name: string };
}

interface Department {
  id: string;
  name: string;
}

interface FormState {
  email: string;
  fullName: string;
  password: string;
  role: string;
  departmentId: string;
}

const EMPTY_FORM: FormState = { email: "", fullName: "", password: "", role: "STAFF", departmentId: "" };

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "HR", "PAYROLL", "OPERATIONS", "MARKETING", "STAFF"];

const ROLE_BADGE: Record<string, string> = {
  ADMIN:      "bg-red-100 text-red-700",
  MANAGER:    "bg-purple-100 text-purple-700",
  HR:         "bg-pink-100 text-pink-700",
  PAYROLL:    "bg-amber-100 text-amber-700",
  OPERATIONS: "bg-blue-100 text-blue-700",
  MARKETING:  "bg-teal-100 text-teal-700",
  STAFF:      "bg-gray-100 text-gray-600",
};

export default function UsersPage() {
  const [users, setUsers]           = useState<User[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [departments, setDepts]     = useState<Department[]>([]);

  const [editingId, setEditingId]   = useState<string | "new" | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]   = useState<string | null>(null);
  const [isSaving, setIsSaving]     = useState(false);

  const [resetUserId, setResetUserId]   = useState<string | null>(null);
  const [newPassword, setNewPassword]   = useState("");
  const [resetError, setResetError]     = useState<string | null>(null);
  const [isResetting, setIsResetting]   = useState(false);

  async function loadDepts() {
    try {
      const res = await api.get("/departments");
      setDepts(res.data.data);
    } catch { /* non-fatal */ }
  }

  async function loadUsers() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get("/users");
      setUsers(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDepts();
    loadUsers();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM); setFormError(null); setEditingId("new");
  }
  function openEdit(u: User) {
    setForm({ email: u.email, fullName: u.fullName, password: "", role: u.role, departmentId: u.departmentId ?? "" });
    setFormError(null); setEditingId(u.id);
  }
  function closeForm() { setEditingId(null); setFormError(null); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null); setIsSaving(true);
    try {
      if (editingId === "new") {
        await api.post("/users", {
          email: form.email.trim(), fullName: form.fullName.trim(),
          password: form.password, role: form.role,
          departmentId: form.departmentId || null,
        });
      } else {
        await api.put(`/users/${editingId}`, {
          fullName: form.fullName.trim(), role: form.role,
          departmentId: form.departmentId || null,
        });
      }
      closeForm(); await loadUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? "Failed to save.");
    } finally { setIsSaving(false); }
  }

  async function toggleActive(u: User) {
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to update.");
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setResetError(null); setIsResetting(true);
    try {
      await api.patch(`/users/${resetUserId}/password`, { newPassword });
      setResetUserId(null); setNewPassword("");
    } catch (err: any) {
      setResetError(err.response?.data?.message ?? "Failed to reset password.");
    } finally { setIsResetting(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <UserCog size={22} className="text-magen-green" />
            Users &amp; Roles
          </h1>
          <p className="page-subtitle">{users.length} user{users.length !== 1 ? "s" : ""} in the system</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={15} /> Add User
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Create / Edit form */}
      {editingId && (
        <Modal
          title={editingId === "new" ? "New User" : "Edit User"}
          onClose={closeForm}
          widthClass="max-w-lg"
        >
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" placeholder="John Banda" />
            </div>
            {editingId === "new" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="john@magensecurity.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder="Minimum 8 characters" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="select">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="select">
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset password form */}
      {resetUserId && (
        <Modal
          title="Reset Password"
          onClose={() => { setResetUserId(null); setNewPassword(""); setResetError(null); }}
          widthClass="max-w-sm"
        >
          {resetError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{resetError}</div>
          )}
          <form onSubmit={handleResetPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Password *</label>
              <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Minimum 8 characters" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isResetting} className="btn-primary">
                {isResetting ? "Saving…" : "Set Password"}
              </button>
              <button type="button" onClick={() => { setResetUserId(null); setNewPassword(""); setResetError(null); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Users table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No users found.{" "}
            <button className="text-magen-green hover:underline" onClick={openCreate}>Add one</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEdit(u)} className="text-xs text-magen-green hover:underline font-medium">
                        Edit
                      </button>
                      <button
                        onClick={() => { setResetUserId(u.id); setNewPassword(""); setResetError(null); }}
                        className="text-xs text-amber-600 hover:underline font-medium"
                      >
                        Reset Password
                      </button>
                      <button onClick={() => toggleActive(u)} className="text-xs text-gray-500 hover:underline">
                        {u.isActive ? "Deactivate" : "Activate"}
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
