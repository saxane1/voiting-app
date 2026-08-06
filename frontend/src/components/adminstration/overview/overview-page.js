"use client";

import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";

import { useAdminOverview } from "@/hooks/use-admin-overview";

import PageHeader from "../page-header";
import LiveElectionsCard from "./live-elections-card";
import MonitoringCard from "./monitoring-card";
import QuickActionsCard from "./quick-actions-card";
import StatTiles from "./stat-tiles";

/**
 * Election Overview — the commission's landing screen (roleHome("ADMIN")).
 *
 * The ADMIN gate and the chrome come from app/adminstration/layout.js, so
 * nothing here re-guards anything; a STUDENT or AUDITOR who follows a link to
 * /adminstration is redirected by <RequireRole> before this component renders.
 *
 * WHAT THIS SCREEN MAY SHOW. Counts and turnout, and nothing else. It is the
 * one admin screen that opens itself — every sign-in lands here, and it may sit
 * projected in a commission room — so it holds only figures that are safe to be
 * seen by whoever is in that room: how many elections are open, how large the
 * roll is, how many ballots have been cast in total, and what share of the
 * frozen electorate has participated. Who is ahead in a live race is not on it,
 * is not fetched for it, and never will be: results are admin-only, viewed
 * deliberately behind an audited endpoint, and the university announces the
 * official outcome outside this system (Project-Context §9).
 *
 * WHAT IS LIVE AND WHAT IS NOT. The two election lists and the roll count poll
 * once a minute — none of those reads is audited. Turnout is NOT polled and the
 * screen does not pretend otherwise: those figures carry an "as of" stamp, and
 * the refresh control re-reads everything on demand. The reasoning is in
 * hooks/use-admin-overview.js; the short version is that GET /turnout writes an
 * audit row per call, and a background timer would drown the log it belongs to.
 * The genuinely live view is the F7 results dashboard, one click away.
 */

export default function OverviewPage() {
  const {
    openElections,
    scheduledElections,
    activeCount,
    studentCount,
    openQuery,
    scheduledQuery,
    rollQuery,
    turnout,
    isFetching,
    refresh,
  } = useAdminOverview();

  const listPending = openQuery.isPending || scheduledQuery.isPending;
  const listError = openQuery.isError || scheduledQuery.isError;

  // Three-valued: null until the open-elections count is actually known, so the
  // tiles that depend on it can hold their tongue rather than assert "none".
  const hasOpenElections = activeCount === null ? null : activeCount > 0;

  return (
    <>
      <PageHeader title="Election Overview" subtitle={subtitle(openQuery.isSuccess, activeCount)}>
        <button
          type="button"
          onClick={refresh}
          disabled={isFetching}
          className="text-muted hover:text-ink inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? (
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Refresh
        </button>

        <Link
          href="/adminstration/elections/new"
          className="bg-primary-gradient inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition hover:brightness-105 hover:text-white"
        >
          <Plus size={17} aria-hidden="true" />
          New election
        </Link>
      </PageHeader>

      <div className="px-4 py-6 min-[920px]:px-7">
        <StatTiles
          activeCount={activeCount}
          studentCount={studentCount}
          turnout={turnout}
          hasOpenElections={hasOpenElections}
          openQuery={openQuery}
          rollQuery={rollQuery}
          onRetry={refresh}
        />

        {/* `min-w-0` on both children is load-bearing, not tidiness. A grid
            track's default `min-width: auto` refuses to shrink below its
            content's min-content width, and <ElectionWindow> inside the live
            list is whitespace-nowrap — so at 390px the single-column track sat
            at 522px and scrolled the whole page sideways by 166px. Overriding
            the floor lets the track take the viewport's width and the text wrap
            inside it. */}
        <div className="mt-5 grid items-start gap-5 min-[1100px]:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <LiveElectionsCard
              openElections={openElections}
              scheduledElections={scheduledElections}
              isPending={listPending}
              isError={listError}
              error={openQuery.error ?? scheduledQuery.error}
              onRetry={refresh}
              isRetrying={isFetching}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <MonitoringCard hasOpenElections={hasOpenElections} />
            <QuickActionsCard />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * "Monday, 4 August 2026 · 2 elections open".
 *
 * Rendered only once the elections query has answered, which never happens
 * during the server pass — so the formatted date, which depends on the viewer's
 * locale and timezone, has no server-rendered counterpart to mismatch during
 * hydration.
 */
function subtitle(isSuccess, activeCount) {
  if (!isSuccess) return "PSU Election Commission";

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  if (!activeCount) return `${today} · no voting window open`;

  return `${today} · ${activeCount} ${activeCount === 1 ? "election" : "elections"} open for voting`;
}
