
"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";

import PageHeader from "@/components/adminstration/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/utils/api-error";
import { AUDIT_DEFAULT_LIMIT, fetchAuditLog } from "@/utils/audit-api";
import { endOfLocalDayIso, startOfLocalDayIso } from "@/utils/datetime-local";
import { queryKeys } from "@/utils/query-keys";

import AuditCards from "./audit-cards";
import AuditFilters from "./audit-filters";
import AuditTable from "./audit-table";

const EMPTY_FILTERS = {
  action: "",
  actorUserId: "",
  entityType: "",
  entityId: "",
  from: "",
  to: "",
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(AUDIT_DEFAULT_LIMIT);
  const [page, setPage] = useState(1);

  const debouncedActorUserId = useDebouncedValue(filters.actorUserId);
  const debouncedEntityId = useDebouncedValue(filters.entityId);

  function updateFilters(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const params = {
    page,
    limit,
    action: filters.action,
    actorUserId: debouncedActorUserId.trim(),
    entityType: filters.entityType,
    entityId: filters.entityType ? debouncedEntityId.trim() : "",
    from: startOfLocalDayIso(filters.from),
    to: endOfLocalDayIso(filters.to),
  };

  const auditQuery = useQuery({
    queryKey: queryKeys.auditList(params),
    queryFn: () => fetchAuditLog(params),
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => apiErrorStatus(error) !== 400 && failureCount < 2,
  });

  const failure = auditQuery.error ?? auditQuery.failureReason ?? null;
  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const hasFilters = Object.values(filters).some(Boolean);
  const rejection = filterRejection(failure);
  const isStale = auditQuery.isPlaceholderData && auditQuery.isFetching;

  return (
    <>
      <PageHeader
        sticky={false}
        title="Audit log"
        subtitle={
          auditQuery.isSuccess && !failure
            ? hasFilters
              ? `${total} matching ${total === 1 ? "entry" : "entries"}`
              : `${total} recorded ${total === 1 ? "action" : "actions"} · newest first`
            : "Every recorded action, newest first"
        }
      >
        <button
          type="button"
          onClick={() => auditQuery.refetch()}
          disabled={auditQuery.isFetching}
          className="border-line bg-surface inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={15}
            className={auditQuery.isFetching ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Refresh
        </button>
      </PageHeader>

      <div className="px-4 py-5 min-[720px]:px-6">
        <AuditFilters
          action={filters.action}
          onActionChange={(value) => updateFilters({ action: value })}
          actorUserId={filters.actorUserId}
          onActorUserIdChange={(value) => updateFilters({ actorUserId: value })}
          entityType={filters.entityType}
          onEntityTypeChange={(value) =>
            updateFilters({ entityType: value, entityId: value ? filters.entityId : "" })
          }
          entityId={filters.entityId}
          onEntityIdChange={(value) => updateFilters({ entityId: value })}
          from={filters.from}
          onFromChange={(value) => updateFilters({ from: value })}
          to={filters.to}
          onToChange={(value) => updateFilters({ to: value })}
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          hasFilters={hasFilters}
          onClear={clearFilters}
        />

        {rejection ? (
          <FilterRejected rejection={rejection} onClear={clearFilters} />
        ) : auditQuery.isPending ? (
          <LoadingState label="Loading the audit log" />
        ) : failure ? (
          <ErrorState
            error={failure}
            onRetry={() => auditQuery.refetch()}
            isRetrying={auditQuery.isFetching}
          />
        ) : entries.length === 0 ? (
          <div className="border border-slate-200 bg-white rounded-xl p-6 text-center shadow-xs">
            {hasFilters ? (
              <EmptyState title="No entries match these filters.">
                Nothing was recorded for that combination. Widen the date range, or clear the
                filters to see the whole trail.
              </EmptyState>
            ) : (
              <EmptyState title="The audit log is empty.">
                Nothing has been recorded yet. Entries appear as soon as anyone signs in, a student
                is registered, or an election changes state.
              </EmptyState>
            )}
          </div>
        ) : (
          <div
            className={`transition-opacity ${isStale ? "opacity-60" : "opacity-100"}`}
            aria-busy={isStale}
          >
            <div className="border border-slate-200 bg-white hidden overflow-hidden rounded-xl shadow-xs min-[1000px]:block">
              <div className="overflow-x-auto">
                <AuditTable
                  entries={entries}
                  onFilterByActor={(actorUserId) => updateFilters({ actorUserId })}
                  onFilterByEntity={(entityType, entityId) =>
                    updateFilters({ entityType, entityId })
                  }
                />
              </div>
            </div>

            <div className="min-[1000px]:hidden">
              <AuditCards
                entries={entries}
                onFilterByActor={(actorUserId) => updateFilters({ actorUserId })}
                onFilterByEntity={(entityType, entityId) => updateFilters({ entityType, entityId })}
              />
            </div>

            {/* Pagination Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
              <span className="flex items-center gap-2 text-[12.5px] text-slate-500 font-medium">
                {isStale && (
                  <LoaderCircle size={14} className="animate-spin text-indigo-500" aria-hidden="true" />
                )}
                Showing {entries.length} of {total} {total === 1 ? "entry" : "entries"} · Page {page} of {pageCount}
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

        <SecrecyFootnote />
      </div>
    </>
  );
}

function filterRejection(error) {
  if (!error || apiErrorStatus(error) !== 400) return null;

  const details = error?.response?.data?.error?.details;

  return {
    message: apiErrorMessage(error, "The API rejected these filters."),
    code: apiErrorCode(error),
    details: Array.isArray(details) ? details.filter((detail) => detail?.message) : [],
  };
}

function FilterRejected({ rejection, onClear }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center shadow-xs"
    >
      <div className="bg-red-100 text-red-600 mx-auto mb-3 grid size-12 place-items-center rounded-xl">
        <SlidersHorizontal size={22} aria-hidden="true" />
      </div>

      <h2 className="text-slate-900 m-0 mb-1 text-base font-bold">
        These filters can&apos;t be used together
      </h2>

      <p className="text-slate-600 mx-auto mb-3 max-w-[420px] text-[13px] leading-relaxed">
        {rejection.message}
      </p>

      {rejection.details.length > 0 && (
        <ul className="mx-auto mb-4 grid max-w-[420px] list-none gap-1.5 rounded-lg border border-red-200 bg-white p-3 text-left shadow-2xs">
          {rejection.details.map((detail, index) => (
            <li key={`${detail.path}-${index}`} className="text-[12px]">
              {detail.path && (
                <span className="text-red-700 font-mono font-semibold">{detail.path}: </span>
              )}
              <span className="text-slate-600">{detail.message}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onClear}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
      >
        Clear filters
      </button>
    </div>
  );
}

function SecrecyFootnote() {
  return (
    <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-500">
      <ShieldCheck size={14} className="mt-0.5 flex-none text-slate-400" aria-hidden="true" />
      <span>
        Ballot entries record <strong className="font-semibold text-slate-700">participation only</strong> — who
        voted, in which election, in which hour. The choice itself is stored in a separate table
        with no link back to a voter, and this log is never joined to it. Viewing the log is not
        itself recorded here.
      </span>
    </p>
  );
}

function PageButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}