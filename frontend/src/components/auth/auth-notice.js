import { CircleAlert, Clock, Info } from "lucide-react";

/**
 * The inline status banner from the prototype's auth screen.
 *
 * Three tones, each with its own next action baked into the wording:
 *   error   — the code was wrong; stay put and retry.
 *   warning — the code is gone (expired or burned); request a new one.
 *   info    — throttling; wait.
 */

const TONES = {
  error: {
    icon: CircleAlert,
    className: "bg-error-50 text-error-700",
  },
  warning: {
    icon: Clock,
    className: "bg-warning-50 text-warning-700",
  },
  info: {
    icon: Info,
    className: "bg-indigo-50 text-indigo-700",
  },
};

export default function AuthNotice({ tone = "error", children }) {
  const { icon: Icon, className } = TONES[tone] ?? TONES.error;

  return (
    <div
      // Announced to screen readers the moment it appears: on a phone the
      // banner can render below the fold.
      role="status"
      aria-live="polite"
      className={`animate-fade-up mb-3.5 flex items-start gap-2 rounded-sm px-3 py-2.5 text-[13px] font-medium ${className}`}
    >
      <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
