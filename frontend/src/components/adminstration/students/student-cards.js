"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import StudentAvatar from "./student-avatar";
import StudentStatusBadge from "./student-status-badge";

/**
 * The same roll as <StudentTable>, for narrow screens.
 *
 * A five-column table on a phone means horizontal scrolling to reach the action
 * in the last column, so below 900px each student becomes a card whose whole
 * surface is the link to their record.
 */

export default function StudentCards({ students }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {students.map((student) => (
        <li key={student.id}>
          <Link
            href={`/adminstration/students/${student.id}`}
            className="border-line bg-surface flex items-center gap-3 rounded-lg border p-3.5 shadow-xs transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            <StudentAvatar name={student.name} isActive={student.isActive} size={40} />

            <div className="min-w-0 flex-1">
              <p className="text-ink m-0 truncate text-[13.5px] font-semibold">{student.name}</p>
              <p className="text-muted m-0 truncate text-xs">{student.email}</p>

              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-display rounded-sm bg-slate-100 px-2 py-[2px] text-[11.5px] text-slate-600">
                  {student.studentId}
                </span>
                <span
                  title={student.faculty?.name}
                  className="rounded-sm bg-slate-100 px-2 py-[2px] text-[11.5px] font-semibold text-slate-600"
                >
                  {student.faculty?.code || student.faculty?.name || "—"}
                </span>
                <StudentStatusBadge isActive={student.isActive} />
              </p>
            </div>

            <ChevronRight size={18} className="flex-none text-slate-400" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
