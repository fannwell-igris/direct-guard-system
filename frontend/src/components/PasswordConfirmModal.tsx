import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Modal from "./ui/Modal";
import PasswordInput from "./ui/PasswordInput";
import { _registerShowListener, _resolvePendingPassword } from "../lib/passwordConfirmController";

/**
 * Mounted once, at the app root (see App.tsx). Whenever the backend
 * refuses a DELETE with PASSWORD_CONFIRMATION_REQUIRED (added 2026-09-25
 * — Admin must re-enter their password to permanently delete something),
 * the api client's interceptor calls requestPasswordConfirmation(), which
 * pops this modal up via the shared controller and awaits whatever the
 * person types (or null if they cancel).
 */
export default function PasswordConfirmModal() {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    _registerShowListener(() => {
      setPassword("");
      setVisible(true);
    });
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    setVisible(false);
    _resolvePendingPassword(password);
  }

  function cancel() {
    setVisible(false);
    _resolvePendingPassword(null);
  }

  if (!visible) return null;

  return (
    <Modal title="Confirm Delete" onClose={cancel} widthClass="max-w-sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          This permanently deletes data and can't be undone. Re-enter your
          password to confirm.
        </p>
        <PasswordInput
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button type="submit" className="bg-red-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-red-700">
            Confirm Delete
          </button>
          <button type="button" onClick={cancel} className="text-sm border border-gray-300 rounded px-4 py-2 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
