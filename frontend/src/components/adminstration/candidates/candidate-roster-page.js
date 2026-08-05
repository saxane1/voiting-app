"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { fieldErrorsFromApi } from "@/utils/api-field-errors";
import { CANDIDATE_ERROR_HINTS, canManageCandidates } from "@/utils/candidate-rules";
import { addCandidate, removeCandidate, updateCandidate } from "@/utils/candidates-api";
import { electionScopeText, electionTypeLabel } from "@/utils/election-labels";
import { fetchElection } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import ConfirmDialog from "../confirm-dialog";
import ElectionStatusBadge from "../elections/election-status-badge";
import PageHeader from "../page-header";
import CandidateAddForm from "./candidate-add-form";
import CandidateEditDialog from "./candidate-edit-dialog";
import CandidateReadiness, { CandidatesLockedNote } from "./candidate-readiness";
import CandidateRow from "./candidate-row";

/**
 * The candidate roster for ONE election — F6.
 *
 * Candidate management is per-election by nature: whether a student may stand at
 * all depends on the election's type and faculty, and whether the roster may be
 * touched at all depends on its status. Both live on the election, so this
 * screen hangs off it rather than existing as a free-floating candidates list.
 *
 * WHERE THE DATA COMES FROM: GET /elections/:id (ADMIN), the same call F5's
 * detail page makes and the same cache entry — `queryKeys.election(id)`. It
 * returns the election AND its roster with `user{ id, name, studentId }`
 * embedded, so the status the controls are derived from and the roster they act
 * on are always the same server response. The AUTH-level
 * GET /elections/:id/candidates is the LEAN ballot shape (no studentId) and is
 * deliberately not used here — see utils/candidates-api.js.
 *
 * SERVER TRUTH, EVERY TIME:
 *   - Add/edit/remove are offered only when `canManageCandidates(status)` —
 *     the mirror of the backend's isEditable(), i.e. DRAFT or SCHEDULED. The
 *     mirror decides what is PAINTED; the server decides what HAPPENS.
 *   - Every mutation invalidates ["elections"] on success AND on failure. The
 *     failure case is the one that matters: a 409 CANDIDATES_LOCKED means
 *     another admin opened this election while the form was on screen, so the
 *     add form has to be replaced by the read-only roster rather than left
 *     inviting a second doomed attempt.
 *   - A refusal is never swallowed and never re-worded into "it worked". The
 *     server's own sentence is shown, because it carries the detail the client
 *     could not know — which faculty the student actually belongs to.
 *
 * There are no tallies or results here. That is F7, and it is admin-only there.
 */

export default function CandidateRosterPage({ electionId }) {
  const queryClient = useQueryClient();

  const [addError, setAddError] = useState({ fields: {}, formError: null });
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState({ fields: {}, formError: null });
  const [removing, setRemoving] = useState(null);
  const [screenError, setScreenError] = useState(null);

  const electionQuery = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: () => fetchElection(electionId),
  });

  const election = electionQuery.data;

  /** Re-read from the server. Runs after every mutation, accepted or refused. */
  function reconcile() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.elections });
  }

  /**
   * Refusals that are about the ELECTION rather than the form: the roster is
   * locked, or the thing being acted on is gone. Both mean the screen itself is
   * out of date, so they surface above the roster and the page re-reads.
   */
  function handleStructuralError(error) {
    const code = apiErrorCode(error);

    if (code !== "CANDIDATES_LOCKED" && code !== "ELECTION_NOT_FOUND" && code !== "CANDIDATE_NOT_FOUND") {
      return false;
    }

    setScreenError({
      message: apiErrorMessage(error, "That change was refused."),
      hint: CANDIDATE_ERROR_HINTS[code] ?? null,
    });
    setEditing(null);
    setRemoving(null);
    reconcile();
    toast.error(apiErrorMessage(error, "That change was refused."));

    return true;
  }

  const addMutation = useMutation({
    mutationFn: ({ payload }) => addCandidate(electionId, payload),
    onSuccess: async (candidate, { onAccepted }) => {
      setAddError({ fields: {}, formError: null });
      setScreenError(null);
      onAccepted();
      await reconcile();
      toast.success(`${candidate.name} added to the ballot`);
    },
    onError: (error) => {
      if (handleStructuralError(error)) return;

      // FACULTY_MISMATCH, ALREADY_CANDIDATE, NOT_A_STUDENT, STUDENT_INACTIVE and
      // USER_NOT_FOUND all land on the picker (utils/api-field-errors.js);
      // anything else is shown at form level rather than dropped.
      setAddError(fieldErrorsFromApi(error, "That candidate could not be added."));
      reconcile();
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ candidateId, payload }) => updateCandidate(candidateId, payload),
    onSuccess: async () => {
      setEditing(null);
      setEditError({ fields: {}, formError: null });
      setScreenError(null);
      await reconcile();
      toast.success("Candidate updated");
    },
    onError: (error) => {
      if (handleStructuralError(error)) return;

      setEditError(fieldErrorsFromApi(error, "Those changes could not be saved."));
      reconcile();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (candidate) => removeCandidate(candidate.id),
    onSuccess: async (_data, candidate) => {
      setRemoving(null);
      setScreenError(null);
      await reconcile();
      toast.success(`${candidate.user?.name ?? "Candidate"} removed from the ballot`);
    },
    onError: (error) => {
      if (handleStructuralError(error)) return;

      setRemoving(null);
      reconcile();

      const message = apiErrorMessage(error, "That candidate could not be removed.");

      setScreenError({ message, hint: CANDIDATE_ERROR_HINTS[apiErrorCode(error)] ?? null });
      toast.error(message);
    },
  });

  if (electionQuery.isPending) {
    return (
      <>
        <PageHeader title="Candidates" backHref="/adminstration/candidates" backLabel="Candidates" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <LoadingState label="Loading candidates" />
        </div>
      </>
    );
  }

  if (electionQuery.isError) {
    const notFound = apiErrorCode(electionQuery.error) === "ELECTION_NOT_FOUND";

    return (
      <>
        <PageHeader title="Candidates" backHref="/adminstration/candidates" backLabel="Candidates" />

        <div className="px-4 py-6 min-[920px]:px-7">
          {notFound ? (
            <div className="border-line bg-surface mx-auto max-w-[520px] rounded-lg border p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <CircleAlert size={26} aria-hidden="true" />
              </div>
              <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
                That election no longer exists
              </h2>
              <p className="text-muted m-0 mb-5 text-[13.5px]">
                It may have been deleted, or the link is out of date.
              </p>
              <Link
                href="/adminstration/candidates"
                className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Back to candidates
              </Link>
            </div>
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

  const candidates = election.candidates ?? [];
  const canManage = canManageCandidates(election.status);
  const attachedUserIds = new Set(candidates.map((candidate) => candidate.user?.id).filter(Boolean));

  return (
    <>
      <PageHeader
        title={election.title}
        subtitle={`Candidates · ${electionTypeLabel(election.type)} · ${electionScopeText(election)}`}
        backHref={`/adminstration/elections/${election.id}`}
        backLabel="Back to election"
      >
        <ElectionStatusBadge status={election.status} size="lg" />
        {electionQuery.isFetching && (
          <LoaderCircle size={15} className="animate-spin text-indigo-500" aria-hidden="true" />
        )}
      </PageHeader>

      <div className="grid gap-5 px-4 py-6 min-[920px]:px-7 min-[1060px]:grid-cols-[1fr_360px] min-[1060px]:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {screenError && (
            <ScreenError
              message={screenError.message}
              hint={screenError.hint}
              onDismiss={() => setScreenError(null)}
            />
          )}

          <CandidateReadiness election={election} count={candidates.length} />

          <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
            <h2 className="text-ink m-0 mb-4 text-[15px] font-bold">
              On the ballot ({candidates.length})
            </h2>

            {candidates.length === 0 ? (
              <p className="text-muted m-0 flex items-start gap-2 rounded-md bg-slate-50 px-3.5 py-4 text-[13px] leading-[1.55]">
                <UsersRound size={16} className="mt-px shrink-0 text-slate-400" aria-hidden="true" />
                No candidates yet.{" "}
                {canManage
                  ? "Add the students standing in this election — the commission registers them; students cannot nominate themselves."
                  : "This election has no candidates and its roster is now locked."}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    canManage={canManage}
                    isBusy={removeMutation.isPending || editMutation.isPending}
                    onEdit={() => {
                      setEditError({ fields: {}, formError: null });
                      setEditing(candidate);
                    }}
                    onRemove={() => setRemoving(candidate)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {canManage ? (
            <CandidateAddForm
              election={election}
              attachedUserIds={attachedUserIds}
              isSubmitting={addMutation.isPending}
              fieldErrors={addError.fields}
              formError={addError.formError}
              onDirty={() => setScreenError(null)}
              onSubmit={(payload, onAccepted) =>
                addMutation.mutate({ payload, onAccepted })
              }
            />
          ) : (
            <CandidatesLockedNote status={election.status} />
          )}
        </div>
      </div>

      {editing && (
        <CandidateEditDialog
          candidate={editing}
          isSubmitting={editMutation.isPending}
          fieldErrors={editError.fields}
          formError={editError.formError}
          onCancel={() => setEditing(null)}
          onSubmit={(payload) => editMutation.mutate({ candidateId: editing.id, payload })}
        />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        tone="danger"
        icon={Trash2}
        title={`Remove ${removing?.user?.name ?? "this candidate"} from the ballot?`}
        description={
          <>
            <span className="block">
              This deletes the candidacy along with its manifesto and photo. It is only possible
              while the election is still a draft or scheduled, so no votes can exist for them yet —
              nothing that has been voted on can be removed this way.
            </span>
            <span className="mt-2 block">
              The student keeps their account and can be added again. This cannot be undone.
            </span>
          </>
        }
        confirmLabel="Remove candidate"
        isPending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/**
 * A refusal about the election rather than a field — the roster is locked, or
 * the candidate is already gone. The server's sentence first, the "what now"
 * underneath. It stays until dismissed or superseded, deliberately outliving
 * the refetch it triggers: when the status has just changed under the admin,
 * the explanation for why the add form vanished is the most useful thing here.
 */
function ScreenError({ message, hint, onDismiss }) {
  return (
    <div
      role="alert"
      className="border-error-500/30 bg-error-50 rounded-lg border p-4 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert size={17} className="text-error-600 mt-px shrink-0" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="text-error-700 m-0 text-[13px] font-semibold">{message}</p>
          {hint && <p className="text-muted m-0 mt-1 text-xs leading-[1.5]">{hint}</p>}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="text-error-700/70 hover:text-error-700 flex-none cursor-pointer text-xs font-semibold"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
