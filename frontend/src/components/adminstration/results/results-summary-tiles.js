"use client";

import { Snowflake } from "lucide-react";

/**
 * The four headline aggregates for the selected election, as the mockup lays
 * them out: total ballots, turnout, eligible voters, candidates.
 *
 * EVERY FIGURE IS LIVE. The prototype's 353 / 420 / 84% are placeholders and
 * none of them appears here; each value below arrives from GET /results,
 * GET /turnout or the socket tick built from the same functions.
 *
 * THE DENOMINATOR IS FROZEN, and both tiles that depend on it say so. `eligible`
 * is Election.eligibleCount, captured once by POST /elections/:id/open inside
 * the transaction that flips the status, and never recomputed — students added,
 * deactivated or moved between faculties mid-election cannot move a percentage
 * that has already been reported. An election that has never opened has no
 * frozen electorate at all, so its turnout is undefined rather than 0%, and is
 * shown as a dash.
 *
 * All four are counts. None of them says anything about WHO voted or how — that
 * is a property of the two unlinked tables these numbers come from, not a
 * convention this file follows (Project-Context §8).
 */

export default function ResultsSummaryTiles({ totalVotes, turnout, candidateCount }) {
  const { eligible, turnoutPct } = turnout;
  const hasDenominator = typeof eligible === "number" && eligible > 0;
  const percentage = hasDenominator ? (turnoutPct ?? 0) : null;

  return (
    <div className="grid gap-3.5 min-[560px]:grid-cols-2 min-[1180px]:grid-cols-4">
      <section className="bg-brand-gradient rounded-lg p-[18px] text-white shadow-md">
        <h3 className="font-body m-0 text-xs font-semibold text-white/90">Total ballots</h3>
        <p className="font-display m-0 mt-1.5 text-[32px] leading-tight font-bold tracking-[-0.02em]">
          {totalVotes.toLocaleString()}
        </p>
        <p className="m-0 mt-1 text-[11.5px] text-white/75">
          Cast in this election so far
        </p>
      </section>

      <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
        <h3 className="text-muted font-body m-0 text-xs font-semibold">Turnout</h3>

        <p
          className={`font-display m-0 mt-1.5 text-[32px] leading-tight font-bold tracking-[-0.02em] ${
            hasDenominator ? "text-success-600" : "text-slate-400"
          }`}
        >
          {hasDenominator ? `${percentage}%` : "—"}
        </p>

        {hasDenominator ? (
          <>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`Turnout ${percentage}% — ${turnout.voted} of ${eligible} eligible students have voted`}
            >
              <div
                className="bg-success-gradient h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>

            <p className="text-muted m-0 mt-1.5 flex items-center gap-1 text-[11.5px]">
              <Snowflake size={12} className="flex-none text-indigo-500" aria-hidden="true" />
              {turnout.voted.toLocaleString()} of {eligible.toLocaleString()} · frozen electorate
            </p>
          </>
        ) : (
          <p className="text-muted m-0 mt-1 text-[11.5px]">
            Undefined — this election has never been opened
          </p>
        )}
      </section>

      <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
        <h3 className="text-muted font-body m-0 text-xs font-semibold">Eligible voters</h3>
        <p className="font-display text-ink m-0 mt-1.5 text-[32px] leading-tight font-bold tracking-[-0.02em]">
          {hasDenominator ? eligible.toLocaleString() : "—"}
        </p>
        <p className="text-muted m-0 mt-1 flex items-center gap-1 text-[11.5px]">
          <Snowflake size={12} className="flex-none text-indigo-500" aria-hidden="true" />
          {hasDenominator ? "Frozen when voting opened" : "Not yet frozen"}
        </p>
      </section>

      <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
        <h3 className="text-muted font-body m-0 text-xs font-semibold">Candidates</h3>
        <p className="font-display text-ink m-0 mt-1.5 text-[32px] leading-tight font-bold tracking-[-0.02em]">
          {candidateCount.toLocaleString()}
        </p>
        <p className="text-muted m-0 mt-1 text-[11.5px]">
          {candidateCount === 0 ? "None registered yet" : "On this ballot"}
        </p>
      </section>
    </div>
  );
}
