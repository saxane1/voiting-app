"use client";

import { Search, X } from "lucide-react";

import { useFaculties } from "@/hooks/use-faculties";

/**
 * The list's controls, mapped 1:1 onto GET /students query params:
 *
 *   search   — free text; the backend matches it case-insensitively against
 *              name, email AND studentId, so one box covers all three.
 *   facultyId— exact faculty id (NOT code); options come from GET /faculties.
 *   active   — "true" | "false" | "all"; anything else is a 400, so the values
 *              here are fixed rather than free-form.
 *
 * Faculty is a chip row like the prototype, kept on one horizontally scrollable
 * line so seven faculties don't push the table down a phone screen.
 */

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "true", label: "Active only" },
  { value: "false", label: "Inactive only" },
];

export default function StudentFilters({
  search,
  onSearchChange,
  facultyId,
  onFacultyChange,
  active,
  onActiveChange,
}) {
  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <span
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <Search size={17} />
          </span>

          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name, ID or email…"
            aria-label="Search students"
            className="text-ink w-full rounded-[10px] border-[1.5px] border-slate-200 bg-white py-2.5 pr-10 pl-10 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100"
          />

          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-slate-400 transition hover:text-slate-600"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          value={active}
          onChange={(event) => onActiveChange(event.target.value)}
          aria-label="Filter by status"
          className="text-ink cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

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
