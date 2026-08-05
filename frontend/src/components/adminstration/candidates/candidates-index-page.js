"use client";

import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, GraduationCap, Lock, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { canManageCandidates, openReadiness } from "@/utils/candidate-rules";
import { ELECTION_STATUS, ELECTION_TYPE, electionScopeText } from "@/utils/election-labels";
import { fetchElections } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ElectionStatusBadge from "../elections/election-status-badge";

/**
 * The Candidates nav item — "which ballot?".
 *
 * A candidate does not exist on its own: it is a student ATTACHED to a specific
 * election, and whether they may stand at all depends on that election's type,
 * faculty and status. So there is no flat list of candidates to manage; this
 * screen picks the election and hands off to its roster.
 *
 * Each row shows the count and the ≥2 readiness signal, so an admin can see at a
 * glance which drafts still need work before F5 will let them open.
 */

const PAGE_SIZE = 100;

const STATUS_OPTIONS = [
  { value: "", label: "All elections" },
  { value: ELECTION_STATUS.DRAFT, label: "Drafts" },
  { value: ELECTION_STATUS.SCHEDULED, label: "Scheduled" },
  { value: ELECTION_STATUS.OPEN, label: "Open" },
  { value: ELECTION_STATUS.CLOSED, label: "Closed" },
  { value: ELECTION_STATUS.PUBLISHED, label: "Final" },
];

export default function CandidatesIndexPage() {
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
        title="Candidates"
        subtitle="Who appears on each ballot. Choose an election to manage its roster."
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
                : "Candidates are attached to an election, so create an election first."}
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
  const count = election.candidateCount ?? 0;
  const { ready, remaining } = openReadiness(count);
  const canManage = canManageCandidates(election.status);

  return (
    <Link
      href={`/adminstration/elections/${election.id}/candidates`}
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

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <ElectionStatusBadge status={election.status} />

        <span className="rounded-pill inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
          <UsersRound size={12} aria-hidden="true" />
          {count} {count === 1 ? "candidate" : "candidates"}
        </span>

        {canManage ? (
          ready ? (
            <span className="rounded-pill bg-success-50 text-success-700 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold">
              Ready to open
            </span>
          ) : (
            <span className="rounded-pill bg-warning-50 text-warning-700 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold">
              <TriangleAlert size={12} aria-hidden="true" />
              Needs {remaining} more
            </span>
          )
        ) : (
          <span className="rounded-pill inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-500">
            <Lock size={12} aria-hidden="true" />
            Locked
          </span>
        )}
      </div>
    </Link>
  );
}
