import { ArrowRight, Info, UsersRound } from "lucide-react";
import Link from "next/link";

import { initialsOf } from "@/utils/initials";

/**
 * The election's candidates, read-only.
 *
 * GET /elections/:id embeds them — `candidates[{ id, manifesto, photoUrl,
 * createdAt, user{ id, name, studentId } }]` — so they are shown here for
 * context, because whether an election has 2 of them decides whether it can
 * open at all. Adding and removing them is F6's job, not this screen's: there
 * is deliberately no affordance to change anything here, only the link that
 * leads to the roster screen that can.
 */

export default function ElectionCandidatesCard({ electionId, candidates = [] }) {
  return (
    <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink m-0 text-[15px] font-bold">Candidates ({candidates.length})</h2>

        <Link
          href={`/adminstration/elections/${electionId}/candidates`}
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[12.5px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          Manage candidates
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {candidates.length === 0 ? (
        <p className="text-muted m-0 flex items-start gap-2 text-[13px] leading-[1.55]">
          <Info size={16} className="mt-px shrink-0 text-indigo-500" aria-hidden="true" />
          No candidates yet. An election needs at least 2 before the server will let it open.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="border-line flex items-center gap-3 rounded-md border p-3"
            >
              <span
                className="bg-brand-gradient font-display grid size-[42px] flex-none place-items-center rounded-xl text-sm font-bold text-white"
                aria-hidden="true"
              >
                {initialsOf(candidate.user?.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink m-0 truncate text-[13.5px] font-semibold">
                  {candidate.user?.name ?? "Unknown student"}
                </p>
                <p className="text-muted m-0 truncate text-xs">
                  {candidate.user?.studentId}
                  {candidate.manifesto ? ` · ${candidate.manifesto}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {candidates.length === 1 && (
        <p className="text-warning-700 bg-warning-50 m-0 mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs font-medium">
          <UsersRound size={15} className="mt-px shrink-0" aria-hidden="true" />
          One candidate is not a contest. The server refuses to open an election with fewer than
          two.
        </p>
      )}
    </section>
  );
}
