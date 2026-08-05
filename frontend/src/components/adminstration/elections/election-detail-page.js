"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleAlert,
  Info,
  LoaderCircle,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { useNow } from "@/hooks/use-now";
import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { formatDateTime } from "@/utils/format-date";
import {
  ELECTION_TYPE,
  electionScopeText,
  electionStatusAdminLabel,
  electionTypeLabel,
} from "@/utils/election-labels";
import {
  TRANSITION_ERROR_HINTS,
  isDeletable,
  isEditable,
} from "@/utils/election-transitions";
import { deleteElection, fetchElection, runElectionTransition } from "@/utils/elections-api";
import { queryKeys } from "@/utils/query-keys";

import ConfirmDialog from "../confirm-dialog";
import PageHeader from "../page-header";
import ElectionCandidatesCard from "./election-candidates-card";
import ElectionStatusBadge from "./election-status-badge";
import { windowHasEnded } from "./election-window";
import LifecyclePanel, { LifecycleError } from "./lifecycle-panel";

/**
 * One election: its record, its candidates (read-only), and the controls that
 * drive its status.
 *
 * STATUS IS SERVER-OWNED, and this screen is written so that it stays that way:
 *
 *   - The buttons offered come from the mirrored transition map, keyed on the
 *     status the SERVER last reported — never on a status this page assumed.
 *   - After a successful transition, the response's election is written to the
 *     cache AND the whole ["elections"] prefix is invalidated, so both this
 *     screen and the list re-read rather than trusting an optimistic guess.
 *   - After a REFUSED transition, the same refetch happens. That is the case
 *     that matters: a 409 ILLEGAL_STATUS_TRANSITION means the status changed
 *     under us (another tab, another admin), so the buttons must be rebuilt
 *     from the real status instead of leaving a stale one on screen.
 *
 * There are no tallies, turnout figures or vote counts anywhere on this page.
 * `eligibleCount` is returned by the API and deliberately not rendered — it is
 * the turnout denominator and belongs to F7.
 */

export default function ElectionDetailPage({ electionId }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [pendingAction, setPendingAction] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Ticks, so a window that ends while this screen is open starts warning about
  // itself without a reload.
  const now = useNow();

  const electionQuery = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: () => fetchElection(electionId),
  });

  const election = electionQuery.data;

  /** Re-read from the server. Used after every transition, refused or not. */
  function reconcile() {
    queryClient.invalidateQueries({ queryKey: queryKeys.elections });
  }

  const transitionMutation = useMutation({
    mutationFn: (action) => runElectionTransition(electionId, action.path),
    onSuccess: (data, action) => {
      // The response carries the updated election, which IS server truth — but
      // it is still followed by an invalidation so the list and the embedded
      // candidates come back fresh too.
      queryClient.setQueryData(queryKeys.election(electionId), (current) => ({
        ...current,
        ...data.election,
      }));
      reconcile();

      setPendingAction(null);
      setActionError(null);
      toast.success(`Status is now ${electionStatusAdminLabel(data.election.status)}`);
    },
    onError: (error) => {
      const code = apiErrorCode(error);

      setPendingAction(null);

      // Gone entirely — nothing on this screen can be reconciled.
      if (code === "ELECTION_NOT_FOUND") {
        reconcile();
        toast.error("That election no longer exists.");
        router.push("/adminstration/elections");
        return;
      }

      // Refetch FIRST: whatever the reason, the status on screen may now be
      // wrong, and the buttons are derived from it.
      reconcile();

      const message = apiErrorMessage(error, "That transition was refused.");

      // Kept on screen until the admin starts another action or one succeeds.
      // Deliberately NOT cleared by the refetch that follows: when the refusal
      // was ILLEGAL_STATUS_TRANSITION the status is about to change under the
      // admin's feet, and the explanation for why the buttons just rearranged
      // themselves is the most useful thing on the screen.
      setActionError({ message, hint: TRANSITION_ERROR_HINTS[code] ?? null });
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteElection(electionId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.election(electionId) });
      reconcile();
      setConfirmingDelete(false);
      toast.success("Election deleted");
      router.push("/adminstration/elections");
    },
    onError: (error) => {
      setConfirmingDelete(false);
      reconcile();
      toast.error(apiErrorMessage(error, "The election could not be deleted."));
    },
  });

  if (electionQuery.isPending) {
    return (
      <>
        <PageHeader title="Election" backHref="/adminstration/elections" backLabel="Elections" />
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
        <PageHeader title="Election" backHref="/adminstration/elections" backLabel="Elections" />

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
                href="/adminstration/elections"
                className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Back to elections
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
  const canEdit = isEditable(election.status);
  const canDelete = isDeletable(election.status);

  return (
    <>
      <PageHeader
        title={election.title}
        subtitle={`${electionTypeLabel(election.type)} · ${electionScopeText(election)}`}
        backHref="/adminstration/elections"
        backLabel="Elections"
      >
        <ElectionStatusBadge status={election.status} size="lg" />
        {electionQuery.isFetching && (
          <LoaderCircle size={15} className="animate-spin text-indigo-500" aria-hidden="true" />
        )}
      </PageHeader>

      <div className="grid gap-5 px-4 py-6 min-[920px]:px-7 min-[1060px]:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ElectionCandidatesCard electionId={election.id} candidates={candidates} />

          <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
            <h2 className="text-ink m-0 mb-4 text-[15px] font-bold">Details</h2>

            <dl className="m-0 grid gap-4 min-[560px]:grid-cols-2">
              <Detail label="Type">{electionTypeLabel(election.type)}</Detail>
              <Detail label="Scope">
                {election.type === ELECTION_TYPE.UNIVERSITY
                  ? "All students (Gudoomiye)"
                  : (election.faculty?.name ?? "No faculty")}
              </Detail>
              <Detail label="Voting opens">{formatDateTime(election.startAt)}</Detail>
              <Detail label="Voting closes">{formatDateTime(election.endAt)}</Detail>
              <Detail label="Status">{electionStatusAdminLabel(election.status)}</Detail>
              <Detail label="Created">{formatDateTime(election.createdAt)}</Detail>

              {election.resultsPublishedAt && (
                <Detail label="Marked final">{formatDateTime(election.resultsPublishedAt)}</Detail>
              )}
            </dl>

            {windowHasEnded(election.endAt, now) && (
              <p className="text-warning-700 bg-warning-50 m-0 mt-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs font-medium">
                <CalendarClock size={15} className="mt-px shrink-0" aria-hidden="true" />
                The voting window has ended. Voting cannot be opened or restarted until the closing
                time is moved into the future.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <LifecyclePanel
            election={election}
            pendingKey={transitionMutation.isPending ? transitionMutation.variables?.key : null}
            onSelect={(action) => {
              setActionError(null);
              setPendingAction(action);
            }}
          >
            {actionError && (
              <LifecycleError message={actionError.message} hint={actionError.hint} />
            )}
          </LifecyclePanel>

          {canEdit && (
            <Link
              href={`/adminstration/elections/${election.id}/edit`}
              className="border-line bg-surface flex items-center justify-center gap-2 rounded-[10px] border px-4 py-3 text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil size={16} aria-hidden="true" />
              Edit election
            </Link>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="border-error-500/30 bg-error-50 text-error-700 flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 py-3 text-[13.5px] font-semibold transition hover:brightness-[0.98]"
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete election
            </button>
          )}

          {!canEdit && (
            <p className="text-muted m-0 flex items-start gap-2 px-1 text-xs leading-[1.55]">
              <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
              This election has opened, so its title, window and scope are now part of the record
              and can no longer be edited or deleted.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        tone={pendingAction?.tone ?? "primary"}
        icon={pendingAction?.tone === "danger" ? TriangleAlert : Info}
        title={pendingAction ? pendingAction.title(election) : ""}
        description={
          pendingAction && (
            <>
              <span className="block">{pendingAction.description}</span>
              <PreflightWarnings action={pendingAction} election={election} now={now} />
            </>
          )
        }
        confirmLabel={pendingAction?.confirmLabel ?? "Confirm"}
        isPending={transitionMutation.isPending}
        onConfirm={() => transitionMutation.mutate(pendingAction)}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        icon={Trash2}
        title={`Delete "${election.title}"?`}
        description="This permanently removes the election and any candidates attached to it. It is only possible while the election is still a draft, so no votes can exist yet — nothing that has been voted on can be deleted this way. This cannot be undone."
        confirmLabel="Delete election"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

/**
 * What the server is likely to refuse, said BEFORE the admin commits.
 *
 * These mirror the runtime guards in openElection/reopenElection. They are
 * warnings, not blocks: the server remains the authority, and if it refuses
 * anyway the refusal is shown against the button that caused it.
 */
function PreflightWarnings({ action, election, now }) {
  const notes = [];
  const candidateCount = election.candidateCount ?? election.candidates?.length ?? 0;

  if (action.key === "open") {
    if (candidateCount < 2) {
      notes.push(
        `This election has ${candidateCount} candidate${candidateCount === 1 ? "" : "s"}. The server requires at least 2 and will refuse to open it.`
      );
    }

    if (windowHasEnded(election.endAt, now)) {
      notes.push("Its closing time has already passed, so the server will refuse to open it.");
    }
  }

  if (action.key === "reopen" && windowHasEnded(election.endAt, now)) {
    notes.push(
      "Its voting window has already ended, so the server will refuse to reopen it. Reopening is only possible while the window is still live."
    );
  }

  if (notes.length === 0) return null;

  return (
    <span className="text-warning-700 bg-warning-50 mt-3 block rounded-md px-3 py-2.5 text-[12.5px] font-medium">
      {notes.map((note) => (
        <span key={note} className="flex items-start gap-2 [&+span]:mt-1.5">
          <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {note}
        </span>
      ))}
    </span>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="mb-1 text-[11.5px] font-semibold tracking-[.04em] text-slate-400 uppercase">
        {label}
      </dt>
      <dd className="text-ink m-0 text-[13.5px] font-semibold">{children}</dd>
    </div>
  );
}
