"use client";

import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { queryKeys } from "@/utils/query-keys";
import { fetchStudents } from "@/utils/students-api";

import PageHeader from "../page-header";
import StudentCards from "./student-cards";
import StudentFilters from "./student-filters";
import StudentTable from "./student-table";

/**
 * The voter roll: GET /students, paginated, searched and filtered server-side.
 *
 * Envelope (verified against the running API): { data, page, limit, total }.
 * Total is the count AFTER filters, so it doubles as the result count.
 *
 * Paging keeps the previous page on screen while the next one loads
 * (`keepPreviousData`), instead of blanking the table on every click — on a
 * weak connection a flashing empty table reads as "the data is gone".
 */

const PAGE_SIZE = 25;

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);

  // Any filter change puts us back on page 1: page 3 of the old result set is
  // usually past the end of the new one, which would show an empty table for a
  // search that actually matched. Done in the handlers rather than an effect
  // watching the filters, so there is no render where a stale page number is
  // paired with the new filter.
  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const params = { page, limit: PAGE_SIZE, search: debouncedSearch, facultyId, active };

  const studentsQuery = useQuery({
    queryKey: queryKeys.studentList(params),
    queryFn: () => fetchStudents(params),
    placeholderData: keepPreviousData,
  });

  const students = studentsQuery.data?.students ?? [];
  const total = studentsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch || facultyId || active !== "all");

  // True while the NEXT page/filter is in flight and the previous one is still
  // painted — the cue that the table is one step behind the controls.
  const isStale = studentsQuery.isPlaceholderData && studentsQuery.isFetching;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={
          studentsQuery.isSuccess
            ? hasFilters
              ? `${total} matching ${total === 1 ? "student" : "students"}`
              : `${total} registered · manage the voter roll`
            : "Manage the voter roll"
        }
      >
        <Link
          href="/adminstration/students/import"
          className="border-line bg-surface inline-flex items-center gap-2 rounded-[10px] border px-[15px] py-2.5 text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Upload size={16} aria-hidden="true" />
          Bulk upload
        </Link>

        <Link
          href="/adminstration/students/new"
          className="bg-primary-gradient inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition hover:brightness-105"
        >
          <Plus size={17} aria-hidden="true" />
          Add student
        </Link>
      </PageHeader>

      <div className="px-4 py-5 min-[920px]:px-7">
        <StudentFilters
          search={search}
          onSearchChange={changeFilter(setSearch)}
          facultyId={facultyId}
          onFacultyChange={changeFilter(setFacultyId)}
          active={active}
          onActiveChange={changeFilter(setActive)}
        />

        {studentsQuery.isPending ? (
          <LoadingState label="Loading students" />
        ) : studentsQuery.isError ? (
          <ErrorState
            error={studentsQuery.error}
            onRetry={() => studentsQuery.refetch()}
            isRetrying={studentsQuery.isFetching}
          />
        ) : students.length === 0 ? (
          <div className="border-line bg-surface rounded-lg border shadow-sm">
            <EmptyState title={hasFilters ? "No students match those filters." : "No students yet."}>
              {hasFilters
                ? "Try a different search term, faculty or status."
                : "Add students one at a time, or upload the roster as an Excel file."}
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
              <StudentTable students={students} />
            </div>

            <div className="p-3 min-[900px]:hidden">
              <StudentCards students={students} />
            </div>

            <div className="border-line flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3">
              <span className="text-muted flex items-center gap-2 text-[12.5px]">
                {isStale && (
                  <LoaderCircle size={14} className="animate-spin text-indigo-500" aria-hidden="true" />
                )}
                {total} {total === 1 ? "student" : "students"} · page {page} of {pageCount}
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
