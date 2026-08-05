import { ELECTION_STATUS } from "./election-labels";

/**
 * Which of the dashboard's card states a ballot is in.
 *
 * THE SERVER DECIDES, THE CLIENT ONLY PHRASES IT. `status` and `withinWindow`
 * come from GET /me/ballots and are the authority. Client time is used only to
 * word an already-server-declared "outside the window" as either "not started"
 * or "closed" — never to decide votability. A student on a phone with a wrong
 * clock must still be able to attempt a vote; the server rejects it with
 * VOTING_NOT_OPEN if it is genuinely shut, and the UI handles that.
 */

export const BALLOT_STATE = {
  /** Open, in window, not yet voted — the only state with a vote action. */
  VOTABLE: "VOTABLE",
  /** Voted, and the election is still running. */
  VOTED: "VOTED",
  /** Voted, and voting has since closed. */
  VOTED_CLOSED: "VOTED_CLOSED",
  /** Eligible, but voting has not begun. */
  NOT_STARTED: "NOT_STARTED",
  /** Window has passed without a vote from this student. */
  WINDOW_CLOSED: "WINDOW_CLOSED",
  /** Any other non-open status (SCHEDULED / CLOSED / PUBLISHED / DRAFT). */
  NOT_OPEN: "NOT_OPEN",
};

export function ballotState(ballot, now = Date.now()) {
  const isOpen = ballot.status === ELECTION_STATUS.OPEN;
  const inWindow = Boolean(ballot.withinWindow);

  if (ballot.votedAlready) {
    return isOpen && inWindow ? BALLOT_STATE.VOTED : BALLOT_STATE.VOTED_CLOSED;
  }

  if (!isOpen) {
    return ballot.status === ELECTION_STATUS.SCHEDULED
      ? BALLOT_STATE.NOT_STARTED
      : BALLOT_STATE.NOT_OPEN;
  }

  if (inWindow) {
    return BALLOT_STATE.VOTABLE;
  }

  // Status says OPEN but the server put us outside the window: phrase which end.
  const startAt = new Date(ballot.startAt).getTime();

  return now < startAt ? BALLOT_STATE.NOT_STARTED : BALLOT_STATE.WINDOW_CLOSED;
}

export function isVotable(ballot, now = Date.now()) {
  return ballotState(ballot, now) === BALLOT_STATE.VOTABLE;
}
