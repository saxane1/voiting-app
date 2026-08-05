/**
 * Presenting an audit row's `metadata` blob — and refusing to present anything
 * that would break ballot secrecy.
 *
 * The column is `Json?` (prisma/schema.prisma) and its contents are whatever
 * the write path recorded: `{ ip, userAgent }` on every auth event, plus
 * per-action context like `{ before, after }` on an update, `{ eligibleCount }`
 * on an open, `{ participation: true }` on a ballot. The endpoint passes it
 * through untouched — "rows are displayed as stored" — so the viewer flattens
 * it generically rather than knowing a shape per action.
 *
 * THE SCREEN BELOW IS A TRIPWIRE, NOT A FILTER.
 *
 * As shipped, no write path in backend/src puts a candidate id, a Vote id or a
 * chain hash into metadata — utils/audit.js forbids it in writing and
 * vote-controllers.js spells out the omission at the one place it would matter.
 * Every key below is therefore expected to match NOTHING, today.
 *
 * It exists because that is a property of the current backend, not of the wire
 * format, and this client is the last thing standing between such a field and a
 * rendered page. If one ever appears — a careless meta added to a vote path, a
 * future endpoint reusing the column — the value is dropped, never painted, and
 * the row says out loud that something was withheld so it gets reported as the
 * bug it is instead of quietly leaking. The same reasoning as the F7 dashboard
 * declining to render `problems[].voteId`.
 */

/**
 * Matched against each key with separators and case stripped, so `candidate_id`,
 * `candidateId` and `CandidateID` all collapse to the same thing.
 *
 * Deliberately NOT here: "code" and "id" on their own. `code` is a faculty's
 * short code on FACULTY_* rows and banning it would blank a legitimate,
 * non-secret field; OTP codes are already impossible (they are hashed before
 * they reach the database and never handed to writeAudit).
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  // A voter's choice, in every spelling it could arrive under.
  "candidateid",
  "votedfor",
  "choice",
  "ballotid",
  "voteid",
  // The hash chain. Any of these lets a row be positioned in the ballot order.
  "hash",
  "chain",
  // Credentials. utils/audit.js bans these outright; belt and braces.
  "otp",
  "token",
  "password",
  "secret",
  "jti",
];

function normalizeKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isForbiddenKey(key) {
  const normalized = normalizeKey(key);

  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** "userAgent" -> "User agent", "eligibleCount" -> "Eligible count". */
function humanizeKey(key) {
  const spaced = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!spaced) return String(key);

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Strips forbidden keys at every depth, so a nested `{ vote: { hash } }` is
 * caught as surely as a top-level one. Returns the cleaned value plus the paths
 * that were removed.
 */
function scrub(value, path, removed) {
  if (Array.isArray(value)) {
    return value.map((item, index) => scrub(item, `${path}[${index}]`, removed));
  }

  if (value && typeof value === "object") {
    const clean = {};

    for (const [key, nested] of Object.entries(value)) {
      const keyPath = path ? `${path}.${key}` : key;

      if (isForbiddenKey(key)) {
        removed.push(keyPath);
        continue;
      }

      clean[key] = scrub(nested, keyPath, removed);
    }

    return clean;
  }

  return value;
}

/** A displayable string for one metadata value. Objects keep their structure. */
function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 0 ? value : "—";

  return JSON.stringify(value, null, 2);
}

/**
 * @returns {{ entries: Array<{key,label,value,isBlock}>, withheld: string[] }}
 *   `entries` is ready to render as a definition list; `withheld` is empty on a
 *   healthy backend and, if it ever isn't, names exactly what to go and fix.
 */
export function readAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { entries: [], withheld: [] };
  }

  const withheld = [];
  const clean = scrub(metadata, "", withheld);

  const entries = Object.entries(clean).map(([key, value]) => ({
    key,
    label: humanizeKey(key),
    value: formatValue(value),
    // Objects and arrays get a preformatted block; scalars sit inline.
    isBlock: Boolean(value) && typeof value === "object",
  }));

  return { entries, withheld };
}
