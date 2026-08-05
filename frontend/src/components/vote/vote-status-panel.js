import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The centred full-screen message used for every terminal ballot state:
 * already voted, voting not open, not eligible, election missing.
 *
 * Styled after the prototype's `ballotVoted` / `ballotNotOpen` panels.
 */

const TONES = {
  success: "bg-success-50 text-success-600 shadow-[inset_0_0_0_1px_var(--color-success-500)]",
  warning: "bg-warning-50 text-warning-700",
  error: "bg-error-50 text-error-600",
  neutral: "bg-slate-100 text-slate-500",
};

export default function VoteStatusPanel({
  icon: Icon,
  tone = "neutral",
  badge,
  title,
  children,
  detail,
  action,
}) {
  return (
    <div className="animate-fade-up py-6 text-center">
      <div
        className={`mx-auto mb-[18px] grid size-[76px] place-items-center rounded-[22px] ${TONES[tone] ?? TONES.neutral}`}
      >
        <Icon size={38} aria-hidden="true" />
      </div>

      {badge && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2.5 py-1 text-[11.5px] font-bold text-success-700">
          {badge}
        </div>
      )}

      <h1 className="font-display text-ink m-0 mb-1.5 text-[22px] font-bold tracking-[-0.02em]">
        {title}
      </h1>

      <p className="text-muted mx-auto mb-5 max-w-[320px] text-sm leading-[1.55]">{children}</p>

      {detail}

      {action ?? (
        <Link
          href="/vote"
          className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-[22px] py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to my elections
        </Link>
      )}
    </div>
  );
}
