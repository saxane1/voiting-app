/**
 * One place for React Query cache keys, so a fetch and the invalidation that
 * follows a vote cannot drift apart and leave a stale "not voted yet" ballot on
 * screen.
 */

export const queryKeys = {
  myBallots: ["me", "ballots"],
  myBallot: (electionId) => ["me", "ballot", electionId],
  myVotingStatus: ["me", "voting-status"],

  /** GET /faculties — shared by the admin faculty select and its list filter. */
  faculties: ["faculties"],

  /**
   * Students (F3). Every student key starts with ["students"], so ONE
   * invalidation of that prefix after a create / edit / deactivate refreshes
   * the list on whatever page and filter it is currently showing, plus any
   * detail view — no need to know which combination is mounted.
   */
  students: ["students"],
  studentList: (params) => ["students", "list", params],
  student: (id) => ["students", "detail", id],

  /**
   * Elevated accounts — ADMIN and AUDITOR (B3b). Same prefix discipline as
   * students: one invalidation of ["users"] after a create or an activation
   * toggle refreshes the list on whatever page, search and role filter happens
   * to be mounted.
   *
   * Deliberately a DIFFERENT prefix from ["students"], mirroring the API: the
   * two populations never appear in each other's lists, so invalidating one
   * must not refetch the other.
   */
  users: ["users"],
  userList: (params) => ["users", "list", params],

  /**
   * Elections (F4). Same prefix discipline as students: one invalidation of
   * ["elections"] after a create, edit or status transition refreshes both the
   * list and the detail view — which matters more here than anywhere else,
   * because status is server-owned and a stale badge is a lie about whether
   * voting is live.
   */
  elections: ["elections"],
  electionList: (params) => ["elections", "list", params],
  election: (id) => ["elections", "detail", id],

  /**
   * Results (F7) — AGGREGATE reads only. Same prefix discipline again: one
   * invalidation of ["results"] re-seeds both the tally and the turnout for
   * whichever election is on screen, which is exactly what a socket reconnect
   * needs after missing an unknown number of throttled ticks.
   *
   * There is no key for integrity: it is an explicit, audited admin action run
   * through a mutation, not something a window refocus may quietly re-run.
   */
  results: ["results"],
  electionResults: (id) => ["results", "tally", id],
  electionTurnout: (id) => ["results", "turnout", id],

  /**
   * Audit log (F8). Read-only, so unlike every key above there is nothing here
   * to invalidate — no screen in this app writes an audit row directly, and the
   * viewer's own reads are deliberately not audited (docs/API-Map.md B9). The
   * prefix is kept anyway so the whole log can be dropped from the cache in one
   * call if a future screen ever needs to.
   */
  audit: ["audit"],
  auditList: (params) => ["audit", "list", params],
};
