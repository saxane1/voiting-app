"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { BarChart3, CircleAlert, LoaderCircle, Lock } from "lucide-react";
import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { useElectionResults } from "@/hooks/use-election-results";
import { apiErrorCode } from "@/utils/api-error";
import { ELECTION_STATUS, electionStatusAdminLabel } from "@/utils/election-labels";
import { checkIntegrity } from "@/utils/results-api";

import PageHeader from "../page-header";
import ElectionStatusBadge from "../elections/election-status-badge";
import IntegrityCard from "./integrity-card";
import LiveIndicator from "./live-indicator";
import ResultsStaleNotice from "./results-stale-notice";
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
 * The REST-seed / socket-update / REST-re-seed-on-reconnect cycle, and the
 * live-versus-stale distinction that goes with it, live in
 * hooks/use-election-results.js — shared with the results switcher so the two
 * screens cannot report different numbers for the same election. This file is
 * the DETAIL view on top of it: the full turnout card, and the ballot-chain
 * integrity check, which exists nowhere else.
 */

export default function ElectionResultsPage({ electionId }) {
  const [integrityReport, setIntegrityReport] = useState(null);

  const {
    election,
    status,
    tallies,
    totalVotes,
    turnout,
    connection,
    refusal,
    isLive,
    isPending,
    isFetching,
    isError,
    isStale,
    error,
    refetch,
  } = useElectionResults(electionId);

  /**
   * Verifying the hash chain is a MUTATION even though the endpoint is a GET.
   * It is an action an admin takes, it writes an INTEGRITY_CHECKED audit row
   * every time, and it must not be re-run silently by a window refocus or a
   * cache invalidation.
   */
  const integrityMutation = useMutation({
    mutationFn: () => checkIntegrity(electionId),
    onSuccess: (report) => setIntegrityReport(report),
    onError: () => setIntegrityReport(null),
  });

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
    const notFound = apiErrorCode(error) === "ELECTION_NOT_FOUND";

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
            <ErrorState error={error} onRetry={refetch} isRetrying={isFetching} />
          )}
        </div>
      </>
    );
  }

  const isOpen = status === ELECTION_STATUS.OPEN;
  // A failed refresh strips every live affordance before anything else: numbers
  // that stopped updating must never sit under a "Live" badge.
  const showLive = isOpen && !isStale;

  return (
    <>
      <PageHeader
        title={election.title}
        subtitle={`Results · ${electionStatusAdminLabel(status)}`}
        backHref="/adminstration/results"
        backLabel="Results"
      >
        <ElectionStatusBadge status={status} size="lg" />
        {showLive && <LiveIndicator connection={connection} refusal={refusal} />}
        {isFetching && (
          <LoaderCircle size={15} className="animate-spin text-indigo-500" aria-hidden="true" />
        )}
      </PageHeader>

      <div className="grid gap-5 px-4 py-6 min-[920px]:px-7 min-[1060px]:grid-cols-[1fr_340px] min-[1060px]:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {isStale && (
            <ResultsStaleNotice error={error} onRetry={refetch} isRetrying={isFetching} />
          )}

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

              {!showLive && (
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
            isLive={showLive && isLive}
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
