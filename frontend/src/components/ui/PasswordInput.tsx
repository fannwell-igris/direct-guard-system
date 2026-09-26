import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * A password field with a reveal ("peek") toggle. Behaves exactly like a
 * normal <input> — pass the same props you would to one — except `type`,
 * which this component owns as it flips between "password" and "text".
 *
 * Every password box in the app should use this instead of a raw
 * <input type="password" /> so the toggle looks and behaves the same
 * everywhere. `pr-10` is appended to whatever className is given so the
 * text never runs underneath the eye button, whatever styling the caller
 * uses.
 *
 * The revealed state deliberately lives here and is never lifted or
 * persisted: a field inside a modal is re-created each time the modal
 * opens, so a password is never left showing from a previous use.
 */
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className = "input", ...rest }, ref) {
    const [revealed, setRevealed] = useState(false);
    const label = revealed ? "Hide password" : "Show password";

    return (
      <div className="relative">
        <input
          {...rest}
          ref={ref}
          type={revealed ? "text" : "password"}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={label}
          aria-pressed={revealed}
          title={label}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400
                     hover:text-gray-600 focus:outline-none focus-visible:text-gray-700"
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  }
);

export default PasswordInput;
