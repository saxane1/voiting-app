"use client";

import { CircleAlert } from "lucide-react";

import { useFaculties } from "@/hooks/use-faculties";

/**
 * The four fields a student record has — name, studentId, email, facultyId —
 * shared by the create and edit screens so the two can never drift.
 *
 * Validation is deliberately duplicated, not replaced: `validateStudent` below
 * mirrors backend/src/utils/student-fields.js so an obvious mistake is caught
 * without a round trip, while the server stays the authority. Anything only the
 * server can know — that an email is already taken, that a facultyId no longer
 * exists — comes back through `errors` and lands on the same field.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPTY_STUDENT = { name: "", studentId: "", email: "", facultyId: "" };

export function validateStudent(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = "name is required";
  } else if (values.name.trim().length > 150) {
    errors.name = "name must be 150 characters or fewer";
  }

  if (!values.studentId.trim()) {
    errors.studentId = "studentId is required";
  } else if (values.studentId.trim().length > 50) {
    errors.studentId = "studentId must be 50 characters or fewer";
  }

  if (!values.email.trim()) {
    errors.email = "A valid email address is required";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "A valid email address is required";
  }

  if (!values.facultyId) {
    errors.facultyId = "Choose a faculty";
  }

  return errors;
}

/** Trimmed + lowercased exactly as the backend normalises before storing. */
export function toStudentPayload(values) {
  return {
    name: values.name.trim(),
    studentId: values.studentId.trim(),
    email: values.email.trim().toLowerCase(),
    facultyId: values.facultyId,
  };
}

export default function StudentForm({ values, errors = {}, onChange, disabled = false }) {
  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];

  function handleChange(field) {
    return (event) => onChange(field, event.target.value);
  }

  return (
    <div>
      <div className="mb-4 grid gap-4 min-[560px]:grid-cols-2">
        <Field label="Full name" htmlFor="student-name" error={errors.name}>
          <input
            id="student-name"
            name="name"
            type="text"
            autoComplete="off"
            disabled={disabled}
            value={values.name}
            onChange={handleChange("name")}
            placeholder="First Middle Last"
            aria-invalid={Boolean(errors.name)}
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="Student ID" htmlFor="student-studentId" error={errors.studentId}>
          <input
            id="student-studentId"
            name="studentId"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={values.studentId}
            onChange={handleChange("studentId")}
            placeholder="PSU-CS-1234"
            aria-invalid={Boolean(errors.studentId)}
            className={inputClass(errors.studentId)}
          />
        </Field>
      </div>

      <div className="mb-4">
        <Field label="University email" htmlFor="student-email" error={errors.email}>
          <input
            id="student-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            value={values.email}
            onChange={handleChange("email")}
            placeholder="student@psu.edu.so"
            aria-invalid={Boolean(errors.email)}
            className={inputClass(errors.email)}
          />
        </Field>
      </div>

      <div className="mb-6">
        <Field label="Faculty" htmlFor="student-facultyId" error={errors.facultyId}>
          <select
            id="student-facultyId"
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
            <p className="mt-1.5 text-xs font-medium text-error-700">
              Faculties could not be loaded — reload the page to try again.
            </p>
          )}
        </Field>
      </div>
    </div>
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
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-error-700"
        >
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
