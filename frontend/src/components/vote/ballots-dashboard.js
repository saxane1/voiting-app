"use client";

import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { useAuth } from "@/context/auth-context";
import api from "@/utils/axios";
import { BALLOT_STATE, ballotState } from "@/utils/ballot-state";
import { formatDate } from "@/utils/format-date";
import { queryKeys } from "@/utils/query-keys";

import BallotCard from "./ballot-card";
import SecrecyNote from "./secrecy-note";

/**
 * The student's list of ballots.
 *
 * Two sources, both participation-only:
 *   GET /me/ballots        — the elections they can act on. The backend filters
 *                            this to status OPEN, so anything finished has
 *                            already dropped out of it.
 *   GET /me/voting-status  — their own voting record. This is the ONLY way to
 *                            show "you voted in X" for an election that has
 *                            since closed, because /me/ballots no longer
 *                            returns it. It carries electionId, title and
 *                            votedAt — never a candidate.
 *
 * Nothing on this screen is a tally.
 *
 * THE TWO READS FAIL SEPARATELY, AND ARE REPORTED SEPARATELY. /me/voting-status
 * is the only source for "you have voted in N elections", and this is the one
 * screen a student uses to check that their vote was counted (Project-Context
 * §4: prove a student voted without exposing how). A failed or in-flight read
 * rendered as `0` would be indistinguishable from a true zero, and it would tell
 * a student who did vote that they did not — on the exact screen built to
 * reassure them otherwise. So neither the count nor the record is ever drawn
 * from an unsettled query: pending shows a placeholder, failure says it failed
 * and offers a retry, and only a successful read produces a number.
 *
 * The ballot cards are unaffected either way — their "You voted" pill comes from
 * /me/ballots' own `votedAlready` flag (utils/ballot-state.js), not from here.
 */

async function fetchMyBallots() {
  const { data } = await api.get("/me/ballots");

  return data.ballots ?? [];
}

async function fetchMyVotingStatus() {
  const { data } = await api.get("/me/voting-status");

  return data.voted ?? [];
}

export default function BallotsDashboard() {
  const { user } = useAuth();

  const ballotsQuery = useQuery({
    queryKey: queryKeys.myBallots,
    queryFn: fetchMyBallots,
  });

  const votingStatusQuery = useQuery({
    queryKey: queryKeys.myVotingStatus,
    queryFn: fetchMyVotingStatus,
  });

  if (ballotsQuery.isPending) {
    return <LoadingState label="Loading your elections" />;
  }

  if (ballotsQuery.isError) {
    return (
      <ErrorState
        error={ballotsQuery.error}
        onRetry={() => ballotsQuery.refetch()}
        isRetrying={ballotsQuery.isFetching}
      />
    );
  }

  const ballots = ballotsQuery.data;

  // `data` is read ONLY under isSuccess. React Query keeps the last good `data`
  // alongside an error after a failed refetch, and leaves it undefined on a
  // failed first load — so `data ?? []` would silently mean "no votes" in the
  // second case. isSuccess is the only flag that says the array on screen is the
  // one the server actually sent.
  const votedRecords = votingStatusQuery.isSuccess ? votingStatusQuery.data : null;

  const openToVote = ballots.filter(
    (ballot) => ballotState(ballot) === BALLOT_STATE.VOTABLE
  ).length;

  // Elections the student voted in that are no longer on the active list —
  // closed since. Their only representation is the record below.
  const activeIds = new Set(ballots.map((ballot) => ballot.id));
  const pastVotes = votedRecords?.filter((record) => !activeIds.has(record.electionId)) ?? [];

  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="animate-fade-up">
      <p className="text-muted m-0 text-[13px] font-medium">Welcome back,</p>
      <h1 className="font-display text-ink m-0 mt-0.5 mb-1 text-2xl font-bold tracking-[-0.02em]">
        {firstName || "Student"}
      </h1>
      <p className="text-muted m-0 mb-[18px] text-[13.5px]">
        {openToVote > 0 ? (
          <>
            You have{" "}
            <strong className="font-bold text-indigo-700">
              {openToVote} election{openToVote === 1 ? "" : "s"}
            </strong>{" "}
            waiting for your vote.
          </>
        ) : (
          "You have no elections waiting for your vote."
        )}
      </p>

      <div className="mb-[22px] flex gap-2.5">
        <StatTile value={openToVote} label="To vote" tone="text-indigo-600" />

        {/* Never a number this query has not returned. See the note at the top
            of this file: "0 votes cast" shown to a student who voted is the
            worst thing this screen can say. */}
        <StatTile
          value={votedRecords === null ? null : votedRecords.length}
          label="Votes cast"
          tone="text-success-600"
          isPending={votingStatusQuery.isPending}
          isError={votingStatusQuery.isError}
        />
      </div>

      <h2 className="text-ink m-0 mb-3 text-sm font-bold">Your elections</h2>

      {ballots.length === 0 ? (
        <EmptyState title="No elections open right now.">
          When the commission opens a ballot you are eligible for, it will appear here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3.5">
          {ballots.map((ballot) => (
            <BallotCard key={ballot.id} ballot={ballot} />
          ))}
        </div>
      )}

      <VotingRecord
        records={pastVotes}
        isPending={votingStatusQuery.isPending}
        isError={votingStatusQuery.isError}
        onRetry={() => votingStatusQuery.refetch()}
        isRetrying={votingStatusQuery.isFetching}
      />

      <SecrecyNote />
    </div>
  );
}

/**
 * `value` is rendered only when the figure is known. `null` under a settled,
 * successful query cannot happen; `null` here always means "not answered yet",
 * and the placeholder says so rather than standing in a zero.
 */
function StatTile({ value, label, tone, isPending = false, isError = false }) {
  return (
    <div className="border-line bg-surface flex-1 rounded-lg border p-3.5">
      {isPending ? (
        <>
          <span
            aria-hidden="true"
            className="my-[5px] block h-[22px] w-10 rounded-md bg-slate-100 bg-[linear-gradient(90deg,var(--color-slate-100),var(--color-slate-200),var(--color-slate-100))] bg-[length:200%_100%] motion-safe:animate-shimmer"
          />
          <span className="sr-only">Loading {label}</span>
        </>
      ) : isError ? (
        <div className="font-display flex h-8 items-center gap-1.5 text-[22px] font-bold text-slate-400">
          <TriangleAlert size={17} className="shrink-0 text-warning-500" aria-hidden="true" />
          <span aria-hidden="true">—</span>
          <span className="sr-only">Not available</span>
        </div>
      ) : (
        <div className={`font-display text-[22px] font-bold ${tone}`}>{value}</div>
      )}

      <div className="text-muted text-xs">{label}</div>
    </div>
  );
}

/**
 * The voting record, in every state /me/voting-status can be in.
 *
 * A student who voted in an election that has since closed has NO other trace of
 * it on this screen — /me/ballots only returns what is currently open. So an
 * absent section and a failed read look identical from the outside, and the
 * failure has to say so out loud rather than resolve to silence.
 *
 * Participation only: title and date. Which candidate they chose is not in this
 * payload, is not stored against them anywhere (Project-Context §8), and cannot
 * be recovered by any screen in this system.
 */
function VotingRecord({ records, isPending, isError, onRetry, isRetrying }) {
  // Settled, successful, and genuinely nothing to show.
  if (!isPending && !isError && records.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-ink m-0 mb-3 text-sm font-bold">Your voting record</h2>

      {isPending ? (
        <>
          <span
            aria-hidden="true"
            className="block h-[68px] rounded-lg bg-slate-100 bg-[linear-gradient(90deg,var(--color-slate-100),var(--color-slate-200),var(--color-slate-100))] bg-[length:200%_100%] motion-safe:animate-shimmer"
          />
          <span className="sr-only">Loading your voting record</span>
        </>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-lg border border-warning-500/35 bg-warning-50 p-3.5"
        >
          <p className="text-warning-700 m-0 flex items-start gap-2 text-[13px] leading-[1.5] font-semibold">
            <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
            Couldn&apos;t load your voting record.
          </p>
          <p className="text-warning-700/90 m-0 mt-1 pl-6 text-xs leading-[1.5]">
            This is a display problem only — any vote you have already cast is recorded and
            counted. Try again when you have a connection.
          </p>

          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="text-warning-700 mt-2.5 ml-6 inline-flex cursor-pointer items-center gap-2 rounded-md border border-warning-500/40 bg-white px-3.5 py-2 text-xs font-semibold transition hover:bg-warning-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} aria-hidden="true" />
            {isRetrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : (
        <PastVotes records={records} />
      )}
    </section>
  );
}

/**
 * Participation history for elections that have closed. Title + date only —
 * this is a record that the student took part, never of what they chose, and
 * never a result. The heading and the section wrapper belong to <VotingRecord>,
 * which owns the loading and failure branches this list is only one of.
 */
function PastVotes({ records }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {records.map((record) => (
        <li
          key={record.electionId}
          className="border-line bg-surface flex items-start gap-2.5 rounded-lg border p-3.5"
        >
          <CircleCheck size={17} className="mt-px shrink-0 text-success-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-ink m-0 text-[13.5px] font-bold">{record.title}</p>
            <p className="text-muted m-0 mt-0.5 text-xs">
              You voted {formatDate(record.votedAt)} · Voting closed. Results are announced by the
              university.
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
