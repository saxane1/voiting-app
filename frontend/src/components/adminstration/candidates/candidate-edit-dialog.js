"use client";

import { useEffect, useState } from "react";

import { CircleAlert, LoaderCircle, Pencil } from "lucide-react";

import CandidateFields, {
  toCandidateFieldsPayload,
  validateCandidateFields,
} from "./candidate-fields";

/**
 * Edit a candidate's manifesto and photo.
 *
 * The student behind the candidacy is NOT editable — PATCH /candidates/:id takes
 * manifesto and photoUrl only. Putting a different person in a seat is a remove
 * plus an add, and both are written to the audit trail separately; letting one
 * row quietly become a different student would not be.
 *
 * Clearing a field sends `null`, which the controller writes as null. The body
 * always carries both keys because the controller refuses one with neither.
 */

export default function CandidateEditDialog({
  candidate,
  isSubmitting,
  fieldErrors,
  formError,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({
    manifesto: candidate.manifesto ?? "",
    photoUrl: candidate.photoUrl ?? "",
  });
  const [localErrors, setLocalErrors] = useState({});

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !isSubmitting) onCancel();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onCancel]);

  const errors = { ...fieldErrors, ...localErrors };

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setLocalErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit(event) {
    event.preventDefault();

    const validation = validateCandidateFields(values);

    if (Object.keys(validation).length > 0) {
      setLocalErrors(validation);
      return;
    }

    setLocalErrors({});
    onSubmit(toCandidateFieldsPayload(values));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-edit-title"
      onClick={() => !isSubmitting && onCancel()}
      className="animate-fade-in fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-[#141232]/45 p-5 backdrop-blur-[3px]"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        noValidate
        className="bg-surface animate-pop w-[min(480px,100%)] rounded-xl p-6 shadow-lg"
      >
        <div className="mb-5 flex items-start gap-[15px]">
          <span className="grid size-11 flex-none place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Pencil size={20} aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <h2
              id="candidate-edit-title"
              className="font-display text-ink m-0 mb-1 text-[18px] font-bold tracking-[-0.01em]"
            >
              {candidate.user?.name ?? "Candidate"}
            </h2>
            <p className="text-muted m-0 text-[13px]">
              {candidate.user?.studentId} · manifesto and photo only
            </p>
          </div>
        </div>

        <CandidateFields
          idPrefix="edit-candidate"
          values={values}
          errors={errors}
          onChange={change}
          disabled={isSubmitting}
        />

        {formError && (
          <p
            role="alert"
            className="border-error-500/30 bg-error-50 text-error-700 mb-4 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-xs font-medium"
          >
            <CircleAlert size={15} className="mt-px shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="cursor-pointer rounded-[10px] border border-slate-200 bg-white px-[18px] py-2.5 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary-gradient shadow-glow inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-[18px] py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
