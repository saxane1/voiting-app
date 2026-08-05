"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { useFaculties } from "@/hooks/use-faculties";
import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { updateFaculty } from "@/utils/faculties-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import FacultyForm, { toFacultyPayload, validateFaculty } from "./faculty-form";

/**
 * Edit a faculty — PATCH /faculties/:id.
 *
 * There is NO GET /faculties/:id on the backend, so this reads its faculty out
 * of the shared list the whole app already has cached rather than inventing an
 * endpoint. If the id is not in that list the faculty is gone, which is exactly
 * what the missing-faculty panel says.
 *
 * The endpoint takes name and/or code and rejects an empty body, so only the
 * changed fields are sent and Save stays disabled until something differs.
 */

export default function FacultyEditPage({ facultyId }) {
  const facultiesQuery = useFaculties();

  if (facultiesQuery.isPending) {
    return (
      <>
        <PageHeader title="Edit faculty" backHref="/adminstration/faculties" backLabel="Faculties" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <LoadingState label="Loading faculty" />
        </div>
      </>
    );
  }

  if (facultiesQuery.isError) {
    return (
      <>
        <PageHeader title="Edit faculty" backHref="/adminstration/faculties" backLabel="Faculties" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <ErrorState
            error={facultiesQuery.error}
            onRetry={() => facultiesQuery.refetch()}
            isRetrying={facultiesQuery.isFetching}
          />
        </div>
      </>
    );
  }

  const faculty = (facultiesQuery.data ?? []).find((item) => item.id === facultyId);

  if (!faculty) {
    return (
      <>
        <PageHeader title="Edit faculty" backHref="/adminstration/faculties" backLabel="Faculties" />

        <div className="px-4 py-6 min-[920px]:px-7">
          <div className="border-line bg-surface mx-auto max-w-[520px] rounded-lg border p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-400">
              <CircleAlert size={26} aria-hidden="true" />
            </div>
            <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
              That faculty no longer exists
            </h2>
            <p className="text-muted m-0 mb-5 text-[13.5px]">
              It may have been deleted, or the link is out of date.
            </p>
            <Link
              href="/adminstration/faculties"
              className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              Back to faculties
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Keyed on updatedAt so a change landing from elsewhere reseeds the form,
  // rather than an effect syncing props into state.
  return <EditForm key={`${faculty.id}:${faculty.updatedAt}`} faculty={faculty} />;
}

function toFormValues(faculty) {
  return { name: faculty.name ?? "", code: faculty.code ?? "" };
}

function changedFields(values, faculty) {
  const payload = toFacultyPayload(values);
  const changed = {};

  for (const field of ["name", "code"]) {
    if (payload[field] !== (faculty[field] ?? "")) changed[field] = payload[field];
  }

  return changed;
}

function EditForm({ faculty }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => toFormValues(faculty));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const updateMutation = useMutation({
    mutationFn: (payload) => updateFaculty(faculty.id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.faculties });
      toast.success(`${updated.name} updated`);
      router.push("/adminstration/faculties");
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

    const changed = changedFields(values, faculty);

    if (Object.keys(changed).length === 0) return;

    setErrors({});
    setFormError(null);
    updateMutation.mutate(changed);
  }

  const isSaving = updateMutation.isPending;
  const hasChanges = Object.keys(changedFields(values, faculty)).length > 0;
  const enrolled = faculty.studentCount ?? 0;

  return (
    <>
      <PageHeader
        title="Edit faculty"
        subtitle={`${faculty.code} · ${enrolled} ${enrolled === 1 ? "student" : "students"} enrolled`}
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
              disabled={isSaving}
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
                disabled={isSaving || !hasChanges}
                className="bg-primary-gradient shadow-glow flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
