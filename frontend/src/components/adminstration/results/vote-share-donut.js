"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/**
 * Share of the ballots cast, as the mockup's donut — with the total in the hole.
 *
 * SHARE OF WHAT: of `totalVotes`, the ballots actually cast in this election.
 * NOT of the eligible electorate — that is turnout, a different question, and it
 * has its own tile. Getting those two confused is the single easiest way to
 * misreport an election, so the caption says which one this is.
 *
 * The donut itself is `aria-hidden`, exactly like <TallyChart>: it is the
 * glance. The numbers it draws are all present as text in the legend beneath it
 * and, authoritatively, in <TallyTable>. A screen reader loses nothing here.
 *
 * COLOUR IS IDENTITY, NOT RANK. Slices take a fixed palette by position from the
 * design tokens' indigo/violet/sky ramp. Because the API sorts by count, slice
 * order does track the standing — that is unavoidable in any share chart and is
 * why this component is only ever rendered as part of an ordered tally, never as
 * a verdict. Nothing here is styled as a winner: no gold, no crown, no callout.
 *
 * Aggregate only. Each datum is a candidate name and a count.
 */

/* The token ramp, as literals — recharts renders SVG fills and cannot take a
   Tailwind class. Values from frontend/design/psu-tokens.css. */
const PALETTE = [
  "#4f46e5" /* indigo-600 */,
  "#8b5cf6" /* violet-500 */,
  "#0ea5e9" /* sky-500 */,
  "#818cf8" /* indigo-400 */,
  "#4338ca" /* indigo-700 */,
  "#a5b4fc" /* indigo-300 */,
];

export function shareColor(index) {
  return PALETTE[index % PALETTE.length];
}

export default function VoteShareDonut({ tallies, totalVotes }) {
  const hasVotes = totalVotes > 0;

  // recharts refuses to draw a pie whose values are all zero, and a ring of
  // nothing would be a strange thing to show anyway. Before the first ballot,
  // the empty track and the zero in the middle are the honest picture.
  //
  // Dropping the zero-vote candidates keeps slice index aligned with legend
  // index, because the API sorts by voteCount descending — every candidate on
  // zero is therefore at the tail, so the filter only ever trims from the end.
  const data = hasVotes
    ? tallies.filter((row) => row.voteCount > 0).map((row) => ({
        name: row.name,
        value: row.voteCount,
      }))
    : [];

  return (
    <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
      <h2 className="text-ink m-0 text-[15px] font-bold">Vote share</h2>
      <p className="text-muted m-0 mt-1 text-[11.5px]">
        Of ballots cast, not of the electorate.
      </p>

      <div className="relative mx-auto mt-4 size-[180px]">
        <div aria-hidden="true" className="size-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* The empty track, so a donut with no votes is still a donut. */}
              <Pie
                data={[{ value: 1 }]}
                dataKey="value"
                innerRadius="70%"
                outerRadius="100%"
                fill="#f1f5f9"
                stroke="none"
                isAnimationActive={false}
              />

              {hasVotes && (
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="70%"
                  outerRadius="100%"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((row, index) => (
                    <Cell key={row.name} fill={shareColor(index)} />
                  ))}
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-ink text-[28px] leading-none font-bold">
            {totalVotes.toLocaleString()}
          </span>
          <span className="text-muted mt-1 text-[11px]">
            {totalVotes === 1 ? "ballot" : "ballots"}
          </span>
        </div>
      </div>

      <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
        {tallies.map((row, index) => {
          const share = hasVotes ? (row.voteCount / totalVotes) * 100 : 0;

          return (
            <li key={row.candidateId} className="flex items-center gap-2">
              <span
                className="size-[11px] flex-none rounded-[3px]"
                style={{ background: row.voteCount > 0 ? shareColor(index) : "#e2e8f0" }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-left text-[12.5px] text-slate-700">
                {row.name}
              </span>
              <span className="text-ink text-[12.5px] font-bold tabular-nums">
                {hasVotes ? `${share.toFixed(1)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
