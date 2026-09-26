import { useEffect, useState, useCallback } from "react";
import type { FormEvent } from "react";
import { UserCog, Plus } from "lucide-react";
import api from "../../api/client";
import Modal from "../../components/ui/Modal";
import PasswordInput from "../../components/ui/PasswordInput";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  departmentId: string | null;
  department?: { id: string; name: string };
  lastLoginAt: string | null;
  employeeId: string | null;
  employee?: { id: string; fullName: string; photoFilename: string | null } | null;
}

interface Department {
  id: string;
  name: string;
}

interface EmployeeLookup {
  id: string;
  fullName: string;
}

interface FormState {
  email: string;
  fullName: string;
  password: string;
  role: string;
  departmentId: string;
  employeeId: string;
}

const EMPTY_FORM: FormState = { email: "", fullName: "", password: "", role: "STAFF", departmentId: "", employeeId: "" };

/** "Never" for accounts that have never logged in; otherwise a short local date/time. */
function formatLastLogin(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Shows the linked Employee's photo for recognition (2026-09-24: added so
 * an admin scanning the Users list can tell people apart by face, not just
 * name). Read-only here — uploading/changing the photo is done from the
 * Employees page. Falls back to initials when there's no linked Employee,
 * or the Employee has no photo uploaded, or the photo fails to load.
 */
function UserAvatar({ user }: { user: User }) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const loadPhoto = useCallback(async () => {
    if (!user.employee?.photoFilename) {
      setPhotoSrc(null);
      return;
    }
    try {
      const res = await api.get(`/employees/${user.employee.id}/photo`, { responseType: "blob" });
      setPhotoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(res.data as Blob);
      });
      setImgError(false);
    } catch {
      setImgError(true);
    }
  }, [user.employee?.id, user.employee?.photoFilename]);

  useEffect(() => {
    loadPhoto();
    return () => {
      setPhotoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return prev;
      });
    };
  }, [loadPhoto]);

  const showPhoto = user.employee?.photoFilename && photoSrc && !imgError;

  return (
    <div className="w-9 h-9 rounded-full bg-magen-green-light text-magen-green-dark text-xs font-semibold flex items-center justify-center overflow-hidden flex-shrink-0">
      {showPhoto ? (
        <img
          src={photoSrc}
          alt={user.fullName}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials(user.fullName)
      )}
    </div>
  );
}

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "HR", "PAYROLL", "OPERATIONS", "MARKETING", "STAFF"];

// PAYROLL is this system's Finance role internally (see permissions.ts) —
// displayed as "Finance" everywhere in the UI since that's what the role
// actually covers (invoices, payments, expenses, payroll), but the stored
// value stays PAYROLL to avoid a disruptive rename across the database,
// permissions registry, and every existing user account.
const ROLE_LABELS: Record<string, string> = {
  PAYROLL: "Finance",
};

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
  const [employees, setEmployees]   = useState<EmployeeLookup[]>([]);

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

  async function loadEmployeeLookups() {
    try {
      // Only for the "Link to Employee" dropdown (recognition photo) — not
      // every account needs one, and this list intentionally isn't
      // filtered to Guards only, since office staff with logins are
      // Employees too.
      const res = await api.get("/employees", { params: { pageSize: 100, employmentStatus: "ACTIVE" } });
      setEmployees(res.data.data);
    } catch { /* non-fatal -- dropdown just shows no options */ }
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
    loadEmployeeLookups();
    loadUsers();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM); setFormError(null); setEditingId("new");
  }
  function openEdit(u: User) {
    setForm({
      email: u.email, fullName: u.fullName, password: "", role: u.role,
      departmentId: u.departmentId ?? "", employeeId: u.employeeId ?? "",
    });
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
          employeeId: form.employeeId || null,
        });
      } else {
        await api.put(`/users/${editingId}`, {
          fullName: form.fullName.trim(), role: form.role,
          departmentId: form.departmentId || null,
          employeeId: form.employeeId || null,
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
                  <PasswordInput required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder="Minimum 8 characters" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="select">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="select">
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Link to Employee</label>
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="select">
                <option value="">None</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Optional — shows the linked employee's photo here for recognition.</p>
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
              <PasswordInput required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Minimum 8 characters" />
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3"><UserAvatar user={u} /></td>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.department?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatLastLogin(u.lastLoginAt)}</td>
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
