"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { ErrorState, LoadingState } from "@/components/common/query-states";
import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { formatDate } from "@/utils/format-date";
import { queryKeys } from "@/utils/query-keys";
import { fetchStudent, setStudentActive } from "@/utils/students-api";

import ConfirmDialog from "../confirm-dialog";
import PageHeader from "../page-header";
import StudentAvatar from "./student-avatar";
import StudentEditForm from "./student-edit-form";
import StudentStatusBadge from "./student-status-badge";

/**
 * One student: GET /students/:id, plus the activation toggle. Editing lives in
 * <StudentEditForm>, keyed on the record's `updatedAt` so a save reseeds it.
 *
 * DEACTIVATION IS REVERSIBLE. The backend exposes both
 * PATCH /students/:id/deactivate and PATCH /students/:id/reactivate
 * (backend/src/routes/student-routes.js), and the controller is explicit that
 * the state is soft on purpose: hard-deleting a student would orphan the
 * VoteReceipt rows that prove the election ran correctly. Both calls are
 * idempotent and answer { student, changed } — `changed: false` meaning the
 * record was already in that state.
 *
 * So this screen offers a toggle in both directions — but still behind a
 * confirmation, because deactivating removes someone from the electorate.
 */

export default function StudentDetailPage({ studentId }) {
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const studentQuery = useQuery({
    queryKey: queryKeys.student(studentId),
    queryFn: () => fetchStudent(studentId),
  });

  const student = studentQuery.data;

  const activationMutation = useMutation({
    mutationFn: (nextActive) => setStudentActive(studentId, nextActive),
    onSuccess: (result) => {
      // The activation endpoints return the student WITHOUT the nested faculty
      // the detail query carries, so the cached record is patched rather than
      // replaced — otherwise the faculty name would vanish from the header
      // until the next refetch.
      queryClient.setQueryData(queryKeys.student(studentId), (current) => ({
        ...current,
        ...result.student,
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.students });
      setConfirmOpen(false);

      const name = result.student?.name ?? "Student";

      // `changed: false` means someone else got there first. Saying "already"
      // is more honest than claiming to have done something.
      if (result.student?.isActive) {
        toast.success(result.changed ? `${name} reactivated` : `${name} was already active`);
      } else {
        toast.success(result.changed ? `${name} deactivated` : `${name} was already inactive`);
      }
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error(apiErrorMessage(error, "That didn't work. Please try again."));
    },
  });

  if (studentQuery.isPending) {
    return (
      <>
        <PageHeader title="Student" backHref="/adminstration/students" backLabel="Students" />
        <div className="px-4 py-6 min-[920px]:px-7">
          <LoadingState label="Loading student" />
        </div>
      </>
    );
  }

  if (studentQuery.isError) {
    const notFound = apiErrorCode(studentQuery.error) === "STUDENT_NOT_FOUND";

    return (
      <>
        <PageHeader title="Student" backHref="/adminstration/students" backLabel="Students" />

        <div className="px-4 py-6 min-[920px]:px-7">
          {notFound ? (
            <div className="border-line bg-surface mx-auto max-w-[520px] rounded-lg border p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <CircleAlert size={26} aria-hidden="true" />
              </div>
              <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
                That student no longer exists
              </h2>
              <p className="text-muted m-0 mb-5 text-[13.5px]">
                The record may have been removed, or the link is out of date.
              </p>
              <Link
                href="/adminstration/students"
                className="inline-flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Back to students
              </Link>
            </div>
          ) : (
            <ErrorState
              error={studentQuery.error}
              onRetry={() => studentQuery.refetch()}
              isRetrying={studentQuery.isFetching}
            />
          )}
        </div>
      </>
    );
  }

  const isToggling = activationMutation.isPending;
  const nextActive = !student.isActive;

  return (
    <>
      <PageHeader
        title="Edit student"
        subtitle={`Joined the roll ${formatDate(student.createdAt)}`}
        backHref="/adminstration/students"
        backLabel="Students"
      />

      <div className="px-4 py-6 min-[920px]:px-7">
        <div className="max-w-[620px]">
          <div className="border-line bg-surface mb-4 flex items-center gap-3.5 rounded-lg border p-4 shadow-sm">
            <StudentAvatar name={student.name} isActive={student.isActive} size={46} />

            <div className="min-w-0 flex-1">
              <p className="text-ink m-0 truncate text-[15px] font-bold">{student.name}</p>
              <p className="text-muted m-0 truncate text-[12.5px]">
                {student.studentId} · {student.faculty?.name || "No faculty"}
              </p>
            </div>

            <StudentStatusBadge isActive={student.isActive} />
          </div>

          <StudentEditForm key={`${student.id}:${student.updatedAt}`} student={student}>
            <ActivationPanel
              isActive={student.isActive}
              isPending={isToggling}
              onClick={() => setConfirmOpen(true)}
            />
          </StudentEditForm>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone={nextActive ? "primary" : "danger"}
        icon={nextActive ? RotateCcw : Ban}
        title={nextActive ? `Reactivate ${student.name}?` : `Deactivate ${student.name}?`}
        description={
          nextActive
            ? "They will be able to sign in again and vote in any election they are eligible for."
            : "They will not be able to sign in or vote in any election, and any signed-in session ends at the next refresh. Their record and voting history are kept, and you can reactivate them here at any time."
        }
        confirmLabel={nextActive ? "Reactivate student" : "Deactivate student"}
        isPending={isToggling}
        onConfirm={() => activationMutation.mutate(nextActive)}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function ActivationPanel({ isActive, isPending, onClick }) {
  return (
    <div
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4 ${
        isActive ? "border-error-500/30 bg-error-50" : "border-line bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <p className={`m-0 text-[13.5px] font-bold ${isActive ? "text-error-700" : "text-ink"}`}>
          {isActive ? "Deactivate student" : "Student is deactivated"}
        </p>
        <p className={`m-0 mt-0.5 text-xs ${isActive ? "text-error-700/80" : "text-muted"}`}>
          {isActive
            ? "Blocks sign-in and voting. Reversible."
            : "They cannot sign in or vote until reactivated."}
        </p>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-[9px] border bg-white px-3.5 py-2.5 text-[12.5px] font-semibold transition disabled:opacity-60 ${
          isActive
            ? "border-error-500/30 text-error-700 hover:bg-error-50"
            : "border-success-500/40 text-success-700 hover:bg-success-50"
        }`}
      >
        {isPending ? (
          <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
        ) : isActive ? (
          <Ban size={15} aria-hidden="true" />
        ) : (
          <RotateCcw size={15} aria-hidden="true" />
        )}
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
