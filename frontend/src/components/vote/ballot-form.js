"use client";

import { ArrowRight, EyeOff, Info } from "lucide-react";

import { EmptyState } from "@/components/common/query-states";
import { electionScopeLabel, electionTypeLabel } from "@/utils/election-labels";

import CandidateOption from "./candidate-option";

/**
 * The votable ballot: pick one candidate, then go to review.
 *
 * Picking does NOT cast anything. The only thing this screen's button does is
 * move to the confirmation step — the irreversible action lives there.
 */

export default function BallotForm({
  election,
  candidates,
  selectedCandidateId,
  onSelect,
  onReview,
}) {
  if (candidates.length === 0) {
    return (
      <EmptyState title="No candidates on this ballot yet.">
        The election commission hasn&apos;t added candidates to {election.title} yet. Please check
        back shortly.
      </EmptyState>
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    onReview();
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-up">
      <p className="m-0 mb-2.5 inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2.5 py-1 text-[11.5px] font-bold text-success-700">
        <span
          className="size-1.5 rounded-full bg-success-500 motion-safe:animate-pulse-dot"
          aria-hidden="true"
        />
        Open for voting
      </p>

      <h1 className="font-display text-ink m-0 mb-1 text-[22px] leading-[1.15] font-bold tracking-[-0.02em]">
        {election.title}
      </h1>
      <p className="text-muted m-0 mb-[18px] text-[13.5px]">
        {electionTypeLabel(election.type)} · {electionScopeLabel(election.type)}
      </p>

      <p className="m-0 mb-4 flex items-center gap-2 rounded-md border border-warning-500/40 bg-warning-50 px-3 py-2.5 text-[12.5px] font-semibold text-warning-700">
        <Info size={16} className="shrink-0" aria-hidden="true" />
        Select one candidate. You can only vote once.
      </p>

      <fieldset className="m-0 mb-[18px] border-0 p-0">
        <legend className="sr-only">Choose one candidate for {election.title}</legend>

        <div className="flex flex-col gap-2.5">
          {candidates.map((candidate) => (
            <CandidateOption
              key={candidate.id}
              candidate={candidate}
              checked={selectedCandidateId === candidate.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!selectedCandidateId}
        className="bg-primary-gradient flex w-full cursor-pointer items-center justify-center gap-2 rounded-md py-3.5 text-[15px] font-semibold text-white shadow-glow transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100"
      >
        Review my choice
        <ArrowRight size={18} aria-hidden="true" />
      </button>

      <p className="text-muted m-0 mt-3.5 flex items-center justify-center gap-1.5 text-xs">
        <EyeOff size={14} aria-hidden="true" />
        Your selection stays private until you confirm
      </p>
    </form>
  );
}
