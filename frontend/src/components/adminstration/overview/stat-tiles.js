"use client";

import { ChartColumn, CircleCheck, TriangleAlert, Users, Vote } from "lucide-react";

import { formatDateTime } from "@/utils/format-date";

import OverviewShimmer from "./overview-shimmer";

/**
 * The four figures at the top of the commission's overview.
 *
 * EVERY ONE IS LIVE. The prototype's mock numbers (2,326 ballots against 12
 * students — impossible when one person casts one vote per election) are not
 * reproduced anywhere: each tile below renders either a value that came back
 * from an endpoint this minute, a skeleton, or an honest dash. There is no
 * fallback figure and no default of 0, because a tile that shows 0 when it
 * actually knows nothing is a lie an admin has no way to catch.
 *
 * THE TWO TURNOUT-DERIVED TILES ARE ALL-OR-NOTHING. "Ballots cast" sums across
 * every open election; if one of those reads is still in flight or has failed,
 * the tile says so instead of showing a partial sum that reads like a total.
 *
 * NOTHING HERE IS A RESULT. Counts of ballots and percentages of turnout say how
 * many people voted, never how anyone voted or who is ahead. Per-candidate
 * numbers live behind the F7 results screen, whose every view is audited
 * (Project-Context §8 and §9).
 */

/** Each tile reports its OWN source: a failed roll read must not blank out a
 *  turnout figure that came back perfectly well, and vice versa. */
function tileState({ isPending, isError }) {
  return isPending ? "loading" : isError ? "error" : "ready";
}

export default function StatTiles({
  activeCount,
  studentCount,
  turnout,
  hasOpenElections,
  openQuery,
  rollQuery,
  onRetry,
}) {
  return (
    <div className="grid gap-3.5 min-[560px]:grid-cols-2 min-[1200px]:grid-cols-4">
      <StatTile
        tone="brand"
        icon={Vote}
        label="Active elections"
        pulse
        state={tileState(openQuery)}
        onRetry={onRetry}
        value={activeCount === null ? null : activeCount.toLocaleString()}
        hint={
          activeCount === 0 ? "No voting window is open" : "Open for voting right now"
        }
      />

      <StatTile
        icon={Users}
        label="Registered students"
        state={tileState(rollQuery)}
        onRetry={onRetry}
        value={studentCount === null ? null : studentCount.toLocaleString()}
        hint={
          studentCount === 0
            ? "The roll is empty — add students to begin"
            : "On the voter roll, active and deactivated"
        }
      />

      <TurnoutDerivedTile
        icon={CircleCheck}
        label="Ballots cast"
        accent="text-success-600"
        hasOpenElections={hasOpenElections}
        turnout={turnout}
        openError={openQuery.isError}
        onRetry={onRetry}
        value={turnout.ballotsCast === null ? null : turnout.ballotsCast.toLocaleString()}
        hint="Across every open election"
      />

      <TurnoutDerivedTile
        icon={ChartColumn}
        label="Avg. turnout"
        hasOpenElections={hasOpenElections}
        turnout={turnout}
        openError={openQuery.isError}
        onRetry={onRetry}
        value={turnout.avgTurnoutPct === null ? null : `${turnout.avgTurnoutPct}%`}
        hint={turnoutHint(turnout)}
      />
    </div>
  );
}

/**
 * The line under the turnout percentage — and it must not say anything about the
 * world until the reads have landed.
 *
 * `measuredCount` is 0 while the per-election turnout queries are still in
 * flight, exactly as it is when they have all come back saying no election has a
 * frozen electorate. Keying the wording on the count alone therefore printed
 * "No open election has a frozen electorate" underneath a loading skeleton, on a
 * page whose own header was simultaneously announcing "2 elections open for
 * voting". The tile flatly contradicted the page, and then corrected itself a
 * moment later — which is the same failure the three-valued `hasOpenElections`
 * fixed one level up, reappearing one level down.
 *
 * So the claim is gated on the SAME completeness flag the value already uses.
 * Until then the hint is a description of what is being computed, not a finding
 * about it.
 */
function turnoutHint(turnout) {
  if (!turnout.isComplete) return "Mean across open elections";

  if (turnout.measuredCount === 0) return "No open election has a frozen electorate";

  return `Mean of ${turnout.measuredCount} open ${
    turnout.measuredCount === 1 ? "election" : "elections"
  }`;
}

/**
 * "Ballots cast" and "Avg. turnout" are both undefined — not zero — when nothing
 * is open. There is no denominator, no numerator and no question being answered,
 * so both show a dash and say why. A green 0% under "turnout" on a day with no
 * election reads as catastrophic apathy rather than as an empty calendar.
 *
 * `hasOpenElections` is deliberately THREE-valued: null while the open-elections
 * query is still in flight. "No open elections" is a claim about the world, and
 * this tile must not make it before it has been told — a page that flashes "no
 * open elections" on every load is training an admin to distrust the one time it
 * is true.
 */
function TurnoutDerivedTile({ hasOpenElections, turnout, openError, value, hint, ...rest }) {
  // A failed open-elections read is fatal to both of these too: without the list
  // there is no set to sum over, so "0" would be an answer to nothing.
  if (openError || turnout.isError) {
    return <StatTile {...rest} state="error" />;
  }

  if (hasOpenElections === null) {
    return <StatTile {...rest} state="loading" />;
  }

  if (!hasOpenElections) {
    return <StatTile {...rest} state="ready" value="—" hint="No open elections" muted />;
  }

  return (
    <StatTile
      {...rest}
      state={turnout.isComplete ? "ready" : "loading"}
      value={value}
      hint={hint}
      // These two come from the audited turnout endpoint, which deliberately
      // does not poll (see hooks/use-admin-overview.js). Stamping them stops a
      // figure read twenty minutes ago from passing as the current one.
      asOf={turnout.updatedAt}
    />
  );
}

function StatTile({
  tone = "plain",
  icon: Icon,
  label,
  value,
  hint,
  state,
  accent,
  muted = false,
  pulse = false,
  asOf,
  onRetry,
}) {
  const brand = tone === "brand";

  return (
    <section
      className={`animate-fade-up relative overflow-hidden rounded-lg p-[18px] ${
        brand
          ? "bg-brand-gradient text-white shadow-md"
          : "border-line bg-surface border shadow-xs"
      }`}
    >
      {brand && (
        <Vote
          size={90}
          className="pointer-events-none absolute -top-2.5 -right-2.5 opacity-[.18]"
          aria-hidden="true"
        />
      )}

      <h3
        className={`relative m-0 flex items-center gap-2 text-xs font-semibold ${
          brand ? "font-body text-white/90" : "text-muted font-body"
        }`}
      >
        {pulse ? (
          <span
            className="size-[7px] flex-none rounded-full bg-current motion-safe:animate-pulse-dot"
            aria-hidden="true"
          />
        ) : (
          <Icon size={16} className="flex-none" aria-hidden="true" />
        )}
        {label}
      </h3>

      {state === "loading" ? (
        <>
          <OverviewShimmer
            className="mt-2.5 h-[30px] w-24"
            tone={brand ? "dark" : "light"}
          />
          <span className="sr-only">Loading {label}</span>
        </>
      ) : state === "error" ? (
        <div className="relative mt-2">
          <p
            className={`m-0 flex items-center gap-1.5 text-[12.5px] font-semibold ${
              brand ? "text-white/90" : "text-error-700"
            }`}
          >
            <TriangleAlert size={14} className="flex-none" aria-hidden="true" />
            Couldn&apos;t load
          </p>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`mt-1.5 cursor-pointer text-[12px] font-semibold underline underline-offset-2 ${
                brand ? "text-white" : "text-indigo-600 hover:text-indigo-700"
              }`}
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <p
          className={`font-display relative m-0 mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.02em] ${
            brand ? "text-white" : muted ? "text-slate-400" : (accent ?? "text-ink")
          }`}
        >
          {value}
        </p>
      )}

      {state !== "error" && (
        <p
          className={`relative m-0 mt-1 text-[11.5px] leading-[1.45] ${
            brand ? "text-white/75" : "text-muted"
          }`}
        >
          {hint}
          {asOf && state === "ready" ? ` · as of ${formatDateTime(asOf)}` : ""}
        </p>
      )}
    </section>
  );
}
