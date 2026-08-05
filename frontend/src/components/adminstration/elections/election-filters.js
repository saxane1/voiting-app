"use client";

import { useFaculties } from "@/hooks/use-faculties";
import { ELECTION_STATUS, ELECTION_TYPE } from "@/utils/election-labels";

/**
 * The list's controls, mapped 1:1 onto GET /elections query params:
 *
 *   status    — DRAFT | SCHEDULED | OPEN | CLOSED | PUBLISHED; anything else is
 *               a 400, so the options are fixed rather than free-form.
 *   type      — FACULTY | UNIVERSITY.
 *   facultyId — exact faculty id (not code).
 *
 * The faculty chips disappear for type=UNIVERSITY, because a university-wide
 * election has no faculty by definition — the backend refuses to store one.
 * Switching to UNIVERSITY therefore also clears any faculty already chosen,
 * which the parent does, so the two filters can never contradict each other.
 */

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: ELECTION_STATUS.DRAFT, label: "Draft" },
  { value: ELECTION_STATUS.SCHEDULED, label: "Scheduled" },
  { value: ELECTION_STATUS.OPEN, label: "Open" },
  { value: ELECTION_STATUS.CLOSED, label: "Closed" },
  { value: ELECTION_STATUS.PUBLISHED, label: "Final" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: ELECTION_TYPE.FACULTY, label: "Faculty elections" },
  { value: ELECTION_TYPE.UNIVERSITY, label: "University (Gudoomiye)" },
];

const SELECT_CLASS =
  "text-ink cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100";

export default function ElectionFilters({
  status,
  onStatusChange,
  type,
  onTypeChange,
  facultyId,
  onFacultyChange,
}) {
  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];

  const showFaculties = type !== ELECTION_TYPE.UNIVERSITY;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          aria-label="Filter by status"
          className={SELECT_CLASS}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
          aria-label="Filter by type"
          className={SELECT_CLASS}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {showFaculties && (
        <div
          className="flex gap-[7px] overflow-x-auto pb-1"
          role="group"
          aria-label="Filter by faculty"
        >
          <FacultyChip active={!facultyId} onClick={() => onFacultyChange("")}>
            All faculties
          </FacultyChip>

          {faculties.map((faculty) => (
            <FacultyChip
              key={faculty.id}
              active={facultyId === faculty.id}
              title={faculty.name}
              onClick={() => onFacultyChange(faculty.id)}
            >
              {faculty.code || faculty.name}
            </FacultyChip>
          ))}
        </div>
      )}
    </div>
  );
}

function FacultyChip({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-pill cursor-pointer border px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition ${
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-line bg-surface text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60"
      }`}
    >
      {children}
    </button>
  );
}
