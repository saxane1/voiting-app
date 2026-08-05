import { formatDateTime } from "@/utils/format-date";

/**
 * The voting window, both ends of it.
 *
 * Always shows BOTH times rather than the voter-facing "Closes in 2 hours"
 * phrasing: an administrator is deciding whether a window is safe to open or
 * still live enough to reopen, and that judgement needs the actual instants.
 */

export default function ElectionWindow({ startAt, endAt, className = "" }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      {formatDateTime(startAt)}
      <span className="px-1 text-slate-400" aria-hidden="true">
        →
      </span>
      {formatDateTime(endAt)}
    </span>
  );
}

/**
 * True once the window's end is in the past — the fence /open and /reopen both
 * enforce.
 *
 * `now` is passed in rather than read here: callers render this during a render
 * pass, and reading the clock there would make the render impure. They get it
 * from useNow(), which ticks.
 */
export function windowHasEnded(endAt, now) {
  if (!endAt) return false;

  return new Date(endAt).getTime() <= now;
}
