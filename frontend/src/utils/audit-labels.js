/**
 * The audit log's vocabulary: what each stored `action` string is called in
 * English, how loudly it should be shown, and which entity types exist.
 *
 * The action list mirrors AUDIT_ACTIONS in backend/src/utils/audit.js exactly.
 * It is mirrored rather than fetched because there is no endpoint that serves
 * it — B9 exposes one GET and it returns rows, not a schema.
 *
 * IMPORTANT — the backend does NOT validate `action` against this enum. Its own
 * comment explains why: "the log is a historical record: an action name that was
 * retired from the constant map still exists in rows already written, and an
 * auditor must still be able to filter for it". So the dropdown built from this
 * list is a convenience, not a contract, and `actionLabel()` must degrade
 * gracefully for any string a row can carry — including one this build has
 * never heard of.
 */

export const AUDIT_ACTIONS = {
  OTP_REQUESTED: "OTP_REQUESTED",
  OTP_REQUESTED_UNKNOWN_EMAIL: "OTP_REQUESTED_UNKNOWN_EMAIL",
  OTP_VERIFY_FAILED: "OTP_VERIFY_FAILED",
  OTP_CODE_BURNED: "OTP_CODE_BURNED",
  LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED",
  LOGOUT: "LOGOUT",
  ADMIN_ISSUED_OTP: "ADMIN_ISSUED_OTP",
  TOKEN_REUSE_DETECTED: "TOKEN_REUSE_DETECTED",
  USER_DEACTIVATED_SESSION_KILLED: "USER_DEACTIVATED_SESSION_KILLED",

  FACULTY_CREATED: "FACULTY_CREATED",
  FACULTY_UPDATED: "FACULTY_UPDATED",
  FACULTY_DELETED: "FACULTY_DELETED",

  ELECTION_CREATED: "ELECTION_CREATED",
  ELECTION_UPDATED: "ELECTION_UPDATED",
  ELECTION_SCHEDULED: "ELECTION_SCHEDULED",
  ELECTION_UNSCHEDULED: "ELECTION_UNSCHEDULED",
  ELECTION_DELETED: "ELECTION_DELETED",
  ELECTION_OPENED: "ELECTION_OPENED",
  ELECTION_CLOSED: "ELECTION_CLOSED",
  ELECTION_REOPENED: "ELECTION_REOPENED",
  ELECTION_PUBLISHED: "ELECTION_PUBLISHED",

  VOTE_CAST: "VOTE_CAST",

  RESULTS_VIEWED: "RESULTS_VIEWED",
  TURNOUT_VIEWED: "TURNOUT_VIEWED",
  INTEGRITY_CHECKED: "INTEGRITY_CHECKED",

  CANDIDATE_ADDED: "CANDIDATE_ADDED",
  CANDIDATE_UPDATED: "CANDIDATE_UPDATED",
  CANDIDATE_REMOVED: "CANDIDATE_REMOVED",

  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENTS_BULK_IMPORTED: "STUDENTS_BULK_IMPORTED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  STUDENT_DEACTIVATED: "STUDENT_DEACTIVATED",
  STUDENT_REACTIVATED: "STUDENT_REACTIVATED",
};

/**
 * Tone drives colour only. `danger` is reserved for entries an auditor should
 * stop and read — a replayed refresh token, a deletion, an account killed — not
 * for "something failed", so a wrong sign-in code stays amber.
 */
export const ACTION_TONE = {
  DANGER: "danger",
  WARN: "warn",
  SUCCESS: "success",
  INFO: "info",
  NEUTRAL: "neutral",
};

const ACTION_META = {
  [AUDIT_ACTIONS.OTP_REQUESTED]: ["Sign-in code requested", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.OTP_REQUESTED_UNKNOWN_EMAIL]: [
    "Sign-in code requested — unknown email",
    ACTION_TONE.WARN,
  ],
  [AUDIT_ACTIONS.OTP_VERIFY_FAILED]: ["Sign-in code rejected", ACTION_TONE.WARN],
  [AUDIT_ACTIONS.OTP_CODE_BURNED]: ["Sign-in code burned — attempts exceeded", ACTION_TONE.WARN],
  [AUDIT_ACTIONS.LOGIN_SUCCEEDED]: ["Signed in", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.LOGOUT]: ["Signed out", ACTION_TONE.NEUTRAL],
  [AUDIT_ACTIONS.ADMIN_ISSUED_OTP]: ["Sign-in code issued by an admin", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.TOKEN_REUSE_DETECTED]: ["Refresh token replayed — sessions revoked", ACTION_TONE.DANGER],
  [AUDIT_ACTIONS.USER_DEACTIVATED_SESSION_KILLED]: [
    "Sessions killed — account deactivated",
    ACTION_TONE.DANGER,
  ],

  [AUDIT_ACTIONS.FACULTY_CREATED]: ["Faculty created", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.FACULTY_UPDATED]: ["Faculty updated", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.FACULTY_DELETED]: ["Faculty deleted", ACTION_TONE.DANGER],

  [AUDIT_ACTIONS.ELECTION_CREATED]: ["Election created", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.ELECTION_UPDATED]: ["Election updated", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.ELECTION_SCHEDULED]: ["Election scheduled", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.ELECTION_UNSCHEDULED]: ["Election returned to draft", ACTION_TONE.WARN],
  [AUDIT_ACTIONS.ELECTION_DELETED]: ["Election deleted", ACTION_TONE.DANGER],
  [AUDIT_ACTIONS.ELECTION_OPENED]: ["Voting opened", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.ELECTION_CLOSED]: ["Voting closed", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.ELECTION_REOPENED]: ["Voting reopened", ACTION_TONE.WARN],
  [AUDIT_ACTIONS.ELECTION_PUBLISHED]: ["Results published", ACTION_TONE.SUCCESS],

  [AUDIT_ACTIONS.VOTE_CAST]: ["Ballot cast", ACTION_TONE.SUCCESS],

  [AUDIT_ACTIONS.RESULTS_VIEWED]: ["Results viewed", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.TURNOUT_VIEWED]: ["Turnout viewed", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.INTEGRITY_CHECKED]: ["Ballot chain verified", ACTION_TONE.INFO],

  [AUDIT_ACTIONS.CANDIDATE_ADDED]: ["Candidate added", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.CANDIDATE_UPDATED]: ["Candidate updated", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.CANDIDATE_REMOVED]: ["Candidate removed", ACTION_TONE.DANGER],

  [AUDIT_ACTIONS.STUDENT_CREATED]: ["Student registered", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.STUDENTS_BULK_IMPORTED]: ["Students bulk-imported", ACTION_TONE.SUCCESS],
  [AUDIT_ACTIONS.STUDENT_UPDATED]: ["Student updated", ACTION_TONE.INFO],
  [AUDIT_ACTIONS.STUDENT_DEACTIVATED]: ["Student deactivated", ACTION_TONE.DANGER],
  [AUDIT_ACTIONS.STUDENT_REACTIVATED]: ["Student reactivated", ACTION_TONE.SUCCESS],
};

/** The dropdown's grouping — the same seams the backend's write sites fall on. */
export const AUDIT_ACTION_GROUPS = [
  {
    label: "Sign-in & sessions",
    actions: [
      AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      AUDIT_ACTIONS.LOGOUT,
      AUDIT_ACTIONS.OTP_REQUESTED,
      AUDIT_ACTIONS.ADMIN_ISSUED_OTP,
      AUDIT_ACTIONS.OTP_REQUESTED_UNKNOWN_EMAIL,
      AUDIT_ACTIONS.OTP_VERIFY_FAILED,
      AUDIT_ACTIONS.OTP_CODE_BURNED,
      AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
      AUDIT_ACTIONS.USER_DEACTIVATED_SESSION_KILLED,
    ],
  },
  {
    label: "Elections",
    actions: [
      AUDIT_ACTIONS.ELECTION_CREATED,
      AUDIT_ACTIONS.ELECTION_UPDATED,
      AUDIT_ACTIONS.ELECTION_SCHEDULED,
      AUDIT_ACTIONS.ELECTION_UNSCHEDULED,
      AUDIT_ACTIONS.ELECTION_OPENED,
      AUDIT_ACTIONS.ELECTION_CLOSED,
      AUDIT_ACTIONS.ELECTION_REOPENED,
      AUDIT_ACTIONS.ELECTION_PUBLISHED,
      AUDIT_ACTIONS.ELECTION_DELETED,
    ],
  },
  {
    label: "Voting",
    actions: [AUDIT_ACTIONS.VOTE_CAST],
  },
  {
    label: "Oversight",
    actions: [
      AUDIT_ACTIONS.RESULTS_VIEWED,
      AUDIT_ACTIONS.TURNOUT_VIEWED,
      AUDIT_ACTIONS.INTEGRITY_CHECKED,
    ],
  },
  {
    label: "Candidates",
    actions: [
      AUDIT_ACTIONS.CANDIDATE_ADDED,
      AUDIT_ACTIONS.CANDIDATE_UPDATED,
      AUDIT_ACTIONS.CANDIDATE_REMOVED,
    ],
  },
  {
    label: "Students",
    actions: [
      AUDIT_ACTIONS.STUDENT_CREATED,
      AUDIT_ACTIONS.STUDENTS_BULK_IMPORTED,
      AUDIT_ACTIONS.STUDENT_UPDATED,
      AUDIT_ACTIONS.STUDENT_DEACTIVATED,
      AUDIT_ACTIONS.STUDENT_REACTIVATED,
    ],
  },
  {
    label: "Faculties",
    actions: [
      AUDIT_ACTIONS.FACULTY_CREATED,
      AUDIT_ACTIONS.FACULTY_UPDATED,
      AUDIT_ACTIONS.FACULTY_DELETED,
    ],
  },
];

/**
 * The four values the backend ever writes into `entityType`, confirmed by
 * grepping every writeAudit call: User, Election, Faculty, Candidate.
 *
 * Offered as a dropdown rather than a text box because the column is
 * case-sensitive and exact-matched — "election" would silently return nothing
 * rather than erroring, which is the worst possible outcome for an auditor.
 */
export const AUDIT_ENTITY_TYPES = ["User", "Election", "Faculty", "Candidate"];

/** "OTP_CODE_BURNED" -> "Otp code burned". Only for actions we do not know. */
function humanizeAction(action) {
  const words = String(action).toLowerCase().replace(/_/g, " ").trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown action";
}

export function actionLabel(action) {
  return ACTION_META[action]?.[0] ?? humanizeAction(action);
}

export function actionTone(action) {
  return ACTION_META[action]?.[1] ?? ACTION_TONE.NEUTRAL;
}

/** True for an action this build has no entry for — worth showing as such. */
export function isKnownAction(action) {
  return Boolean(ACTION_META[action]);
}

/**
 * Which rows carry a deliberately coarsened timestamp.
 *
 * VOTE_CAST is the only one. backend/src/utils/audit.js overrides `createdAt`
 * for exactly this action, flooring it to the hour (in UTC) so that a precise
 * per-voter time cannot be lined up against the hash chain to reconstruct who
 * voted for whom. Every other action keeps the database's precise now().
 *
 * Keyed on the ACTION rather than sniffed from the value's minutes: an
 * unrelated row that happens to land on :00 is not coarsened, and a viewer in a
 * half-hour timezone would see :30 on a row that genuinely is.
 */
export function isHourFloored(action) {
  return action === AUDIT_ACTIONS.VOTE_CAST;
}
