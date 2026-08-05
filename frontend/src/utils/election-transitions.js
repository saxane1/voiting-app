import { ELECTION_STATUS } from "./election-labels";

/**
 * THE client-side mirror of the server's state machine.
 *
 * ALLOWED_TRANSITIONS below is copied verbatim from
 * backend/src/utils/election-status.js — the file every backend guard reads
 * from. The UI derives its buttons from THIS map rather than from a hand-written
 * list of "what an election screen should offer", so the client can never put a
 * button on screen that the server would answer with
 * 409 ILLEGAL_STATUS_TRANSITION.
 *
 *   DRAFT     -> SCHEDULED, OPEN
 *   SCHEDULED -> DRAFT, OPEN
 *   OPEN      -> CLOSED
 *   CLOSED    -> OPEN (reopen), PUBLISHED
 *   PUBLISHED -> (terminal)
 *
 * It is a MIRROR, not the authority. The server re-checks every transition, and
 * the screens reconcile to whatever status the server reports afterwards — see
 * the illegal-transition handling in election-detail-page.js.
 */

export const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: ["SCHEDULED", "OPEN"],
  SCHEDULED: ["DRAFT", "OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN", "PUBLISHED"],
  PUBLISHED: [],
});

/** Mirrors isEditable(): title, window, type and faculty freeze once OPEN. */
export function isEditable(status) {
  return status === ELECTION_STATUS.DRAFT || status === ELECTION_STATUS.SCHEDULED;
}

/** Mirrors isDeletable(): DRAFT only — a SCHEDULED election has been announced. */
export function isDeletable(status) {
  return status === ELECTION_STATUS.DRAFT;
}

/**
 * One descriptor per legal edge, keyed "FROM->TO".
 *
 * `path` is the ROUTE SEGMENT, and it is why this table is keyed by edge rather
 * than by target status: CLOSED->OPEN and DRAFT->OPEN both end at OPEN but are
 * different endpoints with different guards. /open freezes eligibleCount and
 * demands at least 2 candidates; /reopen leaves the frozen count alone, refuses
 * once endAt has passed, and is recorded as a SENSITIVE audit event.
 */
const TRANSITION_ACTIONS = {
  "DRAFT->SCHEDULED": {
    key: "schedule",
    path: "schedule",
    to: ELECTION_STATUS.SCHEDULED,
    label: "Mark as scheduled",
    icon: "calendar",
    variant: "neutral",
    tone: "primary",
    title: (election) => `Schedule "${election.title}"?`,
    description:
      "This marks the election as scheduled and announced. Voting does NOT start — students still cannot cast a ballot until you open it. You can still edit the title, window and scope, and you can move it back to draft.",
    confirmLabel: "Mark as scheduled",
  },

  "SCHEDULED->DRAFT": {
    key: "unschedule",
    path: "unschedule",
    to: ELECTION_STATUS.DRAFT,
    label: "Return to draft",
    icon: "undo",
    variant: "neutral",
    tone: "primary",
    title: (election) => `Return "${election.title}" to draft?`,
    description:
      "This takes the election back off the schedule. Nothing is lost — it stays editable, and it becomes deletable again. No votes exist yet, so nothing is discarded.",
    confirmLabel: "Return to draft",
  },

  "DRAFT->OPEN": openAction(),
  "SCHEDULED->OPEN": openAction(),

  "OPEN->CLOSED": {
    key: "close",
    path: "close",
    to: ELECTION_STATUS.CLOSED,
    label: "Close voting",
    icon: "lock",
    variant: "danger",
    tone: "danger",
    title: (election) => `Close voting in "${election.title}"?`,
    description:
      "Voting ends immediately. Students who have not voted yet lose their chance — every ballot already cast stays counted, and no further ballot can be added while the election is closed. Reopening afterwards is possible only while the voting window has not yet ended, and it is recorded as a sensitive action.",
    confirmLabel: "Close voting now",
  },

  "CLOSED->OPEN": {
    key: "reopen",
    path: "reopen",
    to: ELECTION_STATUS.OPEN,
    label: "Reopen voting",
    icon: "rotate",
    variant: "danger",
    tone: "danger",
    title: (election) => `Reopen voting in "${election.title}"?`,
    description:
      "This restarts a ballot box that was already sealed, and more votes can be cast into it. It is permitted only while the voting window has not ended, and it is written to the audit trail as a SENSITIVE event naming you, the time it was closed and the time you reopened it. The electorate size stays frozen at the value taken when the election first opened. Do this only to correct a genuine mistake.",
    confirmLabel: "Reopen voting",
  },

  "CLOSED->PUBLISHED": {
    key: "publish",
    path: "publish",
    to: ELECTION_STATUS.PUBLISHED,
    label: "Mark results as final",
    icon: "trophy",
    variant: "warning",
    tone: "warning",
    title: (election) => `Mark "${election.title}" as final?`,
    // Deliberate, and load-bearing: publishing changes NOTHING about who can
    // see a result. There is no public results endpoint in this system and
    // there will not be one (Project-Context §9) — the university announces
    // officially, outside the app.
    description:
      "This is bookkeeping only. It records the result as final and timestamps it — it does NOT show anything to students, and it does not make results public. Results stay admin-only in the app; the university announces them officially outside the system. This is the terminal state: once final, the election can never be reopened or changed again.",
    confirmLabel: "Mark as final",
  },
};

/**
 * Opening is the same descriptor from either DRAFT or SCHEDULED — the endpoint,
 * guards and consequences are identical, so the copy is built once.
 */
function openAction() {
  return {
    key: "open",
    path: "open",
    to: ELECTION_STATUS.OPEN,
    label: "Open voting",
    icon: "play",
    variant: "success",
    tone: "success",
    title: (election) => `Open voting in "${election.title}"?`,
    description:
      "Voting goes live immediately and eligible students can start casting ballots. The size of the electorate is frozen at this moment, so students added or deactivated later do not change it. The server will refuse if the election has fewer than 2 candidates, if its end time has already passed, or if another election for the same seat is already open.",
    confirmLabel: "Open voting now",
  };
}

/**
 * The transitions the SERVER would accept from this status, as UI descriptors.
 *
 * Built by walking ALLOWED_TRANSITIONS, so adding an edge to the mirrored map
 * is the only thing needed to surface it — and an edge with no descriptor is
 * dropped rather than rendered half-defined.
 */
export function transitionsFrom(status) {
  return (ALLOWED_TRANSITIONS[status] ?? [])
    .map((to) => TRANSITION_ACTIONS[`${status}->${to}`])
    .filter(Boolean);
}

/**
 * Server refusals a transition can draw, in wording an admin can act on.
 *
 * The server's own message is preferred wherever it carries live detail (which
 * election is already open, how many candidates there are); these are the
 * fallbacks and the "what do I do about it" half.
 */
export const TRANSITION_ERROR_HINTS = {
  ILLEGAL_STATUS_TRANSITION:
    "This election's status changed since this page loaded. The status shown has been refreshed.",
  INSUFFICIENT_CANDIDATES:
    "An election needs at least 2 candidates before it can open. Candidates are added in the candidates module.",
  SCOPE_ALREADY_OPEN:
    "Another election for the same seat is already open. Close that one before opening this.",
  INVALID_ELECTION_WINDOW:
    "The voting window will not allow this. Edit the election's end time first.",
  WINDOW_ENDED:
    "The voting window has already ended, so voting cannot be restarted. Reopening is only possible while the window is still live.",
  ELECTION_NOT_FOUND: "This election no longer exists.",
};
