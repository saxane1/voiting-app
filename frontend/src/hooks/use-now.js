"use client";

import { useEffect, useState } from "react";

/**
 * The current time, as a value that is stable within a render and refreshed on
 * an interval.
 *
 * The admin screens compare an election's `endAt` against "now" in several
 * places — whether a window has ended decides whether the server will accept an
 * open or a reopen. Reading `Date.now()` during render would be impure (the
 * same render could produce different output), and pinning it at mount would go
 * stale on a screen an election officer may leave open for hours, right across
 * the moment a window closes.
 *
 * So the clock ticks slowly and deliberately: half a minute is far below the
 * granularity of a voting window and costs nothing.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(intervalId);
  }, [intervalMs]);

  return now;
}
