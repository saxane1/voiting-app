"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Lock, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { apiErrorCode } from "@/utils/api-error";
import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { toDateTimeLocal } from "@/utils/datetime-local";
import { ELECTION_TYPE, electionStatusAdminLabel } from "@/utils/election-labels";
import { isEditable } from "@/utils/election-transitions";
import { fetchElection, updateElection } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import PageHeader from "../page-header";
import ElectionForm, { toElectionPayload, validateElection } from "./election-form";
import { resolveFormError } from "./election-create-page";

/**
 * Edit an election — PATCH /elections/:id.
 *
 * Editing is DRAFT/SCHEDULED only (isEditable in the backend's
 * election-status.js): once an election has been OPEN, its title, window, type
 * and faculty are part of the record and the server answers
 * 409 ELECTION_NOT_EDITABLE. This screen therefore refuses to render a form for
 * a non-editable election rather than letting an admin type a change that
 * cannot land — and the detail screen does not offer an edit link for one.
 *
 * The status is re-checked HERE against freshly fetched data, not trusted from
 * the link that got here: the election may have been opened in another tab
 * since the list was rendered.
 */

export default function ElectionEditPage({ electionId }) {
  const electionQuery = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: () => fetchElection(electionId),
  });

  const election = electionQuery.data;

  if (electionQuery.isPending) {
    return (
      <>
        <PageHeader title="Edit election" backHref="/adminstration/elections" backLabel="Elections" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <LoadingState label="Loading election" />
        </div>
      </>
    );
  }

  if (electionQuery.isError) {
    const notFound = apiErrorCode(electionQuery.error) === "ELECTION_NOT_FOUND";

    return (
      <>
        <PageHeader title="Edit election" backHref="/adminstration/elections" backLabel="Elections" />

        <div className="px-4 py-6 min-[920px]:px-7">
          {notFound ? (
            <Refusal title="That election no longer exists">
              It may have been deleted, or the link is out of date.
            </Refusal>
          ) : (
            <ErrorState
              error={electionQuery.error}
              onRetry={() => electionQuery.refetch()}
              isRetrying={electionQuery.isFetching}
            />
          )}
        </div>
      </>
    );
  }

  if (!isEditable(election.status)) {
    return (
      <>
        <PageHeader
          title="Edit election"
          backHref={`/adminstration/elections/${electionId}`}
          backLabel="Back to election"
        />

        <div className="px-4 py-6 min-[920px]:px-7">
          <Refusal
            icon={Lock}
            title={`This election is ${electionStatusAdminLabel(election.status)} and can no longer be edited`}
            href={`/adminstration/elections/${electionId}`}
            linkLabel="Back to the election"
          >
            An election&apos;s title, window, type and scope are fixed once it has opened — they
            are part of the record of how the vote was run. Editing is only possible while it is a
            draft or scheduled.
          </Refusal>
        </div>
      </>
    );
  }

  // Keyed on updatedAt so a change landing from elsewhere reseeds the form
  // instead of an effect syncing props into state.
  return <EditForm key={`${election.id}:${election.updatedAt}`} election={election} />;
}

const FIELDS = ["title", "type", "facultyId", "startAt", "endAt"];

function toFormValues(election) {
  return {
    title: election.title ?? "",
    type: election.type ?? ELECTION_TYPE.FACULTY,
    facultyId: election.facultyId ?? "",
    startAt: toDateTimeLocal(election.startAt),
    endAt: toDateTimeLocal(election.endAt),
  };
}

/**
 * Only what actually changed.
 *
 * facultyId is the awkward one: switching a FACULTY election to UNIVERSITY has
 * to send `facultyId: null` EXPLICITLY, because the controller only clears the
 * column when the key is present (`parsed.data.facultyId !== undefined`).
 * Omitting it would keep the old faculty on a university-wide race, which the
 * server would then refuse as an invalid scope.
 */
function changedFields(values, election) {
  const payload = toElectionPayload(values);
  const current = toElectionPayload(toFormValues(election));
  const changed = {};

  for (const field of FIELDS) {
    if (field === "facultyId") {
      const next = values.type === ELECTION_TYPE.FACULTY ? values.facultyId : null;
      const before = election.facultyId ?? null;

      if (next !== before) changed.facultyId = next;
      continue;
    }

    if (payload[field] !== current[field]) changed[field] = payload[field];
  }

  return changed;
}

function EditForm({ election }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => toFormValues(election));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const updateMutation = useMutation({
    mutationFn: (payload) => updateElection(election.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.election(election.id), (current) => ({
        ...current,
        ...updated,
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.elections });
      toast.success("Election updated");
      router.push(`/adminstration/elections/${election.id}`);
    },
    onError: (error) => {
      // The status can change between opening this form and submitting it.
      // Rather than show a field error for something that is no longer about a
      // field, say so plainly and let the refetched detail screen be the truth.
      if (apiErrorCode(error) === "ELECTION_NOT_EDITABLE") {
        queryClient.invalidateQueries({ queryKey: queryKeys.elections });
        toast.error("This election's status changed — it can no longer be edited.");
        router.push(`/adminstration/elections/${election.id}`);
        return;
      }

      const { fields, formError: message } = fieldErrorsFromApi(
        error,
        "The changes could not be saved. Please try again."
      );

      setErrors(fields);
      setFormError(resolveFormError(fields, message, values.type));
    },
  });

  function handleChange(field, value) {
    setValues((current) => {
      const next = { ...current, [field]: value };

      if (field === "type" && value === ELECTION_TYPE.UNIVERSITY) next.facultyId = "";

      return next;
    });

    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const clientErrors = validateElection(values, { mode: "edit" });

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    const changed = changedFields(values, election);

    if (Object.keys(changed).length === 0) return;

    setErrors({});
    setFormError(null);
    updateMutation.mutate(changed);
  }

  const isSaving = updateMutation.isPending;
  const hasChanges = Object.keys(changedFields(values, election)).length > 0;

  return (
    <>
      <PageHeader
        title="Edit election"
        subtitle={`${electionStatusAdminLabel(election.status)} · editable until it opens`}
        backHref={`/adminstration/elections/${election.id}`}
        backLabel="Back to election"
      />

      <div className="px-4 py-6 min-[920px]:px-7">
        <form onSubmit={handleSubmit} noValidate className="max-w-[680px]">
          <div className="border-line bg-surface rounded-lg border p-6 shadow-sm">
            <ElectionForm
              mode="edit"
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
                href={`/adminstration/elections/${election.id}`}
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

function Refusal({ icon: Icon = CircleAlert, title, href = "/adminstration/elections", linkLabel = "Back to elections", children }) {
  return (
    <div className="border-line bg-surface mx-auto max-w-[560px] rounded-lg border p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-400">
        <Icon size={26} aria-hidden="true" />
      </div>

      <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">{title}</h2>
      <p className="text-muted m-0 mb-5 text-[13.5px] leading-[1.55]">{children}</p>

      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
