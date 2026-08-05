import { isEditable } from "./election-transitions";

/**
 * THE client-side mirror of the server's candidate rules.
 *
 * Read off backend/src/controllers/candidate-controllers.js. As with the
 * lifecycle map in election-transitions.js, this is a MIRROR and not the
 * authority: every rule below is re-checked server-side, and the screens
 * reconcile to whatever the server reports after a rejection.
 */

/**
 * The roster is locked by exactly the same predicate that locks an election's
 * title and window — `isEditable(status)` in backend/src/utils/election-status.js,
 * which is DRAFT or SCHEDULED.
 *
 * All THREE candidate writes share it: addCandidate, updateCandidate and
 * removeCandidate each call the same `candidatesLocked()` helper and answer
 * 409 CANDIDATES_LOCKED. So a manifesto is as frozen as the list of names —
 * which is the point: /open counts candidates and freezes `eligibleCount`
 * against them, so the ballot a voter is looking at must not shift underneath.
 *
 * Note what this rule is NOT: there is no "does this candidate have votes?"
 * check anywhere in the controller. The status guard is what makes the hard
 * DELETE safe — an election that has never been OPEN cannot have a Vote row
 * pointing at any of its candidates, so there is nothing to orphan.
 */
export function canManageCandidates(status) {
  return isEditable(status);
}

/** The `/open` contest rule: `candidateCount < 2` -> 409 INSUFFICIENT_CANDIDATES. */
export const MIN_CANDIDATES_TO_OPEN = 2;

/**
 * Readiness for F5's Open button — a SIGNAL, never a gate. Nothing on the
 * candidate screens blocks anything on this; the count is shown so an admin
 * knows before walking over to the lifecycle panel, and the server is still the
 * only thing that decides whether an election may open.
 */
export function openReadiness(count = 0) {
  return {
    count,
    ready: count >= MIN_CANDIDATES_TO_OPEN,
    remaining: Math.max(0, MIN_CANDIDATES_TO_OPEN - count),
  };
}

/**
 * Why a candidate write was refused, in wording an admin can act on.
 *
 * The server's own message is always shown first — it carries live detail the
 * client cannot know, such as WHICH faculty the student actually belongs to.
 * These are the "so what do I do about it" half.
 */
export const CANDIDATE_ERROR_HINTS = {
  CANDIDATES_LOCKED:
    "Candidates are locked once voting opens. The status shown has been refreshed — if it is no longer a draft, another admin opened this election.",
  FACULTY_MISMATCH:
    "A faculty election can only be contested by students of that faculty. This student's faculty may have been changed since the list was loaded.",
  ALREADY_CANDIDATE: "That student is already on this ballot.",
  NOT_A_STUDENT: "Only students can stand for election — not administrators or auditors.",
  STUDENT_INACTIVE:
    "Reactivate the student on the voter roll first, then add them as a candidate.",
  USER_NOT_FOUND: "That student no longer exists. The list has been refreshed.",
  CANDIDATE_NOT_FOUND:
    "That candidate has already been removed, possibly by another admin. The roster has been refreshed.",
  ELECTION_NOT_FOUND: "This election no longer exists.",
};

/**
 * Refusals that are entirely about WHICH STUDENT was chosen, so they belong
 * under the picker rather than in a banner above the form.
 *
 * These are wired into fieldErrorsFromApi (utils/api-field-errors.js) against
 * the `userId` field. CANDIDATES_LOCKED is deliberately absent: it is not about
 * the student at all — the whole form is about to disappear — so it is shown at
 * screen level and triggers a re-read of the status.
 */
export const CANDIDATE_PICKER_ERROR_CODES = [
  "FACULTY_MISMATCH",
  "ALREADY_CANDIDATE",
  "NOT_A_STUDENT",
  "STUDENT_INACTIVE",
  "USER_NOT_FOUND",
];
