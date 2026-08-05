// THE state model for an election. Every guard in every controller reads from
// this file — if a transition is not listed here, it cannot happen anywhere.
//
//   DRAFT     -> SCHEDULED, OPEN
//   SCHEDULED -> DRAFT, OPEN
//   OPEN      -> CLOSED
//   CLOSED    -> OPEN (reopen), PUBLISHED
//   PUBLISHED -> (terminal)

export const ELECTION_STATUS = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  PUBLISHED: "PUBLISHED",
};

export const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: ["SCHEDULED", "OPEN"],
  SCHEDULED: ["DRAFT", "OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN", "PUBLISHED"],
  PUBLISHED: [],
});

export function canTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

// Human-readable refusal, so the API can say what WOULD have been legal.
export function describeIllegalTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];

  return allowed.length === 0
    ? `An election in ${from} is final and cannot change status`
    : `Cannot move an election from ${from} to ${to}. Allowed from ${from}: ${allowed.join(", ")}`;
}

// Content is editable only before anyone can have voted. Once an election has
// been OPEN, its title, window, type and faculty are part of the record.
export function isEditable(status) {
  return status === ELECTION_STATUS.DRAFT || status === ELECTION_STATUS.SCHEDULED;
}

// Deletion only while DRAFT. A SCHEDULED election has been announced; anything
// past OPEN has ballots or receipts attached to it.
export function isDeletable(status) {
  return status === ELECTION_STATUS.DRAFT;
}
