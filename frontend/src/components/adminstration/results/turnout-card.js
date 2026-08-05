"use client";

import { Info, Snowflake, Users } from "lucide-react";

/**
 * Participation: how many eligible students voted.
 *
 * THE DENOMINATOR IS FROZEN, and this card says so out loud because the thesis
 * distinguishes the two and a reader must not have to guess which one produced
 * the percentage.
 *
 * `eligible` is `Election.eligibleCount`, captured ONCE by POST /elections/:id/open
 * (backend/src/controllers/election-controllers.js counts the electorate inside
 * the same serializable transaction that flips the status) and never recomputed.
 * Students added, deactivated or moved between faculties mid-election therefore
 * cannot move a turnout percentage that has already been reported. /reopen
 * explicitly leaves it alone.
 *
 * An election that has never been OPEN has `eligible: null` — there was no
 * moment at which to freeze an electorate — and the API returns an explanatory
 * `note` alongside it. The percentage is then genuinely undefined rather than
 * zero, and is shown as such: inventing a live denominator here would quietly
 * answer a different question than the one the rest of the system answers.
 *
 * This card reads VoteReceipt-derived aggregates ONLY: a count of participants.
 * It never sees, asks for, or could display who those participants are, or how
 * any of them voted — the two tables are queried independently and are not
 * joinable (Project-Context §8).
 */

export default function TurnoutCard({ voted = 0, eligible, turnoutPct, note, isLive = false }) {
  const hasDenominator = typeof eligible === "number" && eligible > 0;
  const pct = hasDenominator ? (turnoutPct ?? 0) : null;

  return (
    <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
          <Users size={18} aria-hidden="true" />
        </span>
        <h2 className="text-ink m-0 text-[15px] font-bold">Turnout</h2>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="font-display text-ink m-0 text-[34px] leading-none font-bold tracking-[-0.02em]">
            {hasDenominator ? `${pct}%` : "—"}
          </p>
          <p className="text-muted m-0 mt-1.5 text-xs">
            {hasDenominator ? "of the frozen electorate" : "turnout undefined"}
          </p>
        </div>

        <dl className="m-0 flex gap-6">
          <Stat label="Voted" value={voted.toLocaleString()} live={isLive} />
          <Stat
            label="Eligible"
            value={hasDenominator ? eligible.toLocaleString() : "—"}
          />
        </dl>
      </div>

      {hasDenominator && (
        <div className="mt-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${pct}% turnout: ${voted} of ${eligible} eligible students have voted`}
          >
            <div
              className="bg-primary-gradient h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>

          <p className="text-muted m-0 mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-[1.5]">
            <Snowflake size={13} className="mt-px shrink-0 text-indigo-500" aria-hidden="true" />
            Eligibility was frozen when this election opened. Students added or deactivated since
            then do not change this denominator.
          </p>
        </div>
      )}

      {note && (
        <p className="text-muted bg-warning-50 text-warning-700 m-0 mt-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-[1.5] font-medium">
          <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, live = false }) {
  return (
    <div>
      <dt className="mb-1 text-[11px] font-semibold tracking-[.04em] text-slate-400 uppercase">
        {label}
      </dt>
      <dd
        className="font-display text-ink m-0 text-[20px] font-bold"
        aria-live={live ? "polite" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
