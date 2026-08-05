"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { useFaculties } from "@/hooks/use-faculties";
import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { deleteFaculty } from "@/utils/faculties-api";
import { queryKeys } from "@/utils/query-keys";

import ConfirmDialog from "../confirm-dialog";
import PageHeader from "../page-header";
import FacultyCard from "./faculty-card";

/**
 * The faculties an election can be scoped to — GET /faculties, which returns
 * every one of them in a single `{ faculties: [...] }` payload with no
 * pagination. There are six of them by design (Project-Context §2), so the
 * whole list is rendered as cards rather than a paginated table.
 *
 * The read comes from the SHARED useFaculties() hook that F3's student form,
 * F4's election form and both list filters already use. Managing a faculty here
 * therefore refreshes it everywhere: one invalidation of ["faculties"] after a
 * create, edit or delete updates every faculty select and chip row in the app.
 */

export default function FacultiesPage() {
  const queryClient = useQueryClient();

  const [pendingDelete, setPendingDelete] = useState(null);
  const [blocked, setBlocked] = useState(null);

  const facultiesQuery = useFaculties();
  const faculties = facultiesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (faculty) => deleteFaculty(faculty.id),
    onSuccess: (_data, faculty) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.faculties });
      setPendingDelete(null);
      setBlocked(null);
      toast.success(`${faculty.name} deleted`);
    },
    onError: (error, faculty) => {
      const code = apiErrorCode(error);
      const message = apiErrorMessage(error, "The faculty could not be deleted.");

      setPendingDelete(null);

      // Refetch either way. A refusal means the list on screen disagrees with
      // the server about what is attached — most likely a deactivated student
      // or an election, neither of which `studentCount` can see.
      queryClient.invalidateQueries({ queryKey: queryKeys.faculties });

      if (code === "FACULTY_NOT_FOUND") {
        toast.error("That faculty no longer exists.");
        return;
      }

      // Pinned to the card that was refused, so the reason sits next to the
      // button that produced it rather than vanishing with the toast.
      setBlocked({ id: faculty.id, message });
      toast.error(message);
    },
  });

  return (
    <>
      <PageHeader
        title="Faculties"
        subtitle={
          facultiesQuery.isSuccess
            ? `${faculties.length} ${faculties.length === 1 ? "faculty" : "faculties"} eligible for leadership elections`
            : "The faculties eligible for leadership elections"
        }
      >
        <Link
          href="/adminstration/faculties/new"
          className="bg-primary-gradient shadow-glow inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-105"
        >
          <Plus size={17} aria-hidden="true" />
          Add faculty
        </Link>
      </PageHeader>

      <div className="px-4 py-5 min-[920px]:px-7">
        {facultiesQuery.isPending ? (
          <LoadingState label="Loading faculties" />
        ) : facultiesQuery.isError ? (
          <ErrorState
            error={facultiesQuery.error}
            onRetry={() => facultiesQuery.refetch()}
            isRetrying={facultiesQuery.isFetching}
          />
        ) : faculties.length === 0 ? (
          <div className="border-line bg-surface rounded-lg border shadow-sm">
            <EmptyState title="No faculties yet.">
              Add the university&apos;s faculties here. Every student belongs to one, and each
              faculty elects its own leader.
            </EmptyState>
          </div>
        ) : (
          <div className="grid gap-4 min-[680px]:grid-cols-2 min-[1100px]:grid-cols-3">
            {faculties.map((faculty) => (
              <FacultyCard
                key={faculty.id}
                faculty={faculty}
                onDelete={setPendingDelete}
                isDeleting={
                  deleteMutation.isPending && deleteMutation.variables?.id === faculty.id
                }
                blockedMessage={blocked?.id === faculty.id ? blocked.message : null}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        icon={Trash2}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : ""}
        description={
          <>
            This removes the faculty itself. It cannot be undone.
            <span className="mt-2 block">
              The server refuses the delete if anything is still attached — any student, including
              deactivated ones that the enrolled count above does not show, or any election scoped
              to this faculty. If that happens you will be told exactly what is holding it.
            </span>
          </>
        }
        confirmLabel="Delete faculty"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
