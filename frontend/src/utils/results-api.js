import api from "./axios";

/**
 * The three ADMIN-only result reads (B7).
 *
 * Shapes read off backend/src/controllers/results-controllers.js and
 * backend/src/utils/{tally,chain}.js:
 *
 *   GET /elections/:id/results
 *     { election{ id, title, type, status },
 *       results[{ candidateId, name, manifesto, photoUrl, voteCount }],
 *       totalVotes }
 *
 *   GET /elections/:id/turnout
 *     { election{ id, title, status },
 *       voted, eligible, turnoutPct, hourly[{ hour, count }], note? }
 *     — turnout fields are SPREAD at the top level, not nested under `turnout`.
 *       (The socket payload nests them; see hooks/use-election-socket.js.)
 *
 *   GET /elections/:id/integrity
 *     { election{ id, title, status },
 *       valid, votesChecked, votesCount, receiptsCount, problems[...] }
 *
 * AGGREGATE ONLY, and that is a property of the backend, not a promise made
 * here: /results reads Vote and /turnout reads VoteReceipt, independently, and
 * backend/src/utils/tally.js refuses to join them to each other or to User. No
 * response below carries a userId, a receipt, a ballot row or a timestamp finer
 * than the hour. Nothing in this file may ever ask for one.
 *
 * All three are behind `router.use(requireAuth, requireRole("ADMIN"))` in
 * election-routes.js. There is no public results endpoint and there will not be
 * one (Project-Context §9) — the university announces officially, off-system.
 *
 * Every call goes through the F0 axios instance: memory-only Bearer token,
 * `withCredentials` for the refresh cookie, single-flight 401 retry.
 */

/**
 * How long a successful read of an audited endpoint may be reused before a
 * caller asks again.
 *
 * ALL THREE GETS BELOW WRITE AN AUDIT ROW PER CALL — RESULTS_VIEWED,
 * TURNOUT_VIEWED, INTEGRITY_CHECKED. That is the point of them: the record of
 * who looked at a result only means something if looking is deliberate. It also
 * means a caller that re-reads on every network hiccup does not just waste a
 * request, it writes a row, and enough of those bury the entries that matter.
 * Project-Context §10 assumes weak connections are the norm here rather than the
 * exception, so that is a realistic failure, not a theoretical one.
 *
 * Pinned rather than inherited from the QueryClient default deliberately: this
 * value is an AUDIT-VOLUME policy, not a freshness preference, and it must not
 * change as a side effect of someone retuning app-wide caching. Lowering it
 * increases audit writes on a flapping connection.
 *
 * It costs no visible liveness. These screens are kept current by the B8 socket,
 * and `join-election` pushes an immediate authoritative snapshot on every
 * (re)connect — built by the same computeTallies/computeTurnout pair as the REST
 * reads (backend/src/socket/election-events.js). The REST call is a correctness
 * reseed behind that, not the thing the numbers tick from.
 */
export const AUDITED_STALE_MS = 30_000;

export async function fetchResults(electionId) {
  const { data } = await api.get(`/elections/${electionId}/results`);

  return data;
}

export async function fetchTurnout(electionId) {
  const { data } = await api.get(`/elections/${electionId}/turnout`);

  return data;
}

/**
 * Verify the Vote hash chain. READ-ONLY — it walks the chain and recomputes
 * SHA256(prevHash + electionId + candidateId) per ballot, and writes nothing
 * back. (It does append an INTEGRITY_CHECKED row to the audit log server-side,
 * which is a record of the check, not a change to any ballot.)
 *
 * Deliberately called from a mutation rather than a query: it is an action an
 * admin takes, it is audited every time, and it must not be re-run silently by
 * a window refocus.
 */
export async function checkIntegrity(electionId) {
  const { data } = await api.get(`/elections/${electionId}/integrity`);

  return data;
}
