import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { CheckCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type DialogVariant = "positive" | "error" | "action";

export interface DialogOptions {
  variant: DialogVariant;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmDialogCtx {
  confirm: (options: DialogOptions) => Promise<boolean>;
}

// ── Context ────────────────────────────────────────────────────────────────

const ConfirmDialogContext = createContext<ConfirmDialogCtx | null>(null);

export function useConfirmDialog(): ConfirmDialogCtx {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx)
    throw new Error("useConfirmDialog must be used inside <ConfirmDialogProvider>");
  return ctx;
}

// ── Visual config per variant ──────────────────────────────────────────────

const CONFIG: Record<
  DialogVariant,
  {
    icon: React.ElementType;
    headerBg: string;
    headerText: string;
    iconBg: string;
    confirmBg: string;
    confirmHover: string;
  }
> = {
  positive: {
    icon: CheckCircle,
    headerBg: "bg-emerald-600",
    headerText: "text-white",
    iconBg: "bg-emerald-500",
    confirmBg: "bg-emerald-600",
    confirmHover: "hover:bg-emerald-700",
  },
  error: {
    icon: AlertTriangle,
    headerBg: "bg-red-600",
    headerText: "text-white",
    iconBg: "bg-red-500",
    confirmBg: "bg-red-600",
    confirmHover: "hover:bg-red-700",
  },
  action: {
    icon: Info,
    headerBg: "bg-blue-600",
    headerText: "text-white",
    iconBg: "bg-blue-500",
    confirmBg: "bg-blue-600",
    confirmHover: "hover:bg-blue-700",
  },
};

// ── Internal dialog state ──────────────────────────────────────────────────

interface DialogState extends DialogOptions {
  resolve: (value: boolean) => void;
}

// ── Dialog UI ─────────────────────────────────────────────────────────────

function Dialog({
  state,
  onResolve,
}: {
  state: DialogState;
  onResolve: (value: boolean) => void;
}) {
  const cfg = CONFIG[state.variant];
  const Icon = cfg.icon;
  const confirmLabel = state.confirmLabel ?? "Confirm";
  const cancelLabel = state.cancelLabel ?? "Cancel";

  return (
    /* Backdrop */
    <div
      className="modal-overlay"
      onClick={() => onResolve(false)}
    >
      {/* Card — stop propagation so clicks inside don't close */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored header */}
        <div className={`${cfg.headerBg} ${cfg.headerText} px-5 py-4 flex items-center gap-3`}>
          <div className={`${cfg.iconBg} rounded-full p-1.5 flex-shrink-0`}>
            <Icon size={18} className="text-white" />
          </div>
          <h2 className="font-semibold text-base leading-tight flex-1">{state.title}</h2>
          <button
            onClick={() => onResolve(false)}
            className="text-white/70 hover:text-white flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="bg-white px-5 py-5">
          <p className="text-sm text-gray-600 leading-relaxed">{state.message}</p>

          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => onResolve(false)}
              className="text-sm font-medium border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 text-gray-700"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => onResolve(true)}
              className={`text-sm font-medium text-white rounded-lg px-4 py-2 ${cfg.confirmBg} ${cfg.confirmHover}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Keep a stable ref to the current resolve fn so we can call it safely
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: DialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ ...options, resolve });
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
    setDialog(null);
  }, []);

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {dialog && <Dialog state={dialog} onResolve={handleResolve} />}
    </ConfirmDialogContext.Provider>
  );
}
