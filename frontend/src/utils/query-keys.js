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
};
