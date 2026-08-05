"use client";

import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { ELECTION_TYPE } from "@/utils/election-labels";
import { fetchElections } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ElectionCards from "./election-cards";
import ElectionFilters from "./election-filters";
import ElectionTable from "./election-table";

/**
 * Every election and its lifecycle state — GET /elections, filtered and
 * paginated server-side.
 *
 * Envelope (verified against the running API): { data, page, limit, total },
 * each row carrying its nested faculty, so scope needs no lookup.
 *
 * The row data also includes `eligibleCount` and `candidateCount`. Neither is
 * rendered here: eligibleCount is the turnout denominator (F7, admin-only), and
 * candidate counts are shown where they are actionable — on the detail screen
 * and inside the open-voting confirmation, which is the one place the "at least
 * 2 candidates" rule bites.
 */

const PAGE_SIZE = 25;

export default function ElectionsPage() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [page, setPage] = useState(1);

  const params = { page, limit: PAGE_SIZE, status, type, facultyId };

  const electionsQuery = useQuery({
    queryKey: queryKeys.electionList(params),
    queryFn: () => fetchElections(params),
    placeholderData: keepPreviousData,
  });

  const elections = electionsQuery.data?.elections ?? [];
  const total = electionsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(status || type || facultyId);

  const isStale = electionsQuery.isPlaceholderData && electionsQuery.isFetching;

  // Any filter change returns to page 1 — page 3 of the previous result set is
  // usually past the end of the new one.
  function changeStatus(value) {
    setStatus(value);
    setPage(1);
  }

  function changeType(value) {
    setType(value);
    setPage(1);

    // A university-wide election cannot have a faculty, so keeping a faculty
    // chip selected here would build a filter pair that matches nothing.
    if (value === ELECTION_TYPE.UNIVERSITY) setFacultyId("");
  }

  function changeFaculty(value) {
    setFacultyId(value);
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Elections"
        subtitle={
          electionsQuery.isSuccess
            ? hasFilters
              ? `${total} matching ${total === 1 ? "election" : "elections"}`
              : `${total} ${total === 1 ? "election" : "elections"} · manage each one's lifecycle`
            : "Manage every election and its lifecycle"
        }
      >
        <Link
          href="/adminstration/elections/new"
          className="bg-primary-gradient inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition hover:brightness-105"
        >
          <Plus size={17} aria-hidden="true" />
          New election
        </Link>
      </PageHeader>

      <div className="px-4 py-5 min-[920px]:px-7">
        <ElectionFilters
          status={status}
          onStatusChange={changeStatus}
          type={type}
          onTypeChange={changeType}
          facultyId={facultyId}
          onFacultyChange={changeFaculty}
        />

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
            <EmptyState
              title={hasFilters ? "No elections match those filters." : "No elections yet."}
            >
              {hasFilters
                ? "Try a different status, type or faculty."
                : "Create the faculty leader elections and the university-wide Gudoomiye election here. New elections start as drafts — nothing goes live until you open it."}
            </EmptyState>
          </div>
        ) : (
          <div
            className={`border-line bg-surface overflow-hidden rounded-lg border shadow-sm transition-opacity ${
              isStale ? "opacity-60" : "opacity-100"
            }`}
            aria-busy={isStale}
          >
            <div className="hidden overflow-x-auto min-[900px]:block">
              <ElectionTable elections={elections} />
            </div>

            <div className="p-3 min-[900px]:hidden">
              <ElectionCards elections={elections} />
            </div>

            <div className="border-line flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3">
              <span className="text-muted flex items-center gap-2 text-[12.5px]">
                {isStale && (
                  <LoaderCircle
                    size={14}
                    className="animate-spin text-indigo-500"
                    aria-hidden="true"
                  />
                )}
                {total} {total === 1 ? "election" : "elections"} · page {page} of {pageCount}
              </span>

              <div className="flex gap-1.5">
                <PageButton
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  label="Previous page"
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  Prev
                </PageButton>

                <PageButton
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page >= pageCount}
                  label="Next page"
                >
                  Next
                  <ChevronRight size={15} aria-hidden="true" />
                </PageButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PageButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
