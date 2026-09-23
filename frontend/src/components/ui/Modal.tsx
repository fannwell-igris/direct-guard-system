import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Max width class for the modal card. Defaults to a comfortable form width. */
  widthClass?: string;
}

/**
 * Shared pop-up panel for add/edit forms across the app.
 * Renders as a centered overlay using the .modal-overlay / .modal-card
 * classes defined in index.css. Closes on backdrop click, the X button,
 * or the Escape key.
 */
export default function Modal({ title, onClose, children, widthClass = "max-w-md" }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-card w-full ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-magen-navy">{title}</h2>
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
