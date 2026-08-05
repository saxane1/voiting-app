"use client";

import { Building2, CircleAlert, LoaderCircle, Pencil, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";

/**
 * One faculty, as the prototype's faculty card: icon tile + code chip, the
 * name, the enrolled count, then Edit and Delete.
 *
 * DELETE GATING. The backend refuses deletion with 409 FACULTY_IN_USE while any
 * user or election still points at the faculty. The list exposes only
 * `studentCount` (ACTIVE students), so this card can be certain in one
 * direction and not the other:
 *
 *   studentCount > 0  -> the delete is GUARANTEED to be refused, so the button
 *                        is disabled and says why. Offering it would be a
 *                        button whose only possible outcome is an error.
 *   studentCount == 0 -> it MIGHT still be refused, by a deactivated student or
 *                        an attached election, neither of which this count can
 *                        see. So the button is offered, the confirmation says
 *                        as much, and a refusal is surfaced verbatim on the
 *                        card instead of being reported as success.
 */

export default function FacultyCard({ faculty, onDelete, isDeleting = false, blockedMessage }) {
  const enrolled = faculty.studentCount ?? 0;
  const hasStudents = enrolled > 0;

  const blockReason = hasStudents
    ? `${enrolled} ${enrolled === 1 ? "student is" : "students are"} enrolled — move or remove them first`
    : null;

  return (
    <div className="border-line bg-surface flex flex-col rounded-lg border p-5 shadow-sm">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="grid size-[46px] place-items-center rounded-[13px] bg-indigo-50 text-indigo-600">
          <Building2 size={23} aria-hidden="true" />
        </span>

        <span className="font-display rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
          {faculty.code}
        </span>
      </div>

      <h2 className="text-ink m-0 mb-3 text-[15px] leading-[1.25] font-bold tracking-[-0.01em]">
        {faculty.name}
      </h2>

      <p className="text-muted m-0 flex items-center gap-2 text-[12.5px]">
        <UsersRound size={15} aria-hidden="true" />
        {enrolled} {enrolled === 1 ? "student" : "students"} enrolled
      </p>

      {blockedMessage && (
        <p
          role="alert"
          className="bg-error-50 text-error-700 m-0 mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs font-medium"
        >
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {blockedMessage}
        </p>
      )}

      <div className="border-line mt-4 flex items-center gap-2 border-t pt-3.5">
        <Link
          href={`/adminstration/faculties/${faculty.id}/edit`}
          className="inline-flex flex-1 items-center justify-center gap-[7px] rounded-[9px] border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-slate-50 hover:text-indigo-700"
        >
          <Pencil size={15} aria-hidden="true" />
          Edit
        </Link>

        <button
          type="button"
          onClick={() => onDelete(faculty)}
          disabled={hasStudents || isDeleting}
          title={blockReason ?? `Delete ${faculty.name}`}
          aria-label={blockReason ? `Cannot delete ${faculty.name}: ${blockReason}` : `Delete ${faculty.name}`}
          className={`grid size-[38px] flex-none place-items-center rounded-[9px] border transition ${
            hasStudents
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
              : "border-error-500/30 bg-error-50 text-error-600 cursor-pointer hover:brightness-[0.97] disabled:cursor-wait"
          }`}
        >
          {isDeleting ? (
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 size={15} aria-hidden="true" />
          )}
        </button>
      </div>

      {blockReason && (
        <p className="text-muted m-0 mt-2 text-[11.5px] leading-[1.5]">
          Cannot be deleted: {blockReason}.
        </p>
      )}
    </div>
  );
}
