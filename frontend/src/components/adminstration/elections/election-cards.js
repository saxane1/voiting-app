"use client";

import { Building2, ChevronRight, GraduationCap } from "lucide-react";
import Link from "next/link";

import { ELECTION_TYPE, electionScopeText } from "@/utils/election-labels";

import ElectionStatusBadge from "./election-status-badge";
import ElectionWindow from "./election-window";

/**
 * The same elections as <ElectionTable>, for narrow screens: the window is the
 * widest column and it wraps badly in a table on a phone, so each election
 * becomes a card whose whole surface opens it.
 */

export default function ElectionCards({ elections }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {elections.map((election) => {
        const Icon = election.type === ELECTION_TYPE.UNIVERSITY ? GraduationCap : Building2;

        return (
          <li key={election.id}>
            <Link
              href={`/adminstration/elections/${election.id}`}
              className="border-line bg-surface flex items-center gap-3 rounded-lg border p-3.5 shadow-xs transition hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <span className="grid size-10 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
                <Icon size={19} aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-ink m-0 truncate text-[13.5px] font-semibold">
                    {election.title}
                  </p>
                  <ElectionStatusBadge status={election.status} />
                </div>

                <p className="text-muted m-0 mt-0.5 truncate text-xs">
                  {electionScopeText(election)}
                </p>

                <p className="text-muted m-0 mt-1 overflow-x-auto text-[11.5px]">
                  <ElectionWindow startAt={election.startAt} endAt={election.endAt} />
                </p>
              </div>

              <ChevronRight size={18} className="flex-none text-slate-400" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
