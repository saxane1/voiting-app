"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { queryKeys } from "@/utils/query-keys";
import { createStudent } from "@/utils/students-api";

import PageHeader from "../page-header";
import StudentForm, { EMPTY_STUDENT, toStudentPayload, validateStudent } from "./student-form";

/**
 * Create one student — POST /students, which returns 201 { student }.
 *
 * The failure that actually happens in practice is a duplicate: email and
 * studentId are both @unique on User, and the backend answers
 * 409 STUDENT_ALREADY_EXISTS naming the value in its message. The code alone
 * doesn't say WHICH field collided, so `fieldErrorsFromApi` reads the sentence
 * and puts the message under the offending input — an admin re-typing a
 * student ID needs to see it on the student ID box, not in a banner.
 */

export default function StudentCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState(EMPTY_STUDENT);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const createMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: (student) => {
      // Prefix invalidation: every cached list page and filter combination is
      // under ["students"], so this one call refreshes whichever one the admin
      // returns to.
      queryClient.invalidateQueries({ queryKey: queryKeys.students });

      toast.success(`${student.name} added to the roll`);
      router.push("/adminstration/students");
    },
    onError: (error) => {
      const { fields, formError: message } = fieldErrorsFromApi(
        error,
        "The student could not be created. Please try again."
      );

      setErrors(fields);
      setFormError(message);
    },
  });

  function handleChange(field, value) {
    setValues((current) => ({ ...current, [field]: value }));

    // Clear the error the moment the admin edits that field — leaving a stale
    // "already exists" under an input they have just changed is misleading.
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

    setErrors({});
    setFormError(null);
    createMutation.mutate(toStudentPayload(values));
  }

  const isSubmitting = createMutation.isPending;

  return (
    <>
      <PageHeader
        title="Add student"
        subtitle="Creates the account. The student signs in with a one-time code sent to this address."
        backHref="/adminstration/students"
        backLabel="Students"
      />

      <div className="px-4 py-6 min-[920px]:px-7">
        <form onSubmit={handleSubmit} noValidate className="max-w-[620px]">
          <div className="border-line bg-surface rounded-lg border p-6 shadow-sm">
            <StudentForm
              values={values}
              errors={errors}
              onChange={handleChange}
              disabled={isSubmitting}
            />

            {formError && (
              <p
                role="alert"
                className="animate-fade-up mb-4 flex items-start gap-2 rounded-md bg-error-50 px-3 py-2.5 text-[13px] font-medium text-error-700"
              >
                <CircleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary-gradient flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CircleCheck size={17} aria-hidden="true" />
                    Create student
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
      </div>
    </>
  );
}
