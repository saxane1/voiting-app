"use client";

import { ArrowLeft, CircleAlert, EyeOff, LoaderCircle, Send, TriangleAlert } from "lucide-react";

import CandidateAvatar from "./candidate-avatar";

/**
 * The mandatory review step. Selecting a candidate on the previous screen does
 * NOT cast anything — this screen exists so the irreversible action is taken
 * deliberately, with the choice restated and the finality spelled out.
 *
 * The submit button is disabled for the whole flight of the mutation, so the
 * vote cannot be double-submitted by an impatient second tap on a slow phone.
 */

export default function VoteConfirm({
  election,
  candidate,
  onBack,
  onConfirm,
  isSubmitting,
  notice,
}) {
  return (
    <div className="animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        disabled={isSubmitting}
        className="text-muted hover:text-ink mb-[18px] inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold transition disabled:opacity-60"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Change my choice
      </button>

      <div className="mb-5 text-center">
        <div className="mx-auto mb-3.5 grid size-14 place-items-center rounded-2xl bg-warning-50 text-warning-700">
          <TriangleAlert size={28} aria-hidden="true" />
        </div>
        <h1 className="font-display text-ink m-0 mb-1.5 text-[23px] font-bold tracking-[-0.02em]">
          Confirm your vote
        </h1>
        <p className="text-muted mx-auto m-0 max-w-[300px] text-sm leading-[1.5]">
          This is final. Once submitted, your vote cannot be changed or withdrawn.
        </p>
      </div>

      <div className="bg-surface mb-2 rounded-xl border-2 border-indigo-200 p-5 shadow-md">
        <p className="m-0 mb-3.5 text-[11.5px] font-bold tracking-[0.05em] text-slate-400 uppercase">
          You are voting for
        </p>
        <div className="flex items-center gap-3.5">
          <CandidateAvatar name={candidate.name} photoUrl={candidate.photoUrl} size={58} />
          <div className="min-w-0">
            <p className="text-ink m-0 text-lg leading-[1.2] font-bold tracking-[-0.01em]">
              {candidate.name}
            </p>
            <p className="text-muted m-0 mt-0.5 text-[12.5px]">{election.title}</p>
          </div>
        </div>
      </div>

      <p className="m-0 my-4 flex items-center justify-center gap-2 text-[12.5px] font-semibold text-indigo-700">
        <EyeOff size={15} aria-hidden="true" />
        Recorded anonymously · one vote per student
      </p>

      {notice && (
        <div
          role="alert"
          className="animate-fade-up mb-3 flex items-start gap-2 rounded-md bg-error-50 px-3 py-2.5 text-[13px] font-medium text-error-700"
        >
          <CircleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={isSubmitting}
        className="bg-primary-gradient flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md py-[15px] text-[15.5px] font-bold text-white shadow-glow transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle size={19} className="animate-spin" aria-hidden="true" />
            Recording your vote…
          </>
        ) : (
          <>
            <Send size={19} aria-hidden="true" />
            Cast my vote
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={isSubmitting}
        className="mt-2.5 w-full cursor-pointer rounded-md border border-slate-200 bg-transparent py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}
