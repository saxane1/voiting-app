"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { createFaculty } from "@/utils/faculties-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import FacultyForm, { EMPTY_FACULTY, toFacultyPayload, validateFaculty } from "./faculty-form";

/**
 * Create a faculty — POST /faculties, 201 { faculty }.
 *
 * Both name and code are unique, and the backend answers either collision with
 * the same 409 FACULTY_ALREADY_EXISTS. Only the sentence says which one, so
 * fieldErrorsFromApi reads it and puts the message under the offending input
 * ("A faculty with code …" -> code, "A faculty named …" -> name).
 */

export default function FacultyCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState(EMPTY_FACULTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const createMutation = useMutation({
    mutationFn: createFaculty,
    onSuccess: (faculty) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.faculties });
      toast.success(`${faculty.name} added`);
      router.push("/adminstration/faculties");
    },
    onError: (error) => {
      const { fields, formError: message } = fieldErrorsFromApi(
        error,
        "The faculty could not be created. Please try again."
      );

      setErrors(fields);
      setFormError(message);
    },
  });

  function handleChange(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const clientErrors = validateFaculty(values);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    createMutation.mutate(toFacultyPayload(values));
  }

  const isSubmitting = createMutation.isPending;

  return (
    <>
      <PageHeader
        title="Add faculty"
        subtitle="Students are assigned to a faculty, and each faculty elects its own leader"
        backHref="/adminstration/faculties"
        backLabel="Faculties"
      />

      <div className="px-4 py-6 min-[920px]:px-7">
        <form onSubmit={handleSubmit} noValidate className="max-w-[560px]">
          <div className="border-line bg-surface rounded-lg border p-6 shadow-sm">
            <FacultyForm
              values={values}
              errors={errors}
              onChange={handleChange}
              disabled={isSubmitting}
            />

            {formError && (
              <p
                role="alert"
                className="animate-fade-up bg-error-50 text-error-700 mb-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium"
              >
                <CircleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary-gradient shadow-glow flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CircleCheck size={17} aria-hidden="true" />
                    Create faculty
                  </>
                )}
              </button>

              <Link
                href="/adminstration/faculties"
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
