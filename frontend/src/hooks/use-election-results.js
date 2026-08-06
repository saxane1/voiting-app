"use client";

import { useCallback, useMemo } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/context/auth-context";
import { useElectionSocket } from "@/hooks/use-election-socket";
import { apiErrorCode } from "@/utils/api-error";
import { queryKeys } from "@/utils/query-keys";
import { AUDITED_STALE_MS, fetchResults, fetchTurnout } from "@/utils/results-api";

/**
 * The aggregates for ONE election, seeded from REST and kept current by B8's
 * socket.
 *
 * THE ONE PLACE THE CLIENT ASSEMBLES A RESULT — the mirror of
 * backend/src/utils/tally.js, which says the same thing about the server. Both
 * results screens call this and neither computes any of it itself:
 *
 *   /adminstration/results        the switcher (components/.../results-panel.js)
 *   /adminstration/results/[id]   the detail dashboard
 *
 * They must never show two different numbers for the same election, and two
 * implementations that agree today drift the first time one is touched. This
 * hook briefly WAS duplicated across the two screens, and the duplicate had
 * already drifted before it was merged back: only one copy distinguished a
 * failed background refetch from a failed first load (see `isStale` below), so
 * the other blanked a live dashboard whenever a refresh blipped. That is the
 * argument for this file, in one bug.
 *
 * AGGREGATE ONLY, and that is the backend's property rather than a promise made
 * here: /results reads Vote, /turnout reads VoteReceipt, the socket payload is
 * built by the same backend/src/utils/tally.js pair, and none of the three
 * joins to a User. No response carries a userId, a ballot row, a receipt or a
 * timestamp finer than the hour (Project-Context §8).
 *
 * REST SEEDS, SOCKET UPDATES, REST RE-SEEDS ON RECONNECT. A socket that was down
 * missed an unknown number of throttled ticks and nothing replays them, so every
 * reconnect after the first re-reads the authoritative numbers. A tally that is
 * wrong by an unknown amount must never sit under a "Live" badge.
 *
 * SWITCHING ELECTIONS IS FREE. useElectionSocket keys its effect on the election
 * id, and its cleanup emits `leave-election` for the outgoing one before
 * releasing the shared connection — so changing the selection leaves the old
 * room and joins the new one with no bookkeeping here. Its return value is also
 * derived per-election, so the previous election's numbers can never bleed into
 * the incoming one while the new join is in flight.
 */

export function useElectionResults(electionId) {
  const queryClient = useQueryClient();
  const { isAuthenticated, role } = useAuth();

  // Both reads are AUDITED, so both pin the audit-volume stale window rather
  // than inheriting the app-wide default. See AUDITED_STALE_MS.
  const resultsQuery = useQuery({
    queryKey: queryKeys.electionResults(electionId),
    queryFn: () => fetchResults(electionId),
    enabled: Boolean(electionId),
    staleTime: AUDITED_STALE_MS,
  });

  const turnoutQuery = useQuery({
    queryKey: queryKeys.electionTurnout(electionId),
    queryFn: () => fetchTurnout(electionId),
    enabled: Boolean(electionId),
    staleTime: AUDITED_STALE_MS,
  });

  /**
   * Re-read the authoritative aggregates after a socket reconnect — but only if
   * they are actually behind.
   *
   * THE STALE WINDOW DOES NOT COVER THIS PATH ON ITS OWN. `invalidateQueries`
   * forces a refetch regardless of staleTime: query-core's `invalidate()` sets
   * `isInvalidated`, and `isStaleByTime` short-circuits to true on that flag
   * before `refetchQueries({ type: "active" })` runs. So an ungated resync
   * writes one RESULTS_VIEWED and one TURNOUT_VIEWED row per socket flap, and a
   * bad connection — the normal case here, not the exceptional one — buries the
   * log in reads nobody performed deliberately.
   *
   * SKIPPING IS SAFE, and specifically it is not a freshness trade. The socket
   * reseeds itself: `join-election` sends an immediate authoritative snapshot to
   * the reconnecting socket (backend/src/socket/election-events.js →
   * sendResultsSnapshot), computed by the same functions as these REST reads.
   * Inside the window, the re-read would return what the socket has just
   * delivered. Outside it, the reseed runs exactly as before.
   */
  const resync = useCallback(() => {
    const cutoff = Date.now() - AUDITED_STALE_MS;

    const bothFresh = [
      queryKeys.electionResults(electionId),
      queryKeys.electionTurnout(electionId),
    ].every((key) => {
      const state = queryClient.getQueryState(key);

      return state?.data !== undefined && state.dataUpdatedAt > cutoff;
    });

    if (bothFresh) return;

    queryClient.invalidateQueries({ queryKey: queryKeys.results });
  }, [queryClient, electionId]);

  // A transition arrived on the wire (OPEN -> CLOSED). The election's own record
  // changed too, so the list feeding the picker is dropped alongside the
  // aggregates — a stale status badge is a lie about whether voting is live.
  const handleStatusChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.results });
    queryClient.invalidateQueries({ queryKey: queryKeys.elections });
  }, [queryClient]);

  // ADMIN only. Students and auditors are refused at the handshake server-side,
  // but their browsers should not be opening a connection destined to be shut.
  const { connection, refusal, live, liveStatus } = useElectionSocket({
    electionId,
    enabled: Boolean(electionId) && isAuthenticated && role === "ADMIN",
    onResync: resync,
    onStatusChange: handleStatusChange,
  });

  const restResults = resultsQuery.data;
  const restTurnout = turnoutQuery.data;

  /**
   * Live counts win; REST supplies what the wire shape deliberately omits.
   *
   * `results-update` carries the lean row — { candidateId, name, voteCount } —
   * because a dashboard tick needs a count, not a photo. So presentation fields
   * are matched back from the REST row by candidateId. Server ordering
   * (voteCount desc, then name) is preserved either way, and candidates on zero
   * are present in both shapes.
   */
  const tallies = useMemo(() => {
    const restRows = restResults?.results ?? [];

    if (!live?.tallies) return restRows;

    const presentation = new Map(restRows.map((row) => [row.candidateId, row]));

    return live.tallies.map((row) => ({
      ...row,
      photoUrl: presentation.get(row.candidateId)?.photoUrl ?? null,
    }));
  }, [live, restResults]);

  const totalVotes = useMemo(
    () =>
      live?.tallies
        ? live.tallies.reduce((sum, row) => sum + row.voteCount, 0)
        : (restResults?.totalVotes ?? 0),
    [live, restResults]
  );

  const turnout = {
    voted: live?.turnout?.voted ?? restTurnout?.voted ?? 0,
    eligible: live?.turnout?.eligible ?? restTurnout?.eligible ?? null,
    turnoutPct: live?.turnout?.turnoutPct ?? restTurnout?.turnoutPct ?? null,
    note: restTurnout?.note ?? null,
  };

  const hasData = Boolean(restResults);
  const failed = resultsQuery.isError || turnoutQuery.isError;
  const error = resultsQuery.error ?? turnoutQuery.error;

  // A deleted election is fatal even though we still hold its last numbers:
  // those figures now describe something that does not exist, so they must come
  // off the screen rather than linger behind a "may be out of date" notice.
  const isGone = apiErrorCode(error) === "ELECTION_NOT_FOUND";

  return {
    election: restResults?.election ?? null,
    // The socket's view of status is fresher than the REST snapshot: the join
    // ack carries it, and `election-status` updates it the instant a transition
    // happens. It gates the leading badge, so freshness matters.
    status: liveStatus ?? restResults?.election?.status ?? null,
    tallies,
    totalVotes,
    turnout,

    connection,
    refusal,
    isLive: Boolean(live),

    isPending: resultsQuery.isPending || turnoutQuery.isPending,
    isFetching: resultsQuery.isFetching || turnoutQuery.isFetching,

    /**
     * TWO ERROR SHAPES, because they need two different screens.
     *
     * @tanstack/query-core's reducer keeps the last successful `data` when a
     * REFETCH fails — its "error" branch spreads the previous state forward and
     * only overwrites `status`. So `isError` alone would either blank a working
     * dashboard behind a full-page error, or leave dead numbers on screen with
     * nothing to say they stopped updating.
     *
     *   isError  nothing to show     -> the full error screen
     *   isStale  numbers, but frozen -> keep them, kill every "live" affordance
     *
     * The second case is the one that matters during an election, and it is the
     * one a single `isError` check silently gets wrong.
     */
    isError: failed && (!hasData || isGone),
    isStale: failed && hasData && !isGone,
    error,

    refetch: () => {
      resultsQuery.refetch();
      turnoutQuery.refetch();
    },
  };
}
