"use client";

import { CircleCheck, Info, UsersRound } from "lucide-react";
import Link from "next/link";

import { MIN_CANDIDATES_TO_OPEN, openReadiness } from "@/utils/candidate-rules";
import { ELECTION_STATUS } from "@/utils/election-labels";

/**
 * Whether this election has enough candidates for F5 to open it.
 *
 * A SIGNAL, NOT A GATE. `/open` refuses below two candidates with
 * 409 INSUFFICIENT_CANDIDATES, and that refusal stays the server's to make —
 * nothing here disables anything, and there is deliberately no Open button on
 * this screen. Opening belongs to the lifecycle panel on the election detail
 * page, which is where the confirmation, the window check and the electorate
 * freeze all live. This just answers "have I done enough here yet?" and points
 * at the place that decides.
 *
 * Once an election has already opened the question is settled, so the panel
 * stops asking it and simply states the roster is final.
 */

export default function CandidateReadiness({ election, count }) {
  const { ready, remaining } = openReadiness(count);
  const isDraft =
    election.status === ELECTION_STATUS.DRAFT || election.status === ELECTION_STATUS.SCHEDULED;

  if (!isDraft) {
    return (
      <section className="border-line bg-surface flex items-start gap-3 rounded-lg border p-4 shadow-sm">
        <span className="grid size-10 flex-none place-items-center rounded-[10px] bg-slate-100 text-slate-500">
          <UsersRound size={19} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="text-ink m-0 text-[13.5px] font-semibold">
            {count} {count === 1 ? "candidate" : "candidates"} on this ballot
          </p>
          <p className="text-muted m-0 mt-0.5 text-xs leading-[1.5]">
            This roster is final. It is the list every voter in this election sees.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`flex items-start gap-3 rounded-lg border p-4 shadow-sm ${
        ready ? "border-success-500/25 bg-success-50" : "border-line bg-surface"
      }`}
    >
      <span
        className={`grid size-10 flex-none place-items-center rounded-[10px] ${
          ready ? "bg-success-500/15 text-success-700" : "bg-warning-50 text-warning-700"
        }`}
      >
        {ready ? <CircleCheck size={20} aria-hidden="true" /> : <UsersRound size={19} aria-hidden="true" />}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`m-0 text-[13.5px] font-bold ${ready ? "text-success-700" : "text-ink"}`}
        >
          {ready
            ? `Ready to open — ${count} candidates`
            : `${count} of ${MIN_CANDIDATES_TO_OPEN} candidates`}
        </p>

        <p className="text-muted m-0 mt-0.5 text-xs leading-[1.55]">
          {ready ? (
            <>
              This election meets the minimum of {MIN_CANDIDATES_TO_OPEN}. Opening it is done from
              the{" "}
              <Link
                href={`/adminstration/elections/${election.id}`}
                className="font-semibold text-indigo-600 hover:text-indigo-700"
              >
                election&apos;s lifecycle controls
              </Link>
              , where the server makes the final decision.
            </>
          ) : (
            <>
              Add {remaining} more. An uncontested ballot is not an election, so the server refuses
              to open one with fewer than {MIN_CANDIDATES_TO_OPEN} candidates.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/** The reason the roster is read-only, said plainly. */
export function CandidatesLockedNote({ status }) {
  return (
    <p className="text-muted border-line bg-surface m-0 flex items-start gap-2 rounded-lg border p-4 text-[12.5px] leading-[1.55] shadow-sm">
      <Info size={15} className="mt-px shrink-0 text-indigo-500" aria-hidden="true" />
      <span>
        <strong className="text-ink font-semibold">Candidates are locked once voting opens.</strong>{" "}
        This election is {status === ELECTION_STATUS.OPEN ? "open" : status.toLowerCase()}, so no
        candidate can be added, edited or removed — including their manifesto and photo. The ballot
        a voter is looking at must not change underneath them, and the electorate size was frozen
        against this exact roster.
      </span>
    </p>
  );
}
