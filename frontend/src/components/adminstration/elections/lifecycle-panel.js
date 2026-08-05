"use client";

import {
  CalendarClock,
  CircleAlert,
  Info,
  LoaderCircle,
  Lock,
  Play,
  RotateCcw,
  Trophy,
  Undo2,
} from "lucide-react";

import { transitionsFrom } from "@/utils/election-transitions";

/**
 * The lifecycle controls — the prototype's indigo-950 panel.
 *
 * The buttons are NOT a hand-written list. They come from transitionsFrom(),
 * which walks the mirrored copy of the server's ALLOWED_TRANSITIONS map, so
 * this panel can only ever offer edges the backend would accept from the
 * election's CURRENT status. A PUBLISHED election yields an empty list and says
 * so, because PUBLISHED is terminal in that map.
 *
 * The runtime guards the server applies on top of the map — at least 2
 * candidates to open, a window that has not ended, no other election open for
 * the same seat — are NOT used to hide buttons here. They are shown as warnings
 * inside the confirmation instead, so the server stays the single authority on
 * whether a transition is allowed and the admin is told why if it refuses.
 */

const ICONS = {
  calendar: CalendarClock,
  undo: Undo2,
  play: Play,
  lock: Lock,
  rotate: RotateCcw,
  trophy: Trophy,
};

const VARIANT = {
  success:
    "bg-success-gradient text-white shadow-[0_10px_28px_-10px_rgba(16,185,129,.6)] hover:brightness-110",
  danger: "bg-error-600/90 text-white hover:bg-error-600",
  warning: "bg-warning-500/90 text-white hover:bg-warning-500",
  neutral: "bg-white/12 text-white border border-white/20 hover:bg-white/20",
};

export default function LifecyclePanel({ election, onSelect, pendingKey = null, children }) {
  const actions = transitionsFrom(election.status);

  return (
    <div className="bg-indigo-950 rounded-lg p-5 text-white">
      <h3 className="m-0 mb-1 text-sm font-bold">Lifecycle controls</h3>
      <p className="m-0 mb-4 text-xs leading-[1.5] text-indigo-300/80">
        Status is owned by the server. Every action here is confirmed first, and the status shown
        is re-read afterwards.
      </p>

      {actions.length === 0 ? (
        <p className="m-0 flex items-start gap-2 text-[12.5px] leading-[1.5] text-indigo-300/80">
          <Info size={15} className="mt-px shrink-0" aria-hidden="true" />
          This election is final. There are no further lifecycle actions — a published election
          cannot be reopened or changed.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {actions.map((action) => {
            const Icon = ICONS[action.icon] ?? Play;
            const isPending = pendingKey === action.key;

            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onSelect(action)}
                disabled={Boolean(pendingKey)}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 py-3 text-[13.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  VARIANT[action.variant] ?? VARIANT.neutral
                }`}
              >
                {isPending ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Icon size={16} aria-hidden="true" />
                )}
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * A refusal the server just gave us, shown where the button that caused it is.
 * The server's own message comes first — it names the conflicting election or
 * the candidate count — with the "what to do about it" hint underneath.
 */
export function LifecycleError({ message, hint }) {
  return (
    <div
      role="alert"
      className="border-error-500/40 bg-error-500/15 mt-4 rounded-[10px] border p-3 text-[12.5px] leading-[1.5]"
    >
      <p className="m-0 flex items-start gap-2 font-semibold text-white">
        <CircleAlert size={15} className="mt-px shrink-0" aria-hidden="true" />
        {message}
      </p>

      {hint && <p className="m-0 mt-1.5 pl-[23px] text-indigo-200/90">{hint}</p>}
    </div>
  );
}
