"use client";

import { Building2, ChevronRight, GraduationCap } from "lucide-react";
import Link from "next/link";

import { ELECTION_TYPE, electionScopeText } from "@/utils/election-labels";

import ElectionStatusBadge from "./election-status-badge";
import ElectionWindow from "./election-window";

/**
 * The elections table — the desktop view.
 *
 * Deliberately absent: vote counts, turnout, and the frozen `eligibleCount` the
 * API returns on every row. Tallies are F7 and admin-only there; a lifecycle
 * screen has no business showing how a race is going.
 */

const HEAD_CELL =
  "px-4 py-3 text-left text-[11.5px] font-bold tracking-[.04em] text-slate-500 uppercase";

export default function ElectionTable({ elections }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-slate-50">
          <th className={`${HEAD_CELL} pl-5`}>Election</th>
          <th className={HEAD_CELL}>Scope</th>
          <th className={HEAD_CELL}>Voting window</th>
          <th className={HEAD_CELL}>Status</th>
          <th className={`${HEAD_CELL} pr-5`}>
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {elections.map((election) => {
          const isUniversity = election.type === ELECTION_TYPE.UNIVERSITY;
          const Icon = isUniversity ? GraduationCap : Building2;

          return (
            <tr key={election.id} className="border-line border-t transition hover:bg-indigo-50/50">
              <td className="py-3.5 pr-4 pl-5">
                <div className="flex items-center gap-[11px]">
                  <span className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-indigo-50 text-indigo-600">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <Link
                    href={`/adminstration/elections/${election.id}`}
                    className="text-ink truncate text-[13.5px] font-semibold hover:text-indigo-700"
                  >
                    {election.title}
                  </Link>
                </div>
              </td>

              <td className="px-4 py-3.5 text-[13px] text-slate-600">
                {electionScopeText(election)}
              </td>

              <td className="text-muted px-4 py-3.5 text-[12.5px]">
                <ElectionWindow startAt={election.startAt} endAt={election.endAt} />
              </td>

              <td className="px-4 py-3.5">
                <ElectionStatusBadge status={election.status} />
              </td>

              <td className="py-3.5 pr-5 pl-4 text-right">
                <Link
                  href={`/adminstration/elections/${election.id}`}
                  aria-label={`Open ${election.title}`}
                  className="border-line inline-grid size-8 place-items-center rounded-lg border bg-slate-50 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
