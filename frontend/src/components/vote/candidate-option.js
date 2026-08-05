"use client";

import { Check } from "lucide-react";

import CandidateAvatar from "./candidate-avatar";

/**
 * One candidate in the ballot's radio group.
 *
 * Built on a real <input type="radio"> that is visually hidden but still
 * focusable, so arrow-key navigation, screen-reader group semantics and the
 * "one of many" constraint all come from the platform rather than being
 * re-implemented. The whole card is the <label>, which makes the tap target the
 * full row — the point of the exercise on a small phone.
 */

export default function CandidateOption({ candidate, checked, onSelect, disabled }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] p-3.5 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-indigo-100 ${
        checked
          ? "border-indigo-500 bg-indigo-50"
          : "border-line bg-surface hover:border-indigo-200 hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="candidate"
        value={candidate.id}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(candidate.id)}
        className="sr-only"
      />

      <CandidateAvatar name={candidate.name} photoUrl={candidate.photoUrl} />

      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[15px] leading-[1.2] font-bold">{candidate.name}</span>
        {candidate.manifesto && (
          <span className="text-muted mt-1 block text-[12.5px] leading-[1.45]">
            {candidate.manifesto}
          </span>
        )}
      </span>

      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${
          checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
        }`}
        aria-hidden="true"
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
    </label>
  );
}
