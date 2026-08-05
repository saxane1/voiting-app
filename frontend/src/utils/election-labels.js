/**
 * Human wording for the backend's ElectionType / ElectionStatus enums
 * (backend/prisma/schema.prisma).
 *
 * Nothing here reports a result, a tally or a winner — students never see those
 * (Project-Context §9). PUBLISHED deliberately reads as "results announced by
 * the university", pointing OFF the system, because the announcement happens
 * outside it.
 */

export const ELECTION_TYPE = {
  FACULTY: "FACULTY",
  UNIVERSITY: "UNIVERSITY",
};

export const ELECTION_STATUS = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  PUBLISHED: "PUBLISHED",
};

export function electionTypeLabel(type) {
  return type === ELECTION_TYPE.UNIVERSITY ? "University Leader" : "Faculty Leader";
}

/** The electorate for this ballot — what makes a student eligible for it. */
export function electionScopeLabel(type) {
  return type === ELECTION_TYPE.UNIVERSITY ? "Gudoomiye · all students" : "Your faculty";
}

/**
 * The ADMIN wording for a status — the literal lifecycle state, not the
 * student-facing paraphrase below.
 *
 * An administrator driving the lifecycle needs the actual enum value the
 * backend will accept or refuse a transition against; softening PUBLISHED into
 * "results announced" here would hide that it is the terminal state.
 */
export function electionStatusAdminLabel(status) {
  switch (status) {
    case ELECTION_STATUS.DRAFT:
      return "Draft";
    case ELECTION_STATUS.SCHEDULED:
      return "Scheduled";
    case ELECTION_STATUS.OPEN:
      return "Open";
    case ELECTION_STATUS.CLOSED:
      return "Closed";
    case ELECTION_STATUS.PUBLISHED:
      return "Final";
    default:
      return status || "Unknown";
  }
}

/**
 * Who votes in this election, for an admin list: the electorate, named.
 *
 * A FACULTY row carries its nested `faculty { id, name, code }` from the API,
 * so this never needs a lookup.
 */
export function electionScopeText(election) {
  if (election?.type === ELECTION_TYPE.UNIVERSITY) {
    return "University · Gudoomiye";
  }

  return `Faculty · ${election?.faculty?.name ?? "No faculty"}`;
}

export function electionStatusLabel(status) {
  switch (status) {
    case ELECTION_STATUS.OPEN:
      return "Open for voting";
    case ELECTION_STATUS.SCHEDULED:
      return "Not open yet";
    case ELECTION_STATUS.CLOSED:
      return "Voting closed";
    case ELECTION_STATUS.PUBLISHED:
      return "Results announced by the university";
    default:
      return "Not open yet";
  }
}
