"use client";

import { useState } from "react";

import { CircleAlert, LoaderCircle, UserRoundPlus } from "lucide-react";

import CandidateFields, {
  EMPTY_CANDIDATE_FIELDS,
  toCandidateFieldsPayload,
  validateCandidateFields,
} from "./candidate-fields";
import CandidatePicker from "./candidate-picker";

/**
 * Attach a student to this election: pick the student, optionally give them a
 * manifesto and a photo, submit.
 *
 * The form owns only its inputs. It does not decide whether adding is allowed
 * (the roster page does, from the server's status), it does not decide whether
 * the student is eligible (the server does), and it does not clear a refusal on
 * its own — a rejected submission keeps the student selected, with the server's
 * reason under the picker, so the admin can see exactly who was refused and why.
 */

export default function CandidateAddForm({
  election,
  attachedUserIds,
  isSubmitting,
  fieldErrors,
  formError,
  onSubmit,
  onDirty,
}) {
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState(EMPTY_CANDIDATE_FIELDS);
  const [localErrors, setLocalErrors] = useState({});

  // Server errors survive editing the field they landed on until the next
  // submit — but only for fields the admin has not touched since.
  const errors = { ...fieldErrors, ...localErrors };

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setLocalErrors((current) => ({ ...current, [field]: undefined }));
    onDirty?.();
  }

  function selectStudent(student) {
    setSelected(student);
    onDirty?.();
  }

  function submit(event) {
    event.preventDefault();

    if (!selected) {
      setLocalErrors({ userId: "Choose the student to add." });
      return;
    }

    const validation = validateCandidateFields(values);

    if (Object.keys(validation).length > 0) {
      setLocalErrors(validation);
      return;
    }

    setLocalErrors({});

    const { manifesto, photoUrl } = toCandidateFieldsPayload(values);

    onSubmit(
      { userId: selected.id, manifesto, photoUrl },
      // Called only once the server has accepted, so a refusal never wipes what
      // the admin typed.
      () => {
        setSelected(null);
        setValues(EMPTY_CANDIDATE_FIELDS);
      }
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-line bg-surface rounded-lg border p-5 shadow-sm"
      noValidate
    >
      <h2 className="text-ink m-0 mb-1 text-[15px] font-bold">Add a candidate</h2>
      <p className="text-muted m-0 mb-4 text-xs leading-[1.5]">
        Candidates are registered by the commission — students cannot nominate themselves.
      </p>

      <div className="mb-4">
        <span className="mb-[7px] block text-[13px] font-semibold text-slate-700">Student</span>

        <CandidatePicker
          election={election}
          attachedUserIds={attachedUserIds}
          selected={selected}
          onSelect={selectStudent}
          error={errors.userId}
          disabled={isSubmitting}
        />
      </div>

      <CandidateFields
        idPrefix="add-candidate"
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-primary-gradient shadow-glow flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[13.5px] font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <UserRoundPlus size={16} aria-hidden="true" />
        )}
        {isSubmitting ? "Adding…" : "Add to ballot"}
      </button>
    </form>
  );
}
