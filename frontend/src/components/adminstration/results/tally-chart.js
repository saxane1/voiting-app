"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";

/**
 * The tally as a horizontal bar chart.
 *
 * PURELY DECORATIVE, and marked `aria-hidden`. The numbers themselves live in
 * <TallyTable>, which is a real <table> next to this. That split is deliberate:
 * a chart-only result is unreadable to a screen reader and unusable as a thesis
 * figure, so the chart is the glance and the table is the record. Neither is
 * optional and the chart is never shown alone.
 *
 * Bars run horizontally because candidate names are long and Somali names wrap
 * badly under a vertical axis.
 *
 * Colours are the design tokens' indigo ramp (frontend/design/psu-tokens.css),
 * read as literals because recharts renders SVG fills and cannot take a
 * Tailwind class. The leader — or every candidate tied for the lead — is the
 * stronger indigo. That is emphasis, NOT a declaration of a winner: this system
 * reports numbers and the university announces the official result
 * (Project-Context §9).
 *
 * Aggregate only. Each datum is a candidate and a count; there is no ballot,
 * voter or timestamp anywhere in this component's input.
 */

const COLOR = {
  /* --color-indigo-600 */
  leader: "#4f46e5",
  /* --color-indigo-400 */
  other: "#818cf8",
  /* slate-200 — a candidate with no votes still gets a visible row */
  zero: "#e2e8f0",
  /* --color-line-ish slate-400, for axis text */
  axis: "#94a3b8",
};

const ROW_HEIGHT = 46;
const MIN_HEIGHT = 140;

export default function TallyChart({ tallies }) {
  const max = Math.max(0, ...tallies.map((row) => row.voteCount));

  // recharts needs plain data objects; `name` is the axis label and `voteCount`
  // the bar length. Nothing else is passed in.
  const data = tallies.map((row) => ({
    name: row.name,
    voteCount: row.voteCount,
    fill: row.voteCount === 0 ? COLOR.zero : row.voteCount === max ? COLOR.leader : COLOR.other,
  }));

  const height = Math.max(MIN_HEIGHT, data.length * ROW_HEIGHT + 24);

  return (
    <div aria-hidden="true" style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
          barCategoryGap="22%"
        >
          <XAxis type="number" hide domain={[0, Math.max(1, max)]} />

          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tickLine={false}
            axisLine={false}
            tick={{ fill: COLOR.axis, fontSize: 12 }}
          />

          <Bar
            dataKey="voteCount"
            radius={[0, 6, 6, 0]}
            isAnimationActive={false}
            label={{ position: "right", fill: "#1e1b4b", fontSize: 12, fontWeight: 700 }}
          >
            {data.map((row) => (
              <Cell key={row.name} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
