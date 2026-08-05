"use client";

import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle, Lock, Search, UserRoundPlus, X } from "lucide-react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFaculties } from "@/hooks/use-faculties";
import { ELECTION_TYPE } from "@/utils/election-labels";
import { queryKeys } from "@/utils/query-keys";
import { fetchStudents } from "@/utils/students-api";

import StudentAvatar from "../students/student-avatar";

/**
 * Pick the student to put on the ballot — GET /students, reused from F3.
 *
 * THE SCOPING RULE, and what it is for:
 *
 * A FACULTY election may only be contested by students of that faculty, and the
 * server enforces it (400 FACULTY_MISMATCH). This picker pins `facultyId` to the
 * election's own faculty so an admin is only ever shown students who can
 * legitimately stand — the faculty filter is not offered, because loosening it
 * would only produce choices the server is going to reject.
 *
 * That is GUIDANCE, not enforcement. It narrows the list; it does not decide
 * anything. A student whose faculty was changed in another tab can still be in
 * this list and still be refused on submit, and the refusal is shown against
 * this field — see the `error` prop and the FACULTY_MISMATCH mapping in
 * utils/api-field-errors.js.
 *
 * A UNIVERSITY (Gudoomiye) race is open to every active student, so there the
 * faculty filter IS offered — as a way to find someone in a long list, not as a
 * rule.
 *
 * `active: "true"` is pinned in both cases: the server refuses a deactivated
 * student with 400 STUDENT_INACTIVE, so showing them would be offering a choice
 * that cannot work.
 */

const PAGE_SIZE = 20;

export default function CandidatePicker({
  election,
  attachedUserIds,
  selected,
  onSelect,
  error,
  disabled = false,
}) {
  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("");

  const isUniversity = election.type === ELECTION_TYPE.UNIVERSITY;
  const debouncedSearch = useDebouncedValue(search);

  // A faculty race is pinned to its own faculty; a university race lets the
  // admin narrow the list themselves.
  const facultyId = isUniversity ? facultyFilter : (election.facultyId ?? "");

  const params = {
    page: 1,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    facultyId,
    active: "true",
  };

  const studentsQuery = useQuery({
    queryKey: queryKeys.studentList(params),
    queryFn: () => fetchStudents(params),
    placeholderData: keepPreviousData,
    enabled: !disabled,
  });

  const students = studentsQuery.data?.students ?? [];

  // Already on the ballot -> not a choice. Counted rather than silently dropped:
  // an admin who searched for a name and got nothing back deserves to know the
  // reason is "they are already a candidate", not "no such student".
  const selectable = students.filter((student) => !attachedUserIds.has(student.id));
  const excludedCount = students.length - selectable.length;

  if (selected) {
    return (
      <div>
        <div
          className={`flex items-center gap-3 rounded-[10px] border-[1.5px] p-3 ${
            error ? "border-error-500 bg-error-50/40" : "border-indigo-200 bg-indigo-50/60"
          }`}
        >
          <StudentAvatar name={selected.name} size={38} />

          <div className="min-w-0 flex-1">
            <p className="text-ink m-0 truncate text-[13.5px] font-semibold">{selected.name}</p>
            <p className="text-muted font-display m-0 truncate text-xs">
              {selected.studentId}
              {selected.faculty?.code ? ` · ${selected.faculty.code}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={disabled}
            aria-label="Choose a different student"
            className="grid size-8 flex-none cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {error && <PickerError message={error} />}
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <span
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        >
          <Search size={16} />
        </span>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
          placeholder="Search by name, ID or email…"
          aria-label="Search students to add as a candidate"
          aria-invalid={Boolean(error)}
          className={`text-ink w-full rounded-[10px] border-[1.5px] bg-white py-2.5 pr-3 pl-9 text-[13.5px] outline-none transition disabled:opacity-60 ${
            error
              ? "border-error-500 focus:ring-error-500/15 focus:ring-[3px]"
              : "border-slate-200 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100"
          }`}
        />
      </div>

      {isUniversity ? (
        <UniversityFacultyFilter value={facultyFilter} onChange={setFacultyFilter} disabled={disabled} />
      ) : (
        <p className="text-muted mt-2 flex items-start gap-1.5 text-[11.5px] leading-[1.5]">
          <Lock size={13} className="mt-px shrink-0 text-indigo-500" aria-hidden="true" />
          Showing active students of {election.faculty?.name ?? "this faculty"} only — a faculty
          seat can only be contested by that faculty&apos;s students.
        </p>
      )}

      <div className="mt-2.5 max-h-[280px] overflow-y-auto rounded-[10px] border border-slate-200 bg-white">
        {studentsQuery.isPending ? (
          <p className="text-muted m-0 flex items-center justify-center gap-2 px-3 py-6 text-[12.5px]">
            <LoaderCircle size={15} className="animate-spin text-indigo-500" aria-hidden="true" />
            Loading students…
          </p>
        ) : studentsQuery.isError ? (
          <p role="alert" className="text-error-700 m-0 px-3 py-5 text-center text-[12.5px]">
            The student list could not be loaded.{" "}
            <button
              type="button"
              onClick={() => studentsQuery.refetch()}
              className="cursor-pointer font-semibold underline"
            >
              Try again
            </button>
          </p>
        ) : selectable.length === 0 ? (
          <p className="text-muted m-0 px-3 py-6 text-center text-[12.5px] leading-[1.55]">
            {excludedCount > 0
              ? `Every student matching this search is already on the ballot (${excludedCount}).`
              : search
                ? "No active student matches that search."
                : "No eligible students found."}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {selectable.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  onClick={() => onSelect(student)}
                  disabled={disabled}
                  className="flex w-full cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <StudentAvatar name={student.name} size={32} />

                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[13px] font-semibold">
                      {student.name}
                    </span>
                    <span className="text-muted font-display block truncate text-[11.5px]">
                      {student.studentId}
                      {isUniversity && student.faculty?.code ? ` · ${student.faculty.code}` : ""}
                    </span>
                  </span>

                  <UserRoundPlus size={15} className="flex-none text-slate-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {excludedCount > 0 && selectable.length > 0 && (
        <p className="text-muted mt-1.5 flex items-start gap-1.5 text-[11.5px]">
          <Check size={13} className="mt-px shrink-0 text-emerald-500" aria-hidden="true" />
          {excludedCount} {excludedCount === 1 ? "student is" : "students are"} already on the
          ballot and hidden from this list.
        </p>
      )}

      {error && <PickerError message={error} />}
    </div>
  );
}

function UniversityFacultyFilter({ value, onChange, disabled }) {
  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];

  return (
    <div className="mt-2">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Narrow the student list by faculty"
        className="text-ink w-full cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2 text-[12.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100 disabled:opacity-60"
      >
        <option value="">Every faculty — all students are eligible</option>
        {faculties.map((faculty) => (
          <option key={faculty.id} value={faculty.id}>
            {faculty.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A server refusal about the chosen student, shown under the picker that chose
 * them. The message is the SERVER's own — it names the faculty the student
 * actually belongs to, which is the one thing the client could not have known.
 */
function PickerError({ message }) {
  return (
    <p role="alert" className="text-error-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium">
      <X size={14} className="mt-px shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
