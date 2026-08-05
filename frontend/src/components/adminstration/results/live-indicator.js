"use client";

import { LoaderCircle, Radio, TriangleAlert, WifiOff } from "lucide-react";

import { CONNECTION } from "@/hooks/use-election-socket";

/**
 * Whether the numbers on screen are live.
 *
 * This is not decoration. A dashboard projected during an election is read as
 * current by everyone looking at it, so a dropped socket has to be visible —
 * otherwise a tally frozen ten minutes ago looks exactly like a tally that is
 * up to date. "Reconnecting" says the numbers may be behind; the page re-seeds
 * from REST the moment the socket returns.
 */

const STATE = {
  [CONNECTION.LIVE]: {
    icon: Radio,
    label: "Live",
    className: "bg-success-50 text-success-700",
    pulse: true,
  },
  [CONNECTION.CONNECTING]: {
    icon: LoaderCircle,
    label: "Connecting…",
    className: "bg-indigo-50 text-indigo-700",
    spin: true,
  },
  [CONNECTION.RECONNECTING]: {
    icon: WifiOff,
    label: "Reconnecting…",
    className: "bg-warning-50 text-warning-700",
  },
  [CONNECTION.REFUSED]: {
    icon: TriangleAlert,
    label: "Live updates unavailable",
    className: "bg-error-50 text-error-700",
  },
  [CONNECTION.IDLE]: {
    icon: WifiOff,
    label: "Not live",
    className: "bg-slate-100 text-slate-600",
  },
};

export default function LiveIndicator({ connection, refusal }) {
  const state = STATE[connection] ?? STATE[CONNECTION.IDLE];
  const Icon = state.icon;

  return (
    <span
      title={refusal || undefined}
      role="status"
      aria-live="polite"
      className={`rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap ${state.className}`}
    >
      {state.pulse ? (
        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse-dot" aria-hidden="true" />
      ) : (
        <Icon size={12} className={state.spin ? "animate-spin" : ""} aria-hidden="true" />
      )}
      {state.label}
    </span>
  );
}
