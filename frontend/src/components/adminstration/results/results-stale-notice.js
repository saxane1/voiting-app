"use client";

import { CircleAlert } from "lucide-react";

import { apiErrorMessage } from "@/utils/api-error";

/**
 * The numbers on screen are real but they stopped updating.
 *
 * WHY THIS IS ITS OWN STATE. React Query keeps the last successful `data` when a
 * REFETCH fails — @tanstack/query-core sets `status: "error"` while spreading
 * the previous state forward, so `isError` and `data` are true at the same time.
 * Treating that as a plain error throws away a perfectly good tally and blanks a
 * dashboard mid-election; treating it as success leaves dead numbers sitting
 * under a "Live" badge. Neither is acceptable on the one screen a commission
 * watches while ballots arrive, so it gets a third state: keep the figures,
 * strip every live affordance, and say plainly that they may be behind.
 *
 * Shown by BOTH results screens (the switcher and the detail dashboard), which
 * is why it lives here rather than inside either one.
 */

export default function ResultsStaleNotice({ error, onRetry, isRetrying }) {
  return (
    <p
      role="alert"
      className="bg-warning-50 text-warning-700 m-0 flex items-start gap-2 rounded-md px-3.5 py-3 text-[12.5px] leading-[1.5] font-medium"
    >
      <CircleAlert size={15} className="mt-px shrink-0" aria-hidden="true" />
      <span>
        These numbers stopped updating — {apiErrorMessage(error, "the last refresh failed.")} They
        are the last figures successfully read and may now be out of date.{" "}
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="cursor-pointer font-bold underline underline-offset-2 disabled:opacity-60"
        >
          {isRetrying ? "Retrying…" : "Try again"}
        </button>
      </span>
    </p>
  );
}
