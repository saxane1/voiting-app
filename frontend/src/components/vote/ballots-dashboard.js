"use client";

import { CircleCheck } from "lucide-react";
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
  const votedRecords = votingStatusQuery.data ?? [];

  const openToVote = ballots.filter(
    (ballot) => ballotState(ballot) === BALLOT_STATE.VOTABLE
  ).length;

  // Elections the student voted in that are no longer on the active list —
  // closed since. Their only representation is the record below.
  const activeIds = new Set(ballots.map((ballot) => ballot.id));
  const pastVotes = votedRecords.filter((record) => !activeIds.has(record.electionId));

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
        <StatTile value={votedRecords.length} label="Votes cast" tone="text-success-600" />
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

      {pastVotes.length > 0 && <PastVotes records={pastVotes} />}

      <SecrecyNote />
    </div>
  );
}

function StatTile({ value, label, tone }) {
  return (
    <div className="border-line bg-surface flex-1 rounded-lg border p-3.5">
      <div className={`font-display text-[22px] font-bold ${tone}`}>{value}</div>
      <div className="text-muted text-xs">{label}</div>
    </div>
  );
}

/**
 * Participation history for elections that have closed. Title + date only —
 * this is a record that the student took part, never of what they chose, and
 * never a result.
 */
function PastVotes({ records }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink m-0 mb-3 text-sm font-bold">Your voting record</h2>

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
    </section>
  );
}
