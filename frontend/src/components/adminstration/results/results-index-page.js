"use client";

import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, ChartColumn, ChevronRight, GraduationCap, Lock } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { ELECTION_STATUS, ELECTION_TYPE, electionScopeText } from "@/utils/election-labels";
import { fetchElections } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ElectionStatusBadge from "../elections/election-status-badge";
import ElectionWindow from "../elections/election-window";

/**
 * Pick an election to see its results.
 *
 * NO TALLIES ON THIS SCREEN, deliberately. A list of every election with its
 * current standing beside it is a results leak waiting to be screenshotted, and
 * it would also mean firing an aggregate query per row on every page load. The
 * numbers live one click away, on a screen whose access is audited: every
 * GET /results writes a RESULTS_VIEWED entry naming the admin who looked and
 * the total they saw. That record only means something if looking is a
 * deliberate act.
 *
 * Status IS shown — it says whether a result is live, final or not yet started,
 * which is navigation, not a result.
 */

const PAGE_SIZE = 100;

const STATUS_OPTIONS = [
  { value: "", label: "All elections" },
  { value: ELECTION_STATUS.OPEN, label: "Open — live now" },
  { value: ELECTION_STATUS.CLOSED, label: "Closed" },
  { value: ELECTION_STATUS.PUBLISHED, label: "Final" },
  { value: ELECTION_STATUS.SCHEDULED, label: "Scheduled" },
  { value: ELECTION_STATUS.DRAFT, label: "Drafts" },
];

export default function ResultsIndexPage() {
  const [status, setStatus] = useState("");

  const params = { page: 1, limit: PAGE_SIZE, status };

  const electionsQuery = useQuery({
    queryKey: queryKeys.electionList(params),
    queryFn: () => fetchElections(params),
    placeholderData: keepPreviousData,
  });

  const elections = electionsQuery.data?.elections ?? [];

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Aggregate tallies, turnout and ballot integrity. Admin-only — never shown to students."
      >
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter elections by status"
          className="text-ink cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
        ) : elections.length === 0 ? (
          <div className="border-line bg-surface rounded-lg border shadow-sm">
            <EmptyState title={status ? "No elections with that status." : "No elections yet."}>
              {status
                ? "Try a different status."
                : "Results appear once an election exists and has been opened."}
            </EmptyState>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 min-[760px]:grid-cols-2 min-[1240px]:grid-cols-3">
            {elections.map((election) => (
              <li key={election.id}>
                <ElectionCard election={election} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ElectionCard({ election }) {
  const Icon = election.type === ELECTION_TYPE.UNIVERSITY ? GraduationCap : Building2;
  const neverOpened =
    election.status === ELECTION_STATUS.DRAFT || election.status === ELECTION_STATUS.SCHEDULED;

  return (
    <Link
      href={`/adminstration/results/${election.id}`}
      className="border-line bg-surface flex h-full flex-col rounded-lg border p-4 shadow-xs transition hover:border-indigo-200 hover:bg-indigo-50/40"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
          <Icon size={19} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 truncate text-[13.5px] font-semibold">{election.title}</p>
          <p className="text-muted m-0 mt-0.5 truncate text-xs">{electionScopeText(election)}</p>
        </div>

        <ChevronRight size={18} className="mt-1 flex-none text-slate-400" aria-hidden="true" />
      </div>

      <p className="text-muted m-0 mt-2.5 overflow-x-auto text-[11.5px]">
        <ElectionWindow startAt={election.startAt} endAt={election.endAt} />
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ElectionStatusBadge status={election.status} />

        {neverOpened ? (
          <span className="text-muted rounded-pill inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold">
            <Lock size={12} aria-hidden="true" />
            No votes yet
          </span>
        ) : (
          <span className="rounded-pill inline-flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 text-[11.5px] font-semibold text-indigo-700">
            <ChartColumn size={12} aria-hidden="true" />
            View results
          </span>
        )}
      </div>
    </Link>
  );
}
