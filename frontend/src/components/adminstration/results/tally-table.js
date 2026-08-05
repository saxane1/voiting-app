"use client";

import CandidateAvatar from "@/components/vote/candidate-avatar";

/**
 * The tally as numbers — the accessible equivalent of <TallyChart>, and the
 * thing a thesis appendix can actually quote.
 *
 * A real <table> with a caption and scoped headers, so a screen reader gets the
 * result as data rather than as an unlabelled picture. The chart beside it is
 * `aria-hidden`; this is the authoritative rendering of the same numbers.
 *
 * Share-of-vote is computed against `totalVotes` (ballots cast), NOT against
 * the eligible electorate — those are different questions and turnout answers
 * the other one.
 *
 * Aggregate only: one row per candidate, one count each. No ballot, no voter,
 * no ordering information about individual votes.
 */

const HEAD_CELL =
  "px-4 py-2.5 text-left text-[11.5px] font-bold tracking-[.04em] text-slate-500 uppercase";

export default function TallyTable({ tallies, totalVotes = 0 }) {
  const max = Math.max(0, ...tallies.map((row) => row.voteCount));

  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">
        Vote count per candidate. {totalVotes} ballots cast in total.
      </caption>

      <thead>
        <tr className="bg-slate-50">
          <th scope="col" className={`${HEAD_CELL} pl-5`}>
            Candidate
          </th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>
            Votes
          </th>
          <th scope="col" className={`${HEAD_CELL} pr-5 text-right`}>
            Share
          </th>
        </tr>
      </thead>

      <tbody>
        {tallies.map((row) => {
          const share = totalVotes > 0 ? (row.voteCount / totalVotes) * 100 : 0;
          const isLeader = row.voteCount === max && max > 0;

          return (
            <tr key={row.candidateId} className="border-line border-t">
              <th scope="row" className="py-2.5 pr-4 pl-5 text-left font-normal">
                <div className="flex items-center gap-2.5">
                  <CandidateAvatar name={row.name} photoUrl={row.photoUrl} size={32} />
                  <span
                    className={`truncate text-[13.5px] ${
                      isLeader ? "text-ink font-bold" : "text-ink font-semibold"
                    }`}
                  >
                    {row.name}
                  </span>
                </div>
              </th>

              <td
                className={`font-display px-4 py-2.5 text-right text-[15px] tabular-nums ${
                  isLeader ? "text-indigo-700" : "text-ink"
                } font-bold`}
              >
                {row.voteCount.toLocaleString()}
              </td>

              <td className="text-muted px-4 py-2.5 pr-5 text-right text-[13px] tabular-nums">
                {totalVotes > 0 ? `${share.toFixed(1)}%` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>

      <tfoot>
        <tr className="border-line border-t bg-slate-50">
          <th scope="row" className="text-muted py-2.5 pr-4 pl-5 text-left text-[12.5px] font-semibold">
            Total ballots cast
          </th>
          <td className="font-display text-ink px-4 py-2.5 text-right text-[15px] font-bold tabular-nums">
            {totalVotes.toLocaleString()}
          </td>
          <td className="px-4 py-2.5 pr-5" />
        </tr>
      </tfoot>
    </table>
  );
}
