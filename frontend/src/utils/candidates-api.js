import api from "./axios";

/**
 * Every write the admin candidate screens make.
 *
 * Shapes read off backend/src/controllers/candidate-controllers.js and
 * backend/src/routes/candidate-routes.js:
 *
 *   GET    /elections/:electionId/candidates -> { candidates: [...] }   (AUTH)
 *   POST   /elections/:electionId/candidates -> 201 { candidate }       (ADMIN)
 *   PATCH  /candidates/:id                   -> { candidate }           (ADMIN)
 *   DELETE /candidates/:id                   -> { message, id }         (ADMIN)
 *
 * There is deliberately NO fetch helper here, and the roster on screen does not
 * come from GET /elections/:id/candidates. Two reasons:
 *
 *   1. That endpoint is AUTH-level because students read it on their ballot, so
 *      its rows are the LEAN ballot shape — `{ id, name, manifesto, photoUrl,
 *      userId }` with the user flattened and NO studentId. An admin managing a
 *      roster needs the student ID to tell two students with the same name
 *      apart; a ballot must not leak it.
 *   2. GET /elections/:id (ADMIN, F5's `fetchElection`) already embeds the
 *      richer roster — `candidates[{ id, manifesto, photoUrl, createdAt,
 *      user{ id, name, studentId } }]` plus `candidateCount` — alongside the
 *      status, type and faculty this screen has to show anyway. One request,
 *      one cache entry (queryKeys.election), and the status the add/remove
 *      controls are derived from can never disagree with the roster beside them.
 *
 * Everything goes through the F0 axios instance: memory-only Bearer token,
 * `withCredentials` for the refresh cookie, single-flight 401 retry.
 */

/** The zod cap in the controller. Enforced here too so 5001 chars fail locally. */
export const MAX_MANIFESTO_LENGTH = 5000;

/**
 * Attach an existing student to an election.
 *
 * `payload` is `{ userId, manifesto?, photoUrl? }` — confirmed field names, and
 * `userId` is the User id, NOT the human-readable studentId ("PSU-1021").
 *
 * Empty optional fields must be OMITTED rather than sent as "": the controller
 * stores `manifesto ?? null`, and an empty string is not nullish, so it would be
 * written as a zero-length manifesto instead of "no manifesto".
 */
export async function addCandidate(electionId, { userId, manifesto, photoUrl }) {
  const { data } = await api.post(`/elections/${electionId}/candidates`, {
    userId,
    ...(manifesto ? { manifesto } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  });

  return data.candidate;
}

/**
 * Change a candidate's presentation. Only manifesto and photoUrl are editable —
 * the student behind a candidacy cannot be swapped, which is why this takes no
 * userId: reassigning a seat is a remove plus an add, and both are audited.
 *
 * `null` clears a field. The controller refuses a body with neither key
 * ("Provide at least one of manifesto or photoUrl"), so both are always sent.
 */
export async function updateCandidate(candidateId, { manifesto, photoUrl }) {
  const { data } = await api.patch(`/candidates/${candidateId}`, {
    manifesto: manifesto || null,
    photoUrl: photoUrl || null,
  });

  return data.candidate;
}

export async function removeCandidate(candidateId) {
  const { data } = await api.delete(`/candidates/${candidateId}`);

  return data;
}
