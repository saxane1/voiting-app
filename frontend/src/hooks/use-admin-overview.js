"use client";

import { useCallback } from "react";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { ELECTION_STATUS } from "@/utils/election-labels";
import { fetchElections } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";
import { AUDITED_STALE_MS, fetchTurnout } from "@/utils/results-api";
import { fetchStudents } from "@/utils/students-api";

/**
 * Everything the commission's landing overview shows, composed from endpoints
 * that already existed (F3, F4, F7). No new API call was added for this screen.
 *
 *   GET /students?limit=1            -> total   (the roll size; rows discarded)
 *   GET /elections?status=OPEN       -> the live elections + their count
 *   GET /elections?status=SCHEDULED  -> the upcoming ones
 *   GET /elections/:id/turnout       -> { voted, eligible, turnoutPct }, ONE PER
 *                                       OPEN ELECTION
 *
 * AGGREGATE ONLY. Not one of these returns a ballot, a candidate tally or a
 * voter, and nothing here asks for /results — the per-candidate standing of a
 * live race is not landing-page material (Project-Context §9). The overview
 * knows how many people voted; it cannot know who won, and that is deliberate.
 *
 * TURNOUT IS FETCHED ONLY FOR **OPEN** ELECTIONS. A DRAFT or SCHEDULED election
 * has never had its electorate frozen, so `eligible` is null and the percentage
 * is genuinely undefined rather than zero. Asking anyway would cost a request
 * per row to be told nothing.
 *
 * WHY THE TURNOUT QUERIES DO NOT POLL. GET /elections/:id/turnout writes a
 * TURNOUT_VIEWED audit row on every call (backend/src/controllers/results-
 * controllers.js). A dashboard left open on a 60s timer over an 8-hour polling
 * day would write thousands of rows nobody asked for and bury the entries that
 * matter. So the audited reads are seeded once per visit and refreshed only when
 * an admin asks; the two unaudited list reads carry the polling instead, which
 * is what keeps the status badges and the roll count honest. The live,
 * tick-by-tick view is one click away on the F7 results screen, where the socket
 * — which writes no audit rows at all — does that job properly.
 */

/** The unaudited list reads refresh on this interval. Turnout does not. */
const LIST_REFRESH_MS = 60_000;

/**
 * PSU runs 6 faculty ballots plus the Gudoomiye one, so a single page of 100 is
 * the whole picture in practice and the `total` is authoritative regardless.
 */
const LIST_LIMIT = 100;

const OPEN_PARAMS = { page: 1, limit: LIST_LIMIT, status: ELECTION_STATUS.OPEN };
const SCHEDULED_PARAMS = { page: 1, limit: LIST_LIMIT, status: ELECTION_STATUS.SCHEDULED };

/**
 * `limit: 1` because only `total` is read. `active: "all"` matches the students
 * screen's own default, so the number on this tile is the number an admin sees
 * after clicking it — a tile that disagreed with the page behind it would be
 * worse than no tile.
 */
const ROLL_PARAMS = { page: 1, limit: 1, active: "all" };

/**
 * Fold the per-election turnout reads into the two aggregate tiles.
 *
 * Module scope on purpose: `combine` must be referentially stable or useQueries
 * re-runs it on every render.
 *
 * PARTIAL DATA IS NOT AN AGGREGATE. "Ballots cast" is a sum over every open
 * election, so if one of them is still loading or has failed, the sum is not a
 * smaller number — it is not a number. `isComplete` gates both tiles, and a
 * failure surfaces as an error rather than a plausible-looking total. This is
 * the F8 lesson: a stale or partial figure that still looks authoritative is
 * worse than an obviously broken one.
 */
function combineTurnout(results) {
  const isComplete = results.length > 0 && results.every((result) => result.isSuccess);

  // Positional, and safe to be: useQueries returns results in the order the
  // queries were declared, and they are declared by mapping the open-elections
  // array. The caller zips them back together by the same index.
  const byIndex = results.map((result) => ({
    data: result.data ?? null,
    isPending: result.isPending,
    isError: result.isError,
  }));

  if (!isComplete) {
    return {
      byIndex,
      isComplete: false,
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
      error: results.find((result) => result.isError)?.error ?? null,
      ballotsCast: null,
      avgTurnoutPct: null,
      measuredCount: 0,
      updatedAt: null,
    };
  }

  // Ballots, not voters: a student who votes in their faculty ballot AND the
  // Gudoomiye ballot has cast two. One-person-one-vote is enforced per election,
  // which is exactly what this sum counts.
  const ballotsCast = results.reduce((sum, result) => sum + (result.data.voted ?? 0), 0);

  // The UNWEIGHTED mean of the per-election percentages, not a pooled
  // voted/eligible ratio. The electorates overlap — every student is in the
  // Gudoomiye election and in exactly one faculty election — so pooling the
  // denominators would count most of the university twice and answer a question
  // nobody asked. Each open ballot counts once here.
  const percentages = results
    .map((result) => result.data.turnoutPct)
    .filter((percentage) => typeof percentage === "number");

  return {
    byIndex,
    isComplete: true,
    isPending: false,
    isError: false,
    error: null,
    ballotsCast,
    avgTurnoutPct: percentages.length
      ? Number((percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length).toFixed(1))
      : null,
    measuredCount: percentages.length,
    updatedAt: Math.max(...results.map((result) => result.dataUpdatedAt)),
  };
}

export function useAdminOverview() {
  const queryClient = useQueryClient();

  const openQuery = useQuery({
    queryKey: queryKeys.electionList(OPEN_PARAMS),
    queryFn: () => fetchElections(OPEN_PARAMS),
    refetchInterval: LIST_REFRESH_MS,
  });

  const scheduledQuery = useQuery({
    queryKey: queryKeys.electionList(SCHEDULED_PARAMS),
    queryFn: () => fetchElections(SCHEDULED_PARAMS),
    refetchInterval: LIST_REFRESH_MS,
  });

  const rollQuery = useQuery({
    queryKey: queryKeys.studentList(ROLL_PARAMS),
    queryFn: () => fetchStudents(ROLL_PARAMS),
    refetchInterval: LIST_REFRESH_MS,
  });

  const openElections = openQuery.data?.elections ?? [];

  const turnout = useQueries({
    queries: openElections.map((election) => ({
      // The SAME key the F7 results screen uses, so opening an election's
      // dashboard from here reuses what this page already read instead of
      // re-fetching it and writing a second TURNOUT_VIEWED row.
      queryKey: queryKeys.electionTurnout(election.id),
      queryFn: () => fetchTurnout(election.id),
      // Audited read: pin the audit-volume window rather than inheriting the
      // app-wide default, so retuning global caching cannot quietly turn a
      // reconnect on a weak connection into a burst of TURNOUT_VIEWED rows.
      staleTime: AUDITED_STALE_MS,
    })),
    combine: combineTurnout,
  });

  /** Re-read everything on this screen. Wired to the header's refresh button. */
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.elections });
    queryClient.invalidateQueries({ queryKey: queryKeys.students });
    queryClient.invalidateQueries({ queryKey: queryKeys.results });
  }, [queryClient]);

  return {
    /** Open elections with their turnout read attached, in list order. */
    openElections: openElections.map((election, index) => ({
      ...election,
      turnout: turnout.byIndex[index] ?? { data: null, isPending: true, isError: false },
    })),
    scheduledElections: scheduledQuery.data?.elections ?? [],

    // `total` rather than the array length: the count must survive the day
    // someone opens an eighth ballot and the page still asks for 100.
    activeCount: openQuery.data?.total ?? null,
    studentCount: rollQuery.data?.total ?? null,

    openQuery,
    scheduledQuery,
    rollQuery,
    turnout,

    isFetching:
      openQuery.isFetching || scheduledQuery.isFetching || rollQuery.isFetching,
    refresh,
  };
}
