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

/**
 * The audit log viewer — the AUDITOR role's one screen, shared with ADMIN.
 *
 * Envelope (backend/src/controllers/audit-controllers.js, confirmed against the
 * running API): { data, page, limit, total }, ordered createdAt DESC, id DESC.
 * `total` is the count AFTER filters, so it doubles as the result count.
 *
 * READ-ONLY, ABSOLUTELY. There is no mutation on this screen and no endpoint to
 * make one against: B9 exposes a single GET. Even the act of reading leaves no
 * trace — reads of the log are deliberately not audited, so an auditor can
 * examine the trail without polluting it.
 *
 * WHAT THIS SCREEN CAN NEVER SHOW. The endpoint never joins to Vote, so no row
 * it returns can carry a candidate, a ballot id or a chain hash. This client
 * adds two further guarantees on top of that: it reads only the fields it knows
 * by name (nothing is spread blindly into the DOM), and every metadata blob goes
 * through the secrecy screen in utils/audit-metadata.js before a single value is
 * painted. A VOTE_CAST row shows that a named voter participated in a named
 * election during a named HOUR, and stops there.
 */

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

  // Only the two free-text fields debounce — a uuid is 36 keystrokes and every
  // one of them would otherwise be a request. The selects and date pickers
  // change once per interaction and apply immediately.
  const debouncedActorUserId = useDebouncedValue(filters.actorUserId);
  const debouncedEntityId = useDebouncedValue(filters.entityId);

  /**
   * Every filter change resets to page 1: page 4 of the old result set is
   * usually past the end of the new one, which would show an empty table for a
   * filter that actually matched. Done in the setter rather than an effect, so
   * there is no render pairing a stale page with a new filter.
   */
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
    // Belt to audit-api.js's braces: an id with no type is never even assembled
    // into the params object, let alone sent.
    entityId: filters.entityType ? debouncedEntityId.trim() : "",
    // `to` is widened to the END of the chosen local day. Sent bare, "2026-08-05"
    // parses as that day's midnight and `lte` would exclude the entire day the
    // auditor just picked.
    from: startOfLocalDayIso(filters.from),
    to: endOfLocalDayIso(filters.to),
  };

  const auditQuery = useQuery({
    queryKey: queryKeys.auditList(params),
    queryFn: () => fetchAuditLog(params),
    placeholderData: keepPreviousData,
    // The app-wide policy retries anything that is not a 401/403/404, which is
    // right for a flaky read and wrong here: a 400 from this endpoint means the
    // FILTERS are invalid, so the retry sends a byte-identical query and gets a
    // byte-identical refusal, three times, before the auditor is told anything.
    retry: (failureCount, error) => apiErrorStatus(error) !== 400 && failureCount < 2,
  });

  /**
   * `placeholderData` keeps the previous page on screen while the next one
   * loads — and, because React Query reports success for as long as `data` is
   * defined, it ALSO hides the failure when the next one is rejected. A bad
   * filter would silently leave the old rows sitting there looking authoritative.
   *
   * So the outcome is read from `failureReason` as well as `error`: the former
   * is what a failed fetch sets while placeholder data is being displayed, the
   * latter is what it sets on a first load with nothing to fall back on.
   */
  const failure = auditQuery.error ?? auditQuery.failureReason ?? null;

  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const hasFilters = Object.values(filters).some(Boolean);
  const rejection = filterRejection(failure);

  // True while the next page or filter is in flight and the previous result is
  // still painted — the cue that the table is one step behind the controls.
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
          className="border-line bg-surface inline-flex cursor-pointer items-center gap-2 rounded-[10px] border px-[15px] py-2.5 text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
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
          // Clearing the type clears the id with it. Leaving an orphaned id in a
          // disabled box would look like an applied filter that is not applied.
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
          <div className="border-line bg-surface rounded-lg border shadow-sm">
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
            <div className="border-line bg-surface hidden overflow-hidden rounded-lg border shadow-sm min-[1000px]:block">
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

            <div className="border-line bg-surface mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-xs">
              <span className="text-muted flex items-center gap-2 text-[12.5px]">
                {isStale && (
                  <LoaderCircle size={14} className="animate-spin text-indigo-500" aria-hidden="true" />
                )}
                {total} {total === 1 ? "entry" : "entries"} · page {page} of {pageCount}
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

/**
 * A 400 from this endpoint is always the FILTERS being wrong, never the data —
 * so it is answered next to the controls with the server's own wording, rather
 * than by the generic "something went wrong" panel, which would invite a retry
 * of a request that is going to fail identically every time.
 *
 * The two rules this screen already prevents (an unpaired entityId, an
 * over-cap limit) can still be reached the moment those rules change
 * server-side, and `from` later than `to` is reachable right now — the date
 * inputs constrain each other with min/max, but a typed date bypasses that.
 * Reading the rejection from the response rather than re-deriving it locally is
 * what keeps this screen honest when the two drift.
 */
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
      className="border-error-500/25 bg-error-50 rounded-lg border p-5 text-center shadow-xs"
    >
      <div className="bg-error-50 text-error-600 mx-auto mb-3 grid size-[52px] place-items-center rounded-[16px] border border-error-500/20">
        <SlidersHorizontal size={24} aria-hidden="true" />
      </div>

      <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
        These filters can&apos;t be used together
      </h2>

      <p className="text-muted mx-auto mb-3 max-w-[420px] text-[13.5px] leading-[1.5]">
        {rejection.message}
      </p>

      {rejection.details.length > 0 && (
        <ul className="border-line bg-surface mx-auto mb-4 grid max-w-[420px] list-none gap-1.5 rounded-md border p-3 text-left">
          {rejection.details.map((detail, index) => (
            <li key={`${detail.path}-${index}`} className="text-[12.5px]">
              {detail.path && (
                <span className="text-error-700 font-mono font-semibold">{detail.path}: </span>
              )}
              <span className="text-muted">{detail.message}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onClear}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-[22px] py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
      >
        Clear filters
      </button>
    </div>
  );
}

/**
 * Two facts an auditor needs in order to trust what they are reading, stated on
 * the screen rather than buried in the thesis: why ballot times look blunt, and
 * why their own visit is not in the list they are looking at.
 */
function SecrecyFootnote() {
  return (
    <p className="text-muted mt-5 flex items-start gap-2 text-[11.5px] leading-[1.6]">
      <ShieldCheck size={14} className="mt-px flex-none text-slate-400" aria-hidden="true" />
      <span>
        Ballot entries record <strong className="font-semibold">participation only</strong> — who
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
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
