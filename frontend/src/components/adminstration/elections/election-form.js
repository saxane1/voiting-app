"use client";

import { Building2, CircleAlert, GraduationCap } from "lucide-react";

import { useFaculties } from "@/hooks/use-faculties";
import { useNow } from "@/hooks/use-now";
import { dateTimeLocalToMs, fromDateTimeLocal } from "@/utils/datetime-local";
import { ELECTION_TYPE } from "@/utils/election-labels";

/**
 * The five things an election is made of — title, type, faculty, and the two
 * ends of its voting window — shared by the create and edit screens.
 *
 * The validation below MIRRORS backend/src/controllers/election-controllers.js
 * rather than inventing rules of its own, including where the two endpoints
 * deliberately differ:
 *
 *   POST  refines `endAt > now`  — you cannot create an election that is
 *         already over.
 *   PATCH does NOT               — the comment in openElection is explicit that
 *         "editing a stale draft is fine, opening one is not". Blocking a past
 *         endAt in the edit form would stop an admin fixing exactly the draft
 *         the server is telling them to fix.
 *
 * So `mode` decides that one rule, and an edited-into-the-past window gets a
 * non-blocking warning instead — the /open guard is what enforces it.
 */

const MAX_TITLE = 200;

export const EMPTY_ELECTION = {
  title: "",
  type: ELECTION_TYPE.FACULTY,
  facultyId: "",
  startAt: "",
  endAt: "",
};

export function validateElection(values, { mode = "create" } = {}) {
  const errors = {};

  if (!values.title.trim()) {
    errors.title = "title is required";
  } else if (values.title.trim().length > MAX_TITLE) {
    errors.title = `title must be ${MAX_TITLE} characters or fewer`;
  }

  // Mirrors validateTypeAndFaculty(): required for FACULTY, forbidden for
  // UNIVERSITY. The forbidden half is enforced structurally — the select is not
  // rendered, and the payload builder omits the key entirely.
  if (values.type === ELECTION_TYPE.FACULTY && !values.facultyId) {
    errors.facultyId = "A faculty election requires a faculty";
  }

  const start = dateTimeLocalToMs(values.startAt);
  const end = dateTimeLocalToMs(values.endAt);

  if (start === null) {
    errors.startAt = "startAt must be a valid date and time";
  }

  if (end === null) {
    errors.endAt = "endAt must be a valid date and time";
  }

  if (start !== null && end !== null && start >= end) {
    errors.endAt = "endAt must be after startAt";
  }

  if (mode === "create" && end !== null && end <= Date.now() && !errors.endAt) {
    errors.endAt = "endAt must be in the future";
  }

  return errors;
}

/**
 * Form state -> request body.
 *
 * facultyId is OMITTED for a university election rather than sent empty: the
 * backend treats any truthy facultyId on a UNIVERSITY election as a scope
 * error, and `nullish` means leaving the key out is the clean way to say "none".
 */
export function toElectionPayload(values) {
  const isFaculty = values.type === ELECTION_TYPE.FACULTY;

  return {
    title: values.title.trim(),
    type: values.type,
    ...(isFaculty ? { facultyId: values.facultyId } : {}),
    startAt: fromDateTimeLocal(values.startAt),
    endAt: fromDateTimeLocal(values.endAt),
  };
}

export default function ElectionForm({ values, errors = {}, onChange, disabled = false, mode }) {
  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];
  const now = useNow();

  const isFaculty = values.type === ELECTION_TYPE.FACULTY;

  const end = dateTimeLocalToMs(values.endAt);
  const endIsPast = mode === "edit" && end !== null && end <= now && !errors.endAt;

  function handleChange(field) {
    return (event) => onChange(field, event.target.value);
  }

  return (
    <div>
      <div className="mb-5">
        <Field label="Election title" htmlFor="election-title" error={errors.title}>
          <input
            id="election-title"
            name="title"
            type="text"
            autoComplete="off"
            maxLength={MAX_TITLE}
            disabled={disabled}
            value={values.title}
            onChange={handleChange("title")}
            placeholder="e.g. Faculty of Engineering — Faculty Leader 2026"
            aria-invalid={Boolean(errors.title)}
            className={inputClass(errors.title)}
          />
        </Field>
      </div>

      <div className="mb-5">
        <span className="mb-[7px] block text-[13px] font-semibold text-slate-700">
          Election type
        </span>

        <div
          className="grid gap-3 min-[560px]:grid-cols-2"
          role="radiogroup"
          aria-label="Election type"
        >
          <TypeOption
            icon={Building2}
            title="Faculty election"
            description="One faculty's students vote"
            selected={isFaculty}
            disabled={disabled}
            onSelect={() => onChange("type", ELECTION_TYPE.FACULTY)}
          />

          <TypeOption
            icon={GraduationCap}
            title="University election"
            description="All students vote (Gudoomiye)"
            selected={!isFaculty}
            disabled={disabled}
            onSelect={() => onChange("type", ELECTION_TYPE.UNIVERSITY)}
          />
        </div>
      </div>

      {/* Rendered only for FACULTY — a Gudoomiye race has no faculty scope, and
          the backend rejects one outright. */}
      {isFaculty && (
        <div className="mb-5">
          <Field label="Faculty scope" htmlFor="election-facultyId" error={errors.facultyId}>
            <select
              id="election-facultyId"
              name="facultyId"
              disabled={disabled || facultiesQuery.isPending}
              value={values.facultyId}
              onChange={handleChange("facultyId")}
              aria-invalid={Boolean(errors.facultyId)}
              className={`${inputClass(errors.facultyId)} cursor-pointer`}
            >
              <option value="">
                {facultiesQuery.isPending ? "Loading faculties…" : "Select a faculty"}
              </option>

              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name}
                  {faculty.code ? ` (${faculty.code})` : ""}
                </option>
              ))}
            </select>

            {facultiesQuery.isError && (
              <p className="text-error-700 mt-1.5 text-xs font-medium">
                Faculties could not be loaded — reload the page to try again.
              </p>
            )}
          </Field>
        </div>
      )}

      <div className="mb-5 grid gap-4 min-[560px]:grid-cols-2">
        <Field label="Voting opens" htmlFor="election-startAt" error={errors.startAt}>
          <input
            id="election-startAt"
            name="startAt"
            type="datetime-local"
            disabled={disabled}
            value={values.startAt}
            onChange={handleChange("startAt")}
            aria-invalid={Boolean(errors.startAt)}
            className={inputClass(errors.startAt)}
          />
        </Field>

        <Field label="Voting closes" htmlFor="election-endAt" error={errors.endAt}>
          <input
            id="election-endAt"
            name="endAt"
            type="datetime-local"
            disabled={disabled}
            value={values.endAt}
            onChange={handleChange("endAt")}
            aria-invalid={Boolean(errors.endAt)}
            className={inputClass(errors.endAt)}
          />

          {endIsPast && (
            <p className="text-warning-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium">
              <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
              This window has already ended. You can save it, but the election cannot be opened
              until the closing time is in the future.
            </p>
          )}
        </Field>
      </div>

      <p className="text-muted mb-6 text-xs leading-[1.6]">
        Times are in your own timezone. Students vote only inside this window — the server refuses
        a ballot outside it, whatever the status says.
      </p>
    </div>
  );
}

function TypeOption({ icon: Icon, title, description, selected, disabled, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] p-3.5 text-left transition disabled:opacity-60 ${
        selected
          ? "border-indigo-500 bg-indigo-50 ring-[3px] ring-indigo-100"
          : "border-slate-200 bg-slate-50 hover:border-indigo-200 hover:bg-white"
      }`}
    >
      <Icon size={20} className="flex-none text-indigo-600" aria-hidden="true" />
      <span className="min-w-0">
        <span className="text-ink block text-[13.5px] font-bold">{title}</span>
        <span className="text-muted block text-[11.5px]">{description}</span>
      </span>
    </button>
  );
}

function inputClass(hasError) {
  return `text-ink w-full rounded-[10px] border-[1.5px] px-3.5 py-3 text-sm outline-none transition disabled:opacity-60 ${
    hasError
      ? "border-error-500 bg-error-50/40 focus:ring-[3px] focus:ring-error-500/15"
      : "border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white focus:ring-[3px] focus:ring-indigo-100"
  }`;
}

function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-[7px] block text-[13px] font-semibold text-slate-700">
        {label}
      </label>

      {children}

      {error && (
        <p
          role="alert"
          className="text-error-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium"
        >
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
