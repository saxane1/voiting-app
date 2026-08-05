"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { queryKeys } from "@/utils/query-keys";
import { updateStudent } from "@/utils/students-api";

import StudentForm, { toStudentPayload, validateStudent } from "./student-form";

/**
 * The editable half of a student's record — PATCH /students/:id.
 *
 * Form state is seeded from the `student` prop ONCE, and the parent gives this
 * component a key derived from the record's `updatedAt`. So a save (or any
 * refetch that actually changed the record) remounts it with fresh values,
 * while a background refetch that changed nothing leaves half-typed edits
 * alone — no effect syncing props into state.
 *
 * Only the fields that differ are sent: the endpoint rejects an empty body, and
 * a PATCH that re-sends unchanged values would write a pointless audit entry.
 */

const FIELDS = ["name", "studentId", "email", "facultyId"];

function toFormValues(student) {
  return {
    name: student.name ?? "",
    studentId: student.studentId ?? "",
    email: student.email ?? "",
    facultyId: student.facultyId ?? "",
  };
}

function changedFields(values, student) {
  const payload = toStudentPayload(values);
  const changed = {};

  for (const field of FIELDS) {
    if (payload[field] !== (student[field] ?? "")) changed[field] = payload[field];
  }

  return changed;
}

export default function StudentEditForm({ student, children }) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => toFormValues(student));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const updateMutation = useMutation({
    mutationFn: (payload) => updateStudent(student.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.student(student.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.students });
      toast.success("Student updated");
    },
    onError: (error) => {
      const { fields, formError: message } = fieldErrorsFromApi(
        error,
        "The changes could not be saved. Please try again."
      );

      setErrors(fields);
      setFormError(message);
    },
  });

  function handleChange(field, value) {
    setValues((current) => ({ ...current, [field]: value }));

    // Clear the error the moment the admin edits that field — a stale "already
    // exists" under an input they have just changed is misleading.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const clientErrors = validateStudent(values);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    const changed = changedFields(values, student);

    if (Object.keys(changed).length === 0) return;

    setErrors({});
    setFormError(null);
    updateMutation.mutate(changed);
  }

  const isSaving = updateMutation.isPending;
  const hasChanges = Object.keys(changedFields(values, student)).length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="border-line bg-surface rounded-lg border p-6 shadow-sm">
        <StudentForm values={values} errors={errors} onChange={handleChange} disabled={isSaving} />

        {formError && (
          <p
            role="alert"
            className="animate-fade-up mb-4 flex items-start gap-2 rounded-md bg-error-50 px-3 py-2.5 text-[13px] font-medium text-error-700"
          >
            <CircleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}

        {children}

        <div className="flex gap-2.5">
          <button
            type="submit"
            disabled={isSaving || !hasChanges}
            className="bg-primary-gradient flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isSaving ? (
              <>
                <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <CircleCheck size={17} aria-hidden="true" />
                {hasChanges ? "Save changes" : "No changes"}
              </>
            )}
          </button>

          <Link
            href="/adminstration/students"
            className="rounded-[10px] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
