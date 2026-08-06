"use client";

import { BarChart3, ChartColumn, Hourglass, Lock, Trophy } from "lucide-react";
import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { useElectionResults } from "@/hooks/use-election-results";
import { ELECTION_STATUS } from "@/utils/election-labels";

import ElectionStatusBadge from "../elections/election-status-badge";
import LiveIndicator from "./live-indicator";
import ResultsStaleNotice from "./results-stale-notice";
import ResultsSummaryTiles from "./results-summary-tiles";
import TallyChart from "./tally-chart";
import TallyTable from "./tally-table";
import VoteShareDonut from "./vote-share-donut";

/**
 * One election's aggregates, rendered inline under the switcher.
 *
 * This is a SUMMARY view. The full screen — with the ballot-chain integrity
 * check and the hourly turnout detail — is /adminstration/results/[id], and the
 * button at the foot of this panel is the way there. The integrity UI is
 * deliberately not duplicated here: running it writes an INTEGRITY_CHECKED audit
 * row, and that record only means something if verification is an act an admin
 * chose, not something a landing switcher fires on selection.
 *
 * NO WINNER IS DECLARED WHILE VOTING IS OPEN. See <StandingCard> below: the
 * mockup's gold "CURRENTLY LEADING" trophy is gated on the election being CLOSED
 * or PUBLISHED and is off for every other status, including OPEN. This is not a
 * styling preference. The backend refuses to name a winner or resolve a tie
 * (backend/src/utils/tally.js sorts and stops there), and the university
 * announces the official result off-system (Project-Context §9) — a dashboard
 * that crowns someone at 40% of the ballots contradicts both, and it is the
 * screen most likely to end up photographed.
 *
 * Everything below is a count. There is no per-ballot, per-voter or per-receipt
 * value anywhere in this component's input, and no endpoint it touches can
 * return one.
 */

/** Statuses where voting has finished and a standing may be framed as one. */
const RESOLVED = [ELECTION_STATUS.CLOSED, ELECTION_STATUS.PUBLISHED];

export default function ResultsPanel({ electionId, election }) {
  const {
    status,
    tallies,
    totalVotes,
    turnout,
    connection,
    refusal,
    isLive,
    isPending,
    isError,
    isStale,
    error,
    refetch,
    isFetching,
  } = useElectionResults(electionId);

  if (isPending) {
    return <LoadingState label={`Loading results for ${election?.title ?? "this election"}`} />;
  }

  if (isError) {
    return <ErrorState error={error} onRetry={refetch} isRetrying={isFetching} />;
  }

  const isOpen = status === ELECTION_STATUS.OPEN;

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <ElectionStatusBadge status={status} size="lg" />

        {/* A failed refresh strips every live affordance before it does anything
            else: numbers that stopped updating must never sit under a "Live"
            badge, which is the one way this screen can actively mislead. */}
        {isOpen && !isStale && <LiveIndicator connection={connection} refusal={refusal} />}
      </div>

      {isStale && (
        <ResultsStaleNotice error={error} onRetry={refetch} isRetrying={isFetching} />
      )}

      <ResultsSummaryTiles
        totalVotes={totalVotes}
        turnout={turnout}
        candidateCount={tallies.length}
      />

      <div className="grid items-start gap-5 min-[1100px]:grid-cols-[1.5fr_1fr]">
        <section className="border-line bg-surface overflow-hidden rounded-lg border shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
                <BarChart3 size={18} aria-hidden="true" />
              </span>
              <h2 className="text-ink m-0 text-[15px] font-bold">Vote tally</h2>
            </div>

            <span className="text-muted rounded-pill inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold">
              {isOpen && isLive && !isStale ? (
                <>
                  <ChartColumn size={12} aria-hidden="true" />
                  Updating as ballots arrive
                </>
              ) : (
                <>
                  <Lock size={12} aria-hidden="true" />
                  {status === ELECTION_STATUS.PUBLISHED ? "Final" : "Not live"}
                </>
              )}
            </span>
          </div>

          {tallies.length === 0 ? (
            <p className="text-muted m-0 px-5 pb-6 text-[13px] leading-[1.55]">
              This election has no candidates, so there is nothing to tally.
            </p>
          ) : (
            <>
              <div className="px-3 pb-2">
                <TallyChart tallies={tallies} />
              </div>

              <div className="overflow-x-auto">
                <TallyTable tallies={tallies} totalVotes={totalVotes} />
              </div>

              {totalVotes === 0 && (
                <p className="text-muted border-line m-0 border-t px-5 py-4 text-[12.5px] leading-[1.55]">
                  No ballots have been cast yet. Every candidate is on zero — this is an empty
                  tally, not a tied one.
                </p>
              )}
            </>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {tallies.length > 0 && (
            <VoteShareDonut tallies={tallies} totalVotes={totalVotes} />
          )}

          <StandingCard status={status} tallies={tallies} totalVotes={totalVotes} />

          <Link
            href={`/adminstration/results/${electionId}`}
            className="flex items-center justify-center gap-2 rounded-[10px] border border-indigo-100 bg-indigo-50 px-4 py-3 text-[13.5px] font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:text-indigo-700"
          >
            <ChartColumn size={17} aria-hidden="true" />
            View full results
          </Link>

          <p className="text-muted m-0 flex items-start gap-2 px-1 text-[11.5px] leading-[1.55]">
            <Lock size={13} className="mt-px shrink-0" aria-hidden="true" />
            Aggregate counts only. Ballots are stored with no link to the student who cast them,
            so no view in this system can show how any individual voted. Results are never shown
            to students; the university announces the official outcome.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The standing — but ONLY once voting has finished.
 *
 * THE GATE, in order:
 *   1. status must be CLOSED or PUBLISHED. OPEN, SCHEDULED and DRAFT get the
 *      neutral counting-in-progress card instead. The default is off: an
 *      unrecognised status falls through to the neutral branch, so a status
 *      added later cannot accidentally start declaring winners.
 *   2. there must be at least one ballot. A 0–0 election has no highest count.
 *   3. the top count must be held by EXACTLY ONE candidate. The backend
 *      deliberately does not resolve ties — equal counts are equal counts — so
 *      neither does this.
 *
 * Even when all three hold, the wording is "highest count", not "winner". This
 * system reports numbers; the university announces the result.
 */
function StandingCard({ status, tallies, totalVotes }) {
  const resolved = RESOLVED.includes(status);

  if (!resolved) {
    return (
      <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Hourglass size={20} aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <h2 className="text-muted font-body m-0 text-[11.5px] font-bold tracking-[.04em] uppercase">
              Counting in progress
            </h2>
            <p className="text-ink m-0 mt-0.5 text-[13px] leading-[1.45] font-semibold">
              No leader is declared while voting is open.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const top = Math.max(0, ...tallies.map((row) => row.voteCount));
  const leaders = tallies.filter((row) => row.voteCount === top && top > 0);

  if (totalVotes === 0 || leaders.length !== 1) {
    return (
      <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
        <div className="flex items-center gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Hourglass size={20} aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <h2 className="text-muted font-body m-0 text-[11.5px] font-bold tracking-[.04em] uppercase">
              No highest count
            </h2>
            <p className="text-ink m-0 mt-0.5 text-[13px] leading-[1.45] font-semibold">
              {totalVotes === 0
                ? "No ballots were cast in this election."
                : `${leaders.length} candidates are tied on ${top.toLocaleString()} votes.`}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-[18px]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <Trophy size={20} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="text-warning-700 font-body m-0 text-[11.5px] font-bold tracking-[.04em] uppercase">
            Highest count
          </h2>
          <p className="text-ink m-0 mt-0.5 truncate text-[15px] font-bold">{leaders[0].name}</p>
        </div>
      </div>

      <p className="text-muted m-0 mt-2.5 text-[11.5px] leading-[1.5]">
        {leaders[0].voteCount.toLocaleString()} of {totalVotes.toLocaleString()} ballots. The
        university announces the official result.
      </p>
    </section>
  );
}
