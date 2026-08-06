"use client";

import { ELECTION_STATUS } from "@/utils/election-labels";

/**
 * Which election the switcher is showing.
 *
 * TWO SHAPES, ONE CONTROL. PSU runs seven ballots at most — six faculty leaders
 * and the Gudoomiye seat — so the mockup's segmented row of buttons is the
 * normal case and is what an admin sees. Past a handful it stops being a row and
 * starts being a wrapping mess, so it falls back to a native <select>, which
 * also happens to be the better control on the low-end phones this system has to
 * work on.
 *
 * A live election is marked with a pulsing dot rather than a colour alone, so
 * "which one is open right now" survives both a projector and colour blindness.
 *
 * This control carries NO result. It names elections and says which is open —
 * navigation, not a tally.
 */

/** Above this many elections the buttons become a dropdown. */
const SEGMENTED_LIMIT = 5;

export default function ResultsElectionPicker({ elections, selectedId, onSelect }) {
  if (elections.length > SEGMENTED_LIMIT) {
    return (
      <select
        value={selectedId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        aria-label="Election to show results for"
        className="text-ink max-w-[280px] cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100"
      >
        {elections.map((election) => (
          <option key={election.id} value={election.id}>
            {election.title}
            {election.status === ELECTION_STATUS.OPEN ? " — open now" : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Election to show results for"
      className="flex flex-wrap gap-2"
    >
      {elections.map((election) => {
        const selected = election.id === selectedId;
        const isOpen = election.status === ELECTION_STATUS.OPEN;

        return (
          <button
            key={election.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(election.id)}
            className={`inline-flex max-w-[240px] cursor-pointer items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold transition ${
              selected
                ? "bg-indigo-600 text-white shadow-sm"
                : "border-line border bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {isOpen && (
              <span
                className={`size-1.5 flex-none rounded-full motion-safe:animate-pulse-dot ${
                  selected ? "bg-white" : "bg-success-500"
                }`}
                aria-hidden="true"
              />
            )}

            <span className="truncate">{election.title}</span>
            {isOpen && <span className="sr-only">(open for voting)</span>}
          </button>
        );
      })}
    </div>
  );
}
