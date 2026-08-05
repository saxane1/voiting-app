"use client";

import { CircleAlert } from "lucide-react";

import CandidateAvatar from "@/components/vote/candidate-avatar";
import { MAX_MANIFESTO_LENGTH } from "@/utils/candidates-api";

/**
 * The two optional things a candidacy carries beyond the student themselves:
 * a manifesto and a photo. Shared by the add form and the edit dialog, so both
 * validate identically to backend/src/controllers/candidate-controllers.js —
 * manifesto trimmed and capped at 5000 characters, photoUrl a valid URL.
 *
 * The photo is previewed with <CandidateAvatar>, the SAME component the voter
 * ballot renders it with (F2): a plain <img> with an initials fallback, never
 * next/image. photoUrl is free text pointing at any host, and putting a wildcard
 * in images.remotePatterns to satisfy next/image would turn the app's image
 * optimiser into an open proxy for arbitrary URLs. The preview therefore also
 * tells the admin the truth — if the URL does not resolve here, it will not
 * resolve on the ballot either.
 */

export const EMPTY_CANDIDATE_FIELDS = { manifesto: "", photoUrl: "" };

export function validateCandidateFields(values) {
  const errors = {};

  if (values.manifesto.trim().length > MAX_MANIFESTO_LENGTH) {
    errors.manifesto = `manifesto must be ${MAX_MANIFESTO_LENGTH} characters or fewer`;
  }

  if (values.photoUrl.trim()) {
    try {
      new URL(values.photoUrl.trim());
    } catch {
      errors.photoUrl = "photoUrl must be a valid URL";
    }
  }

  return errors;
}

/** Trimmed, with empties turned into "" — the API layer decides omit vs null. */
export function toCandidateFieldsPayload(values) {
  return {
    manifesto: values.manifesto.trim(),
    photoUrl: values.photoUrl.trim(),
  };
}

export default function CandidateFields({ values, errors = {}, onChange, disabled = false, idPrefix }) {
  const manifestoLength = values.manifesto.trim().length;
  const photoUrl = values.photoUrl.trim();

  return (
    <>
      <Field
        label="Manifesto"
        htmlFor={`${idPrefix}-manifesto`}
        error={errors.manifesto}
        optional
      >
        <textarea
          id={`${idPrefix}-manifesto`}
          name="manifesto"
          rows={4}
          disabled={disabled}
          value={values.manifesto}
          onChange={(event) => onChange("manifesto", event.target.value)}
          placeholder="What this candidate is standing for…"
          aria-invalid={Boolean(errors.manifesto)}
          aria-describedby={`${idPrefix}-manifesto-count`}
          className={`${inputClass(errors.manifesto)} resize-y leading-[1.55]`}
        />

        <p
          id={`${idPrefix}-manifesto-count`}
          className={`mt-1 text-right text-[11px] ${
            manifestoLength > MAX_MANIFESTO_LENGTH ? "text-error-700 font-semibold" : "text-slate-400"
          }`}
        >
          {manifestoLength} / {MAX_MANIFESTO_LENGTH}
        </p>
      </Field>

      <Field label="Photo URL" htmlFor={`${idPrefix}-photo`} error={errors.photoUrl} optional>
        <div className="flex items-start gap-2.5">
          <input
            id={`${idPrefix}-photo`}
            name="photoUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={values.photoUrl}
            onChange={(event) => onChange("photoUrl", event.target.value)}
            placeholder="https://…"
            aria-invalid={Boolean(errors.photoUrl)}
            className={inputClass(errors.photoUrl)}
          />

          {photoUrl && !errors.photoUrl && (
            <CandidateAvatar name="?" photoUrl={photoUrl} size={44} className="mt-px" />
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-slate-400">
          Linked, not uploaded. If the image cannot be loaded, the candidate&apos;s initials are
          shown instead — on this screen and on the ballot.
        </p>
      </Field>
    </>
  );
}

function inputClass(hasError) {
  return `text-ink w-full rounded-[10px] border-[1.5px] px-3 py-2.5 text-[13.5px] outline-none transition disabled:opacity-60 ${
    hasError
      ? "border-error-500 bg-error-50/40 focus:ring-error-500/15 focus:ring-[3px]"
      : "border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white focus:ring-[3px] focus:ring-indigo-100"
  }`;
}

function Field({ label, htmlFor, error, optional, children }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-[7px] flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
        {label}
        {optional && <span className="text-[11px] font-medium text-slate-400">optional</span>}
      </label>

      {children}

      {error && (
        <p role="alert" className="text-error-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium">
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
