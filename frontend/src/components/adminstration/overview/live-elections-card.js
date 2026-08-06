"use client";

import { Building2, CalendarClock, ChevronRight, GraduationCap } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/common/query-states";
import { useNow } from "@/hooks/use-now";
import { ELECTION_TYPE, electionScopeText } from "@/utils/election-labels";
import { formatRelativeTime } from "@/utils/format-date";

import ElectionStatusBadge from "../elections/election-status-badge";
import ElectionWindow from "../elections/election-window";
import OverviewShimmer from "./overview-shimmer";

/**
 * What is happening now and what is next: OPEN elections, then SCHEDULED ones.
 *
 * THE BAR IS TURNOUT. It is participation — `voted / eligible` against the
 * electorate frozen when the election opened (F7) — and it is labelled
 * "Turnout" in the markup and in its accessible name so it cannot be misread.
 * It is NOT vote share, NOT a per-candidate tally, and NOT a standings bar. A
 * live race's standings do not belong on a landing page that an admin may have
 * projected on a screen or open beside a student: results are admin-only, viewed
 * deliberately, and the university announces the official outcome
 * (Project-Context §9). Everything on this card would be equally true if every
 * candidate had the same number of votes.
 *
 * SCHEDULED ROWS GET NO BAR. Their electorate has never been frozen, so there is
 * no denominator and no votes to count. Drawing an empty 0% bar beside a live
 * one would say "nobody is voting in this election", which is a very different
 * claim from "this election has not started". They show the countdown instead.
 */

export default function LiveElectionsCard({
  openElections,
  scheduledElections,
  isPending,
  isError,
  error,
  onRetry,
  isRetrying,
}) {
  const now = useNow();
  const rows = [...openElections, ...scheduledElections];

  return (
    <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-ink m-0 text-[15px] font-bold">Live &amp; upcoming elections</h2>

        <Link
          href="/adminstration/elections"
          className="text-[12.5px] font-semibold text-indigo-600 transition hover:text-indigo-700"
        >
          View all →
        </Link>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3">
          <span className="sr-only">Loading elections</span>
          {[0, 1, 2].map((index) => (
            <OverviewShimmer key={index} className="h-[74px] w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={onRetry} isRetrying={isRetrying} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing is running or scheduled.">
          Create an election and schedule its window; it will appear here as soon as it is set to
          open.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((election) => (
            <li key={election.id}>
              <ElectionRow election={election} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ElectionRow({ election, now }) {
  const Icon = election.type === ELECTION_TYPE.UNIVERSITY ? GraduationCap : Building2;

  // Present on open rows only — the hook fetches turnout for OPEN elections and
  // nothing else, so a scheduled row simply has no read attached.
  const turnout = election.turnout;

  return (
    <Link
      href={`/adminstration/elections/${election.id}`}
      className="border-line flex items-center gap-3.5 rounded-md border p-3 transition hover:border-indigo-300 hover:bg-indigo-50/60"
    >
      <span className="grid size-10 flex-none place-items-center rounded-[11px] bg-indigo-50 text-indigo-600">
        <Icon size={20} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink truncate text-sm font-semibold">{election.title}</span>
          <ElectionStatusBadge status={election.status} />
        </div>

        <p className="text-muted m-0 mt-1 truncate text-[11.5px]">
          {electionScopeText(election)}
          <span className="px-1.5 text-slate-300" aria-hidden="true">
            ·
          </span>
          <ElectionWindow startAt={election.startAt} endAt={election.endAt} />
        </p>

        {turnout ? (
          <TurnoutBar turnout={turnout} />
        ) : (
          <p className="text-muted m-0 mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold">
            <CalendarClock size={13} className="flex-none text-indigo-500" aria-hidden="true" />
            Opens {formatRelativeTime(election.startAt, now)} · no votes yet
          </p>
        )}
      </div>

      <ChevronRight size={18} className="flex-none text-slate-300" aria-hidden="true" />
    </Link>
  );
}

/**
 * Participation on one open election, against the FROZEN denominator.
 *
 * Every branch names what it is showing. A bare percentage on an election row is
 * ambiguous in exactly the way this system cannot afford, so the word "turnout"
 * is on screen next to the number and in the bar's accessible name.
 */
function TurnoutBar({ turnout }) {
  if (turnout.isPending) {
    return <OverviewShimmer className="mt-2 h-[18px] w-full" />;
  }

  if (turnout.isError) {
    return (
      <p className="text-muted m-0 mt-2 text-[11.5px] font-semibold">
        Turnout unavailable — open the results screen to retry.
      </p>
    );
  }

  const { voted = 0, eligible, turnoutPct } = turnout.data ?? {};
  const hasDenominator = typeof eligible === "number" && eligible > 0;

  // An open election with no frozen electorate should not exist (/open freezes
  // it inside the same transaction that flips the status), but if the number is
  // missing the honest answer is that turnout is undefined — not that it is 0%.
  if (!hasDenominator) {
    return (
      <p className="text-muted m-0 mt-2 text-[11.5px] font-semibold">
        Turnout undefined · {voted.toLocaleString()} {voted === 1 ? "ballot" : "ballots"} cast
      </p>
    );
  }

  const percentage = turnoutPct ?? 0;

  return (
    <div className="mt-2 flex items-center gap-2.5">
      <span className="text-[10.5px] font-bold tracking-[.04em] text-slate-400 uppercase">
        Turnout
      </span>

      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`Turnout ${percentage}% — ${voted} of ${eligible} eligible students have voted. This is participation, not a result.`}
      >
        <div
          className="bg-primary-gradient h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      <span className="min-w-[34px] text-right text-[11.5px] font-bold text-slate-500">
        {percentage}%
      </span>

      <span className="text-muted hidden text-[11px] whitespace-nowrap min-[520px]:inline">
        {voted.toLocaleString()} / {eligible.toLocaleString()} voted
      </span>
    </div>
  );
}
