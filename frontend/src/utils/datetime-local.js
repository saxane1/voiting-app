/**
 * Bridging `<input type="datetime-local">` and the API's ISO strings.
 *
 * The input speaks LOCAL wall-clock time with no zone ("2026-08-12T08:00"),
 * which is exactly how an election officer thinks about "voting opens at 8am".
 * The API stores real instants. So the conversion has to happen at the edge, in
 * one place, rather than being re-derived per field:
 *
 *   - `new Date("2026-08-12T08:00")` (no Z) is parsed by the browser as LOCAL
 *     time, so `.toISOString()` produces the correct instant for that wall
 *     clock. That is the whole outbound conversion.
 *   - Coming back, `toISOString().slice(0,16)` would be WRONG — it would show
 *     the UTC wall clock and quietly shift the window by the zone offset. The
 *     value has to be rebuilt from the local getters instead.
 *
 * Both directions run only inside client components after a fetch, so there is
 * no server-rendered output to mismatch during hydration.
 */

function pad(value) {
  return String(value).padStart(2, "0");
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
export function toDateTimeLocal(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** "YYYY-MM-DDTHH:mm" (local) -> ISO instant for the API. */
export function fromDateTimeLocal(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The same idea one step coarser, for `<input type="date">`.
 *
 * The audit log's from/to filter is a range on `createdAt`, and the backend
 * compares instants (`gte` / `lte`). A bare "2026-08-05" sent as `to` would mean
 * midnight at the START of that day, so picking today as the end of the range
 * would exclude everything that happened today — the single most confusing thing
 * a date filter can do. Both ends are therefore widened to the viewer's own
 * local day before they are sent.
 */
export function startOfLocalDayIso(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

export function endOfLocalDayIso(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

/** Epoch ms for a datetime-local value, or null — for comparing the two ends. */
export function dateTimeLocalToMs(value) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}
