"use client";

import { useEffect, useState } from "react";

function remainingSeconds(endsAt) {
  if (!endsAt) return 0;

  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

/**
 * Seconds remaining until `endsAt` (an epoch-ms timestamp), ticking once a
 * second and settling at 0. Pass null to disable.
 *
 * The value is DERIVED from the timestamp on every render rather than held in
 * state — the interval only forces the re-render. That matters on a phone,
 * where a backgrounded tab has its timers throttled or paused: a decremented
 * counter would come back frozen where it left off, whereas recomputing from
 * the deadline is correct the instant the tab wakes.
 *
 * `endsAt` is null until the user acts, so the first render is 0 on both server
 * and client and there is nothing to mismatch during hydration.
 */
export function useCountdown(endsAt) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return undefined;

    const intervalId = setInterval(() => {
      setTick((tick) => tick + 1);

      if (remainingSeconds(endsAt) <= 0) clearInterval(intervalId);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [endsAt]);

  return remainingSeconds(endsAt);
}
