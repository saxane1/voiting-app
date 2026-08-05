"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { ELECTION_TYPE } from "@/utils/election-labels";
import { createElection } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ElectionForm, {
  EMPTY_ELECTION,
  toElectionPayload,
  validateElection,
} from "./election-form";

/**
 * Create an election — POST /elections, which answers 201 { election }.
 *
 * The new election is ALWAYS a DRAFT: the controller hard-codes the status and
 * ignores any status in the body, so nothing created here can go live by
 * accident. Going live is a separate, confirmed transition on the detail
 * screen.
 *
 * Server errors land on the field that caused them: VALIDATION_ERROR carries
 * `details[{path,message}]` (title, startAt, endAt), and INVALID_ELECTION_SCOPE
 * is answered on the faculty select — see utils/api-field-errors.js.
 */

export default function ElectionCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState(EMPTY_ELECTION);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const createMutation = useMutation({
    mutationFn: createElection,
    onSuccess: (election) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.elections });
      toast.success(`"${election.title}" created as a draft`);
      router.push(`/adminstration/elections/${election.id}`);
    },
    onError: (error) => {
      const { fields, formError: message } = fieldErrorsFromApi(
        error,
        "The election could not be created. Please try again."
      );

      setErrors(fields);
      setFormError(resolveFormError(fields, message, values.type));
    },
  });

  function handleChange(field, value) {
    setValues((current) => {
      const next = { ...current, [field]: value };

      // Switching to a university-wide race drops any faculty already chosen,
      // so the payload can never carry the one thing the backend forbids on it.
      if (field === "type" && value === ELECTION_TYPE.UNIVERSITY) next.facultyId = "";

      return next;
    });

    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const clientErrors = validateElection(values, { mode: "create" });

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    createMutation.mutate(toElectionPayload(values));
  }

  const isSubmitting = createMutation.isPending;

  return (
    <>
      <PageHeader
        title="New election"
        subtitle="Created as a draft — nothing goes live until you open it"
        backHref="/adminstration/elections"
        backLabel="Elections"
      />

      <div className="px-4 py-6 min-[920px]:px-7">
        <form onSubmit={handleSubmit} noValidate className="max-w-[680px]">
          <div className="border-line bg-surface rounded-lg border p-6 shadow-sm">
            <ElectionForm
              mode="create"
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
                    Create draft election
                  </>
                )}
              </button>

              <Link
                href="/adminstration/elections"
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

/**
 * A faculty error on a UNIVERSITY election has no field to land on — the select
 * is not rendered. Rather than drop it, it is promoted to a form-level message.
 * (The client mirrors the rule, so this only fires if the server disagrees with
 * us about scope, which is exactly when it must not be swallowed.)
 */
export function resolveFormError(fields, message, type) {
  if (fields.facultyId && type === ELECTION_TYPE.UNIVERSITY) {
    return fields.facultyId;
  }

  return message;
}
