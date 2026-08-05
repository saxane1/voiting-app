"use client";

import { useCallback, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CircleAlert, LoaderCircle, Lock } from "lucide-react";
import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { useAuth } from "@/context/auth-context";
import { useElectionSocket } from "@/hooks/use-election-socket";
import { apiErrorCode } from "@/utils/api-error";
import { ELECTION_STATUS, electionStatusAdminLabel } from "@/utils/election-labels";
import { queryKeys } from "@/utils/query-keys";
import { checkIntegrity, fetchResults, fetchTurnout } from "@/utils/results-api";

import PageHeader from "../page-header";
import ElectionStatusBadge from "../elections/election-status-badge";
import IntegrityCard from "./integrity-card";
import LiveIndicator from "./live-indicator";
import TallyChart from "./tally-chart";
import TallyTable from "./tally-table";
import TurnoutCard from "./turnout-card";

/**
 * The live results dashboard for ONE election — F7.
 *
 * ADMIN-ONLY. The route sits under app/adminstration/, whose layout wraps
 * everything in <RequireRole roles={["ADMIN"]}>, and the socket additionally
 * refuses to connect unless this session's role is ADMIN. There is no public
 * results page in this system and there will not be one: the university
 * announces official results outside the app (Project-Context §9).
 *
 * AGGREGATE ONLY. Everything on this screen is a count. The REST endpoints and
 * the socket payload are all built from backend/src/utils/tally.js, which reads
 * Vote and VoteReceipt independently and never joins either to a User. Nothing
 * here requests, receives, stores or renders a ballot, a voter, or a link
 * between them.
 *
 * REST SEEDS, SOCKET UPDATES, REST RE-SEEDS:
 *
 *   1. GET /results and GET /turnout paint the page immediately — a dashboard
 *      that is blank until the next ballot happens to arrive is not a dashboard.
 *   2. `join-election` triggers a one-socket snapshot, then throttled
 *      `results-update` ticks (≤1 per election per 5s, trailing edge) take over.
 *   3. Any RECONNECT re-invalidates the REST queries. The throttle does not
 *      replay missed ticks, so a socket that was down leaves a tally that is
 *      wrong by an unknown amount — and a wrong tally displayed under a "Live"
 *      badge is the one failure this screen must not have.
 *
 * The live numbers and the refreshed numbers cannot disagree by construction:
 * both come from the same computeTallies/computeTurnout pair on the server.
 */

export default function ElectionResultsPage({ electionId }) {
  const queryClient = useQueryClient();
  const { isAuthenticated, role } = useAuth();

  const [integrityReport, setIntegrityReport] = useState(null);

  const resultsQuery = useQuery({
    queryKey: queryKeys.electionResults(electionId),
    queryFn: () => fetchResults(electionId),
  });

  const turnoutQuery = useQuery({
    queryKey: queryKeys.electionTurnout(electionId),
    queryFn: () => fetchTurnout(electionId),
  });

  /** Re-read the authoritative aggregates. Called on every socket reconnect. */
  const resync = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.results });
  }, [queryClient]);

  /**
   * A status transition arrived on the wire. The election's own record changed
   * too (OPEN -> CLOSED is a different screen), so both caches are dropped.
   * /close additionally pushes a final unthrottled results-update, which lands
   * through the normal `live` path and carries the true final tally.
   */
  const handleStatusChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.results });
    queryClient.invalidateQueries({ queryKey: queryKeys.elections });
  }, [queryClient]);

  // The socket is opened ONLY for a signed-in ADMIN. Students and auditors are
  // refused at the handshake server-side, but their browsers should not be
  // opening a connection that is going to be slammed shut either.
  const { connection, refusal, live, liveStatus } = useElectionSocket({
    electionId,
    enabled: isAuthenticated && role === "ADMIN",
    onResync: resync,
    onStatusChange: handleStatusChange,
  });

  const integrityMutation = useMutation({
    mutationFn: () => checkIntegrity(electionId),
    onSuccess: (report) => setIntegrityReport(report),
    onError: () => setIntegrityReport(null),
  });

  const restResults = resultsQuery.data;
  const restTurnout = turnoutQuery.data;

  /**
   * Live counts win; REST supplies what the wire shape deliberately omits.
   *
   * `results-update` carries the LEAN row — { candidateId, name, voteCount } —
   * because a dashboard tick needs a count, not a manifesto. So the photo comes
   * from the REST row it is matched to by candidateId. Server ordering
   * (voteCount desc, then name) is preserved either way.
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

  // Same precedence for turnout. `hourly` and `note` exist only on the REST
  // response (the socket's computeTurnout runs without includeHourly), so they
  // are always taken from there.
  const turnout = {
    voted: live?.turnout?.voted ?? restTurnout?.voted ?? 0,
    eligible: live?.turnout?.eligible ?? restTurnout?.eligible ?? null,
    turnoutPct: live?.turnout?.turnoutPct ?? restTurnout?.turnoutPct ?? null,
    note: restTurnout?.note ?? null,
  };

  const isPending = resultsQuery.isPending || turnoutQuery.isPending;
  const isError = resultsQuery.isError || turnoutQuery.isError;
  const queryError = resultsQuery.error ?? turnoutQuery.error;

  if (isPending) {
    return (
      <>
        <PageHeader title="Results" backHref="/adminstration/results" backLabel="Results" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <LoadingState label="Loading results" />
        </div>
      </>
    );
  }

  if (isError) {
    const notFound = apiErrorCode(queryError) === "ELECTION_NOT_FOUND";

    return (
      <>
        <PageHeader title="Results" backHref="/adminstration/results" backLabel="Results" />

        <div className="px-4 py-6 min-[920px]:px-7">
          {notFound ? (
            <div className="border-line bg-surface mx-auto max-w-[520px] rounded-lg border p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <CircleAlert size={26} aria-hidden="true" />
              </div>
              <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
                That election no longer exists
              </h2>
              <p className="text-muted m-0 mb-5 text-[13.5px]">
                It may have been deleted, or the link is out of date.
              </p>
              <Link
                href="/adminstration/results"
                className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Back to results
              </Link>
            </div>
          ) : (
            <ErrorState
              error={queryError}
              onRetry={() => {
                resultsQuery.refetch();
                turnoutQuery.refetch();
              }}
              isRetrying={resultsQuery.isFetching || turnoutQuery.isFetching}
            />
          )}
        </div>
      </>
    );
  }

  const election = restResults.election;
  // The socket's view of status is fresher than the REST snapshot: the ack
  // carries it at join, and `election-status` updates it the instant a
  // transition happens.
  const status = liveStatus ?? election.status;
  const isOpen = status === ELECTION_STATUS.OPEN;
  const isFetching = resultsQuery.isFetching || turnoutQuery.isFetching;

  return (
    <>
      <PageHeader
        title={election.title}
        subtitle={`Results · ${electionStatusAdminLabel(status)}`}
        backHref="/adminstration/results"
        backLabel="Results"
      >
        <ElectionStatusBadge status={status} size="lg" />
        {isOpen && <LiveIndicator connection={connection} refusal={refusal} />}
        {isFetching && (
          <LoaderCircle size={15} className="animate-spin text-indigo-500" aria-hidden="true" />
        )}
      </PageHeader>

      <div className="grid gap-5 px-4 py-6 min-[920px]:px-7 min-[1060px]:grid-cols-[1fr_340px] min-[1060px]:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="border-line bg-surface overflow-hidden rounded-lg border shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
                  <BarChart3 size={18} aria-hidden="true" />
                </span>
                <h2 className="text-ink m-0 text-[15px] font-bold">
                  Tally ({totalVotes.toLocaleString()} {totalVotes === 1 ? "ballot" : "ballots"})
                </h2>
              </div>

              {!isOpen && (
                <span className="text-muted rounded-pill inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold">
                  <Lock size={12} aria-hidden="true" />
                  {status === ELECTION_STATUS.PUBLISHED ? "Final" : "Not live"}
                </span>
              )}
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
              </>
            )}
          </section>

          <p className="text-muted m-0 flex items-start gap-2 px-1 text-[11.5px] leading-[1.55]">
            <Lock size={13} className="mt-px shrink-0" aria-hidden="true" />
            Aggregate counts only. Ballots are stored with no link to the student who cast them, so
            no view in this system — including this one — can show how any individual voted. Results
            are not shown to students; the university announces the official outcome.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <TurnoutCard
            voted={turnout.voted}
            eligible={turnout.eligible}
            turnoutPct={turnout.turnoutPct}
            note={turnout.note}
            isLive={isOpen && Boolean(live)}
          />

          <IntegrityCard
            report={integrityReport}
            error={integrityMutation.error}
            isPending={integrityMutation.isPending}
            hasRun={integrityMutation.isSuccess || integrityMutation.isError}
            onVerify={() => integrityMutation.mutate()}
          />
        </div>
      </div>
    </>
  );
}
