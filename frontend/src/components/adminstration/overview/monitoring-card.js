"use client";

import { ChartColumn } from "lucide-react";
import Link from "next/link";

/**
 * The way through to the live results dashboard (F7).
 *
 * This panel is a DOOR, not a window: it carries no tally, no standing and no
 * turnout figure of its own. Every view of an actual result writes a
 * RESULTS_VIEWED audit row naming the admin who looked, and that record only
 * means something if looking is a deliberate act — so the numbers stay one
 * click away, behind a link, rather than being spread across a landing page
 * that opens itself every time anyone signs in.
 *
 * The "LIVE" wording is honest about what it describes: the results screen
 * really is socket-driven and really does tick in real time. This card does not
 * claim that anything on the overview around it is live.
 */

export default function MonitoringCard({ hasOpenElections }) {
  return (
    <section className="relative overflow-hidden rounded-lg bg-indigo-950 p-5 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(220px 160px at 90% 0, rgba(139,92,246,.5), transparent)",
        }}
        aria-hidden="true"
      />

      <h2 className="font-body relative m-0 flex items-center gap-2 text-xs font-bold text-error-500">
        <span
          className={`size-[7px] rounded-full bg-current ${
            hasOpenElections ? "motion-safe:animate-pulse-dot" : "opacity-40"
          }`}
          aria-hidden="true"
        />
        LIVE MONITORING
      </h2>

      <p className="relative m-0 mt-2.5 mb-4 text-[13px] leading-[1.5] text-indigo-200">
        {/* null while the count is still loading — the door is worth opening
            either way, so the neutral wording claims nothing about the day. */}
        {hasOpenElections === null
          ? "Aggregate tallies, turnout and ballot integrity, per election. Admin-only, and never shown to students."
          : hasOpenElections
            ? "Watch ballots arrive in real time across the open elections. Aggregate counts only — admin-only, and never shown to students."
            : "Nothing is open right now. Closed and final elections keep their aggregate results here."}
      </p>

      <Link
        href="/adminstration/results"
        className="relative flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/20 bg-white/12 px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-white/20 hover:text-white"
      >
        <ChartColumn size={17} aria-hidden="true" />
        Open live results
      </Link>
    </section>
  );
}
