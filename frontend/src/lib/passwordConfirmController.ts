// Tiny pub-sub so the axios interceptor (outside React) can pop up the
// password-confirmation modal (inside React) and await the result.
// See PasswordConfirmModal.tsx (mounted once in App.tsx) and
// api/client.ts (the interceptor that actually uses this).

type Resolver = (password: string | null) => void;

let pendingResolve: Resolver | null = null;
let showListener: (() => void) | null = null;

export function requestPasswordConfirmation(): Promise<string | null> {
  return new Promise((resolve) => {
    // Only one confirmation prompt at a time — if something else is
    // already pending, cancel it rather than leaving it dangling forever.
    if (pendingResolve) pendingResolve(null);
    pendingResolve = resolve;
    showListener?.();
  });
}

export function _registerShowListener(fn: () => void) {
  showListener = fn;
}

export function _resolvePendingPassword(password: string | null) {
  pendingResolve?.(password);
  pendingResolve = null;
}
