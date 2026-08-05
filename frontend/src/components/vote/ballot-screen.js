"use client";

import { useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, CircleX, Clock, EyeOff, Lock } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { apiErrorCode, apiErrorMessage, isNetworkError } from "@/utils/api-error";
import api from "@/utils/axios";
import { formatDateTime } from "@/utils/format-date";
import { queryKeys } from "@/utils/query-keys";

import BallotForm from "./ballot-form";
import VoteConfirm from "./vote-confirm";
import VoteRecorded from "./vote-recorded";
import VoteStatusPanel from "./vote-status-panel";

/**
 * The ballot, and the whole vote state machine.
 *
 * VOTABILITY IS RE-DERIVED FROM THE SERVER ON EVERY MOUNT. The dashboard link
 * that got the student here proves nothing: they may have voted in another tab,
 * hit back after voting, or the window may have closed in between. So this
 * screen asks GET /me/ballots/:id fresh and renders whatever the server says —
 * which is what makes the back-button-after-voting and two-tabs cases heal
 * themselves rather than showing a ballot that will only be rejected.
 *
 * The server's answers map to states like this (verified against
 * backend/src/controllers/vote-controllers.js):
 *   200 + alreadyVoted:true  -> voted panel  (NOT an error — the candidates are
 *                               still in the payload, so the flag is the only
 *                               thing separating a fresh ballot from a used one)
 *   403 NOT_ELIGIBLE         -> not-eligible panel
 *   409 VOTING_NOT_OPEN      -> not-open panel
 *   404 ELECTION_NOT_FOUND   -> missing panel
 */

const PHASE = {
  SELECT: "select",
  REVIEW: "review",
  RECORDED: "recorded",
};

/** Strips the internal "(status CLOSED)" tail off the server's message. */
function cleanServerMessage(error, fallback) {
  return apiErrorMessage(error, fallback).replace(/\s*\(status [A-Z_]+\)/, "");
}

async function fetchBallot(electionId) {
  const { data } = await api.get(`/me/ballots/${electionId}`);

  return data;
}

export default function BallotScreen({ electionId }) {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState(PHASE.SELECT);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [recorded, setRecorded] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [notice, setNotice] = useState(null);

  /**
   * Synchronous double-submit latch.
   *
   * `voteMutation.isPending` is not enough on its own: it only becomes true
   * after React re-renders, so several clicks landing inside ONE tick — a fast
   * double-tap, or a stuck touch event — all read the stale `false` and each
   * fire a POST. A ref flips immediately, in the same tick as the first click.
   *
   * The server is still the real guarantee (the VoteReceipt unique constraint
   * means only one ballot can ever be recorded, and the extras come back as
   * ALREADY_VOTED, which is reconciled below). This just stops the client from
   * knowingly sending them.
   */
  const submitLockRef = useRef(false);

  const ballotQuery = useQuery({
    queryKey: queryKeys.myBallot(electionId),
    queryFn: () => fetchBallot(electionId),
    // Every non-network failure here is a definitive answer about this ballot
    // (not eligible / not open / gone), so retrying only delays the panel.
    retry: (failureCount, error) => isNetworkError(error) && failureCount < 2,
  });

  function invalidateVotingQueries() {
    queryClient.invalidateQueries({ queryKey: queryKeys.myBallots });
    queryClient.invalidateQueries({ queryKey: queryKeys.myVotingStatus });
    queryClient.invalidateQueries({ queryKey: queryKeys.myBallot(electionId) });
  }

  const voteMutation = useMutation({
    mutationFn: async ({ candidateId }) => {
      const { data } = await api.post(`/elections/${electionId}/vote`, { candidateId });

      return data;
    },
    onSuccess: (data) => {
      // Participation only — data is { recorded, electionId, votedAt }. The
      // candidate is deliberately not echoed back by the server and is not kept
      // here either.
      setRecorded({ votedAt: data.votedAt, election: ballotQuery.data?.election });
      setPhase(PHASE.RECORDED);
      setNotice(null);
      invalidateVotingQueries();
    },
    onError: (error) => {
      const code = apiErrorCode(error);

      // ONE-VOTE RECONCILIATION. A receipt already exists — from another tab, or
      // from a request that succeeded while the response was lost. This is not a
      // failure to show in red: the student's vote IS recorded, so the UI simply
      // catches up with the server.
      if (code === "ALREADY_VOTED") {
        setBlocked({ kind: "already-voted" });
        setNotice(null);
        invalidateVotingQueries();
        toast("Your vote in this election was already recorded.", { icon: "✓" });
        return;
      }

      // The window shut between loading the ballot and submitting it.
      if (code === "VOTING_NOT_OPEN") {
        setBlocked({
          kind: "not-open",
          message: cleanServerMessage(error, "This election is not accepting votes right now."),
        });
        setNotice(null);
        invalidateVotingQueries();
        return;
      }

      if (code === "NOT_ELIGIBLE") {
        setBlocked({ kind: "not-eligible" });
        setNotice(null);
        invalidateVotingQueries();
        return;
      }

      // The ballot we rendered is stale — send them back to a fresh one.
      if (code === "INVALID_CANDIDATE") {
        setSelectedCandidateId(null);
        setPhase(PHASE.SELECT);
        setNotice(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.myBallot(electionId) });
        toast.error("That candidate is no longer on this ballot. Please choose again.");
        return;
      }

      // Retryable: contention on the vote chain, or a dropped connection.
      // Nothing was written, so staying on the review screen is correct.
      if (isNetworkError(error)) {
        setNotice("We couldn't reach the voting service. Check your connection and try again.");
        return;
      }

      setNotice(
        apiErrorMessage(error, "Your vote could not be recorded. Please try again in a moment.")
      );
    },
    // Released whatever the outcome, so a genuine retry after a failure is
    // still possible. On success the confirmation screen replaces the button
    // anyway.
    onSettled: () => {
      submitLockRef.current = false;
    },
  });

  function castVote(candidateId) {
    if (submitLockRef.current || voteMutation.isPending) return;

    submitLockRef.current = true;
    voteMutation.mutate({ candidateId });
  }

  // --- Terminal states first: neither a background refetch nor a late error may
  // --- tear down a confirmation the student is still reading.

  if (phase === PHASE.RECORDED && recorded) {
    return (
      <VoteRecorded
        election={recorded.election ?? ballotQuery.data?.election ?? { title: "this election" }}
        votedAt={recorded.votedAt}
      />
    );
  }

  if (blocked) {
    return <BlockedPanel blocked={blocked} />;
  }

  if (ballotQuery.isPending) {
    return <LoadingState label="Loading your ballot" />;
  }

  if (ballotQuery.isError) {
    return <BallotErrorPanel query={ballotQuery} />;
  }

  const { election, candidates, alreadyVoted, votedAt } = ballotQuery.data;

  // Server truth wins over any local navigation state.
  if (alreadyVoted) {
    return <AlreadyVotedPanel election={election} votedAt={votedAt} />;
  }

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId);

  if (phase === PHASE.REVIEW && selectedCandidate) {
    return (
      <>
        <BackLink />
        <VoteConfirm
          election={election}
          candidate={selectedCandidate}
          isSubmitting={voteMutation.isPending}
          notice={notice}
          onBack={() => {
            if (voteMutation.isPending) return;
            setNotice(null);
            setPhase(PHASE.SELECT);
          }}
          // Pessimistic and single-shot: nothing in the UI claims success until
          // the server says so, and an in-flight vote blocks another.
          onConfirm={() => castVote(selectedCandidate.id)}
        />
      </>
    );
  }

  return (
    <>
      <BackLink />
      <BallotForm
        election={election}
        candidates={candidates}
        selectedCandidateId={selectedCandidateId}
        onSelect={setSelectedCandidateId}
        onReview={() => setPhase(PHASE.REVIEW)}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/vote"
      className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold transition"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      All elections
    </Link>
  );
}

function AlreadyVotedPanel({ election, votedAt }) {
  return (
    <VoteStatusPanel
      icon={CircleCheck}
      tone="success"
      badge="Ballot cast"
      title="You've already voted"
      detail={
        <div className="border-line bg-surface mx-auto mb-[22px] max-w-[340px] rounded-lg border p-4 text-left">
          {votedAt && (
            <p className="text-muted m-0 mb-2.5 flex items-center gap-2 text-xs">
              <Clock size={15} className="shrink-0" aria-hidden="true" />
              Recorded {formatDateTime(votedAt)}
            </p>
          )}
          <p className="text-ink m-0 flex items-center gap-2 text-[12.5px] font-semibold">
            <EyeOff size={15} className="shrink-0 text-indigo-600" aria-hidden="true" />
            Sealed anonymously — even we can&apos;t see your choice
          </p>
        </div>
      }
    >
      Your ballot for <strong className="text-ink font-bold">{election?.title}</strong> was recorded.
      Each student votes once — you&apos;re all set.
    </VoteStatusPanel>
  );
}

function BlockedPanel({ blocked }) {
  if (blocked.kind === "already-voted") {
    return (
      <VoteStatusPanel icon={CircleCheck} tone="success" badge="Ballot cast" title="You've already voted">
        Your vote in this election was already recorded, so this one wasn&apos;t counted again. Each
        student votes once.
      </VoteStatusPanel>
    );
  }

  if (blocked.kind === "not-eligible") {
    return (
      <VoteStatusPanel icon={CircleX} tone="error" title="This ballot isn't yours">
        You are not eligible to vote in this election. You can only vote in your own faculty&apos;s
        election and the university-wide one.
      </VoteStatusPanel>
    );
  }

  return (
    <VoteStatusPanel icon={Lock} tone="warning" title="Voting isn't open">
      {blocked.message || "This election is not accepting votes right now."}
    </VoteStatusPanel>
  );
}

function BallotErrorPanel({ query }) {
  const code = apiErrorCode(query.error);

  if (code === "NOT_ELIGIBLE") {
    return <BlockedPanel blocked={{ kind: "not-eligible" }} />;
  }

  if (code === "VOTING_NOT_OPEN") {
    return (
      <BlockedPanel
        blocked={{
          kind: "not-open",
          message: cleanServerMessage(
            query.error,
            "This election is not accepting votes right now."
          ),
        }}
      />
    );
  }

  if (code === "ELECTION_NOT_FOUND") {
    return (
      <VoteStatusPanel icon={CircleX} tone="neutral" title="Election not found">
        We couldn&apos;t find this election. It may have been removed.
      </VoteStatusPanel>
    );
  }

  return (
    <ErrorState
      error={query.error}
      onRetry={() => query.refetch()}
      isRetrying={query.isFetching}
    />
  );
}
