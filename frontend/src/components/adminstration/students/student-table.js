"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";

import StudentAvatar from "./student-avatar";
import StudentStatusBadge from "./student-status-badge";

/**
 * The roll as a table — the desktop view, where an admin is comparing rows.
 * Below 900px <StudentCards> renders the same data instead; see students-page.
 *
 * Each row carries `faculty: { id, name, code }` from the API, so the faculty
 * column needs no lookup: the code is shown, with the full name on hover.
 */

const HEAD_CELL =
  "px-4 py-3 text-left text-[11.5px] font-bold tracking-[.04em] text-slate-500 uppercase";

export default function StudentTable({ students }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-slate-50">
          <th className={`${HEAD_CELL} pl-5`}>Student</th>
          <th className={HEAD_CELL}>Student ID</th>
          <th className={HEAD_CELL}>Faculty</th>
          <th className={HEAD_CELL}>Status</th>
          <th className={`${HEAD_CELL} pr-5`}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {students.map((student) => (
          <tr key={student.id} className="border-line border-t transition hover:bg-indigo-50/50">
            <td className="py-3 pr-4 pl-5">
              <div className="flex items-center gap-[11px]">
                <StudentAvatar name={student.name} isActive={student.isActive} />
                <div className="min-w-0">
                  <Link
                    href={`/adminstration/students/${student.id}`}
                    className="text-ink block truncate text-[13.5px] font-semibold hover:text-indigo-700"
                  >
                    {student.name}
                  </Link>
                  <span className="text-muted block truncate text-xs">{student.email}</span>
                </div>
              </div>
            </td>

            <td className="font-display px-4 py-3 text-[13px] whitespace-nowrap text-slate-600">
              {student.studentId}
            </td>

            <td className="px-4 py-3">
              <span
                title={student.faculty?.name}
                className="rounded-sm bg-slate-100 px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-slate-600"
              >
                {student.faculty?.code || student.faculty?.name || "—"}
              </span>
            </td>

            <td className="px-4 py-3">
              <StudentStatusBadge isActive={student.isActive} />
            </td>

            <td className="py-3 pr-5 pl-4 text-right">
              <Link
                href={`/adminstration/students/${student.id}`}
                aria-label={`Edit ${student.name}`}
                className="border-line inline-grid size-8 place-items-center rounded-lg border bg-slate-50 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Pencil size={15} aria-hidden="true" />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
