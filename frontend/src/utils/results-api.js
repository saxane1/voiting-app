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
