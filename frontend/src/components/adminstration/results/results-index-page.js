"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { ELECTION_STATUS, electionScopeText } from "@/utils/election-labels";
import { fetchElections } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ResultsElectionPicker from "./results-election-picker";
import ResultsPanel from "./results-panel";

/**
 * Live Results — one election at a time.
 *
 * The switcher replaced a grid of cards that linked away to each election. The
 * reason for the change is that a commission watches ONE race at a time during a
 * voting day, and a wall of cards made them click out and back for every glance.
 * The reason the grid did NOT show tallies is unchanged and still holds: a list
 * of every election with its current standing beside it is a results leak
 * waiting to be screenshotted, and it would fire an aggregate query per row on
 * every page load. So the switcher shows exactly one election's numbers, chosen
 * deliberately, and asks the API for exactly that one.
 *
 * ADMIN-ONLY, inherited. app/adminstration/layout.js wraps everything below it
 * in <RequireRole roles={["ADMIN"]}>, every /elections/:id/results endpoint is
 * requireAuth + requireRole("ADMIN") server-side, and the socket refuses a
 * non-admin at the handshake. There is no public results page in this system and
 * there will not be one — the university announces officially, off-system
 * (Project-Context §9). Nothing on this screen is reachable by a student.
 *
 * THE SELECTION LIVES IN THE URL (?election=<id>) rather than in state, so a
 * refresh, a bookmark or a link pasted into the commission's chat all reopen the
 * same election. It is a `replace`, not a `push`: flicking between two ballots
 * should not build twenty history entries to back out of.
 */

const PAGE_SIZE = 100;
const SELECTION_PARAM = "election";

export default function ResultsIndexPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = { page: 1, limit: PAGE_SIZE };

  const electionsQuery = useQuery({
    queryKey: queryKeys.electionList(params),
    queryFn: () => fetchElections(params),
  });

  const elections = useMemo(
    () => electionsQuery.data?.elections ?? [],
    [electionsQuery.data]
  );

  const requestedId = searchParams.get(SELECTION_PARAM);

  /**
   * The election actually shown.
   *
   * The URL wins when it names an election that exists. It is validated against
   * the list rather than trusted, so a stale bookmark to a deleted election
   * falls back to a sensible default instead of rendering a panel that 404s.
   *
   * Default: the first OPEN election — during a voting day that is the one being
   * watched — otherwise the most recent, the list being ordered createdAt desc
   * by the API.
   */
  const selected = useMemo(() => {
    if (elections.length === 0) return null;

    const requested = elections.find((election) => election.id === requestedId);

    if (requested) return requested;

    return elections.find((election) => election.status === ELECTION_STATUS.OPEN) ?? elections[0];
  }, [elections, requestedId]);

  function selectElection(id) {
    const next = new URLSearchParams(searchParams);

    next.set(SELECTION_PARAM, id);

    // scroll:false — the picker sits at the top and the panel changes beneath
    // it; jumping to the top of a page you are already at the top of is a jolt
    // for nothing.
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Live Results"
        subtitle="Aggregate tallies, turnout and vote share. Commission view only — never shown to students."
      >
        {elections.length > 0 && (
          <ResultsElectionPicker
            elections={elections}
            selectedId={selected?.id ?? null}
            onSelect={selectElection}
          />
        )}
      </PageHeader>

      <div className="px-4 py-6 min-[920px]:px-7">
        {electionsQuery.isPending ? (
          <LoadingState label="Loading elections" />
        ) : electionsQuery.isError ? (
          <ErrorState
            error={electionsQuery.error}
            onRetry={() => electionsQuery.refetch()}
            isRetrying={electionsQuery.isFetching}
          />
        ) : !selected ? (
          <div className="border-line bg-surface rounded-lg border shadow-sm">
            <EmptyState title="No elections yet.">
              Results appear here once an election exists. Create one, add its candidates, then
              open voting.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h2 className="font-display text-ink m-0 text-lg font-bold tracking-[-0.01em]">
                {selected.title}
              </h2>
              <p className="text-muted m-0 mt-0.5 text-[13px]">{electionScopeText(selected)}</p>
            </div>

            {/* Keyed on the election so a switch remounts the panel outright:
                every query, socket room and derived value starts clean, and one
                election's numbers can never be painted under another's name. */}
            <ResultsPanel key={selected.id} electionId={selected.id} election={selected} />
          </>
        )}
      </div>
    </>
  );
}
