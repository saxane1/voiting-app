/**
 * Date formatting for the voter screens, via built-in Intl — no date library is
 * installed on the frontend and none is needed here.
 *
 * These only ever run inside client components after a fetch, so there is no
 * server-rendered output to mismatch during hydration.
 */

function formatter(options) {
  return new Intl.DateTimeFormat(undefined, options);
}

/** "5 Aug 2026" */
export function formatDate(value) {
  if (!value) return "";

  return formatter({ day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

/**
 * "5 Aug, 14:00" — used for the participation timestamp.
 *
 * NOTE: the backend floors votedAt to the hour before storing it, deliberately,
 * so that a precise per-voter time cannot be lined up against the ballot chain
 * (backend/src/utils/time.js). The minutes shown here are therefore always :00
 * — that is the stored truth, not a rounding done for display.
 */
export function formatDateTime(value) {
  if (!value) return "";

  return formatter({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** A one-line voting window, e.g. "Closes 5 Aug, 18:00". */
export function formatWindow({ startAt, endAt }, now = Date.now()) {
  if (!startAt || !endAt) return "";

  const start = new Date(startAt).getTime();

  if (now < start) {
    return `Opens ${formatDateTime(startAt)}`;
  }

  return `Closes ${formatDateTime(endAt)}`;
}
