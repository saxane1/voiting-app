"use client";

import { CircleAlert } from "lucide-react";

/**
 * The two fields a faculty has, shared by the create and edit screens.
 *
 * Validation mirrors backend/src/controllers/faculty-controllers.js: name
 * required, code required and 10 characters or fewer. The backend also
 * UPPERCASES the code before storing and comparing ("eng" collides with an
 * existing "ENG" — confirmed against the running API), so the input uppercases
 * as you type. That makes the collision visible before submitting rather than
 * arriving as a surprise 409.
 */

const MAX_CODE = 10;

export const EMPTY_FACULTY = { name: "", code: "" };

export function validateFaculty(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = "name is required";
  }

  if (!values.code.trim()) {
    errors.code = "code is required";
  } else if (values.code.trim().length > MAX_CODE) {
    errors.code = `code must be ${MAX_CODE} characters or fewer`;
  }

  return errors;
}

export function toFacultyPayload(values) {
  return {
    name: values.name.trim(),
    // Uppercased here too, so what was typed is exactly what is sent and what
    // any duplicate message will quote back.
    code: values.code.trim().toUpperCase(),
  };
}

export default function FacultyForm({ values, errors = {}, onChange, disabled = false }) {
  return (
    <div>
      <div className="mb-[18px]">
        <Field label="Faculty name" htmlFor="faculty-name" error={errors.name}>
          <input
            id="faculty-name"
            name="name"
            type="text"
            autoComplete="off"
            disabled={disabled}
            value={values.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Faculty of Law"
            aria-invalid={Boolean(errors.name)}
            className={inputClass(errors.name)}
          />
        </Field>
      </div>

      <div className="mb-6">
        <Field label="Short code" htmlFor="faculty-code" error={errors.code}>
          <input
            id="faculty-code"
            name="code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_CODE}
            disabled={disabled}
            value={values.code}
            onChange={(event) => onChange("code", event.target.value.toUpperCase())}
            placeholder="e.g. LAW"
            aria-invalid={Boolean(errors.code)}
            aria-describedby="faculty-code-hint"
            className={`${inputClass(errors.code)} uppercase`}
          />

          <p id="faculty-code-hint" className="mt-1.5 text-xs text-slate-400">
            A short label shown on student rows and filter chips. Stored in capitals, and unique
            across faculties.
          </p>
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
          className="text-error-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium"
        >
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
