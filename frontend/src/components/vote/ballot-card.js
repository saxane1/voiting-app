"use client";

import { ArrowRight, CircleCheck, Clock, GraduationCap, Landmark, Lock } from "lucide-react";
import Link from "next/link";

import { BALLOT_STATE, ballotState } from "@/utils/ballot-state";
import {
  ELECTION_TYPE,
  electionScopeLabel,
  electionTypeLabel,
} from "@/utils/election-labels";
import { formatWindow } from "@/utils/format-date";

/**
 * One eligible election on the student dashboard.
 *
 * Every state below reports the student's OWN participation and the election's
 * schedule. None of them reports a count, a standing or a winner — students see
 * no results in this system, not even after voting closes (Project-Context §9).
 */

const PRESENTATION = {
  [BALLOT_STATE.VOTABLE]: {
    stripe: "bg-primary-gradient",
    pill: "bg-success-50 text-success-700",
    dot: "bg-success-500",
    label: "Open for voting",
  },
  [BALLOT_STATE.VOTED]: {
    stripe: "bg-success-500",
    pill: "bg-success-50 text-success-700",
    dot: "bg-success-500",
    label: "You voted",
  },
  [BALLOT_STATE.VOTED_CLOSED]: {
    stripe: "bg-slate-300",
    pill: "bg-success-50 text-success-700",
    dot: "bg-success-500",
    label: "You voted",
  },
  [BALLOT_STATE.NOT_STARTED]: {
    stripe: "bg-warning-500",
    pill: "bg-warning-50 text-warning-700",
    dot: "bg-warning-500",
    label: "Not open yet",
  },
  [BALLOT_STATE.WINDOW_CLOSED]: {
    stripe: "bg-slate-300",
    pill: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    label: "Voting closed",
  },
  [BALLOT_STATE.NOT_OPEN]: {
    stripe: "bg-slate-300",
    pill: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    label: "Voting closed",
  },
};

export default function BallotCard({ ballot }) {
  const state = ballotState(ballot);
  const presentation = PRESENTATION[state] ?? PRESENTATION[BALLOT_STATE.NOT_OPEN];
  const isUniversity = ballot.type === ELECTION_TYPE.UNIVERSITY;
  const TypeIcon = isUniversity ? Landmark : GraduationCap;

  return (
    <article className="border-line bg-surface relative overflow-hidden rounded-xl border p-4 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${presentation.stripe}`} aria-hidden="true" />

      <div className="mb-3 flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-[11px]">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              isUniversity ? "bg-violet-500/10 text-violet-500" : "bg-indigo-50 text-indigo-600"
            }`}
          >
            <TypeIcon size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-ink m-0 text-[15px] leading-[1.25] font-bold tracking-[-0.01em]">
              {ballot.title}
            </h3>
            <p className="text-muted m-0 mt-0.5 text-xs">
              {electionTypeLabel(ballot.type)} · {electionScopeLabel(ballot.type)}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${presentation.pill}`}
        >
          <span className={`size-1.5 rounded-full ${presentation.dot}`} aria-hidden="true" />
          {presentation.label}
        </span>
      </div>

      <p className="text-muted m-0 mb-3.5 flex items-center gap-2 text-xs">
        <Clock size={14} className="shrink-0" aria-hidden="true" />
        {formatWindow(ballot)}
      </p>

      <BallotAction ballot={ballot} state={state} />
    </article>
  );
}

function BallotAction({ ballot, state }) {
  if (state === BALLOT_STATE.VOTABLE) {
    return (
      <Link
        href={`/vote/${ballot.id}`}
        className="bg-primary-gradient flex w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-105 active:translate-y-px"
      >
        Vote now
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    );
  }

  if (state === BALLOT_STATE.VOTED) {
    return (
      <StatusStrip tone="success" icon={CircleCheck}>
        You voted. Your ballot was recorded anonymously.
      </StatusStrip>
    );
  }

  if (state === BALLOT_STATE.VOTED_CLOSED) {
    return (
      <StatusStrip tone="success" icon={CircleCheck}>
        You voted · Voting closed. Results are announced by the university.
      </StatusStrip>
    );
  }

  if (state === BALLOT_STATE.NOT_STARTED) {
    return (
      <StatusStrip tone="warning" icon={Clock}>
        Voting hasn&apos;t started yet. Come back when it opens.
      </StatusStrip>
    );
  }

  return (
    <StatusStrip tone="neutral" icon={Lock}>
      Voting closed. Results are announced by the university.
    </StatusStrip>
  );
}

const STRIP_TONES = {
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  neutral: "bg-slate-100 text-slate-600",
};

function StatusStrip({ tone, icon: Icon, children }) {
  return (
    <p
      className={`m-0 flex items-center gap-2 rounded-md px-3 py-2.5 text-[12.5px] font-semibold ${STRIP_TONES[tone]}`}
    >
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
