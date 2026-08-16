import { prisma } from "../config/prisma.js";

// ---------------------------------------------------------------------------
// WHAT MAY AND MAY NOT GO IN AN AUDIT ROW
//
// NEVER, in any field: OTP codes (plaintext or hashed), access or refresh
// tokens, token hashes, refresh-token jtis, passwords, or SMTP credentials.
// An audit log is read by more people than the database is, and it is exported.
//
// NEVER, once B6 lands: anything that links a voter to a ballot choice. Vote
// events may record ONLY that a user participated (userId + electionId) — never
// a candidateId, never a Vote id, never anything derived from either. The two
// unlinked tables (design rule 1) are worthless if the audit log rejoins them.
//
// meta is for non-sensitive context: counts, reasons, which admin acted, ip and
// user-agent, a studentId. If in doubt, leave it out.
// ---------------------------------------------------------------------------

// Fire-and-forget by design. Callers must NOT await this: an audit insert
// failing (Neon hiccup, pool exhaustion) must never turn a successful login into
// a 500. The rejection is swallowed here so a non-awaited call can never surface
// as an unhandled rejection either.
// `createdAt` is normally left to the database default (precise now()), which is
// what forensics wants for OTP, token-reuse and admin events. It is overridable
// for ONE reason: VOTE_CAST must store an hour-floored timestamp, because a
// precise per-vote time in this table reconstructs ballot order against the hash
// chain exactly as a precise VoteReceipt.votedAt would. See src/utils/time.js.
export function writeAudit({
  actorUserId = null,
  action,
  entityType = null,
  entityId = null,
  meta = null,
  createdAt = undefined,
}) {
  return prisma.auditLog
    .create({
      data: {
        actorUserId,
        action,
        entityType,
        entityId,
        metadata: meta,
        ...(createdAt ? { createdAt } : {}),
      },
    })
    .catch((error) => {
      // Loud on purpose. A swallowed audit failure is a silent hole in the
      // access trail, which is worse than a noisy log — this line is what a
      // monitor should alert on.
      console.error(
        `[audit] AUDIT GAP — failed to write ${action}${entityId ? ` for ${entityType}:${entityId}` : ""}: ${error.message}`
      );
    });
}

// Standard non-sensitive request context. Safe on every auth event.
export function requestContext(req) {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

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

  // B3b — elevated (non-student) account management. Creating or disabling an
  // account that can administer an election is the highest-privilege action in
  // the system outside the vote itself, so each one is a named action rather
  // than a generic USER_UPDATED: an auditor filtering on ADMIN_CREATED must see
  // every grant of admin power without having to interpret a diff.
  ADMIN_CREATED: "ADMIN_CREATED",
  AUDITOR_CREATED: "AUDITOR_CREATED",
  // Identity edits (name / email). The email IS the login identity, so changing
  // it changes who can sign in as this account — which is why it is a named
  // action rather than a generic update. The row records WHICH fields changed,
  // never the addresses themselves.
  ADMIN_UPDATED: "ADMIN_UPDATED",
  AUDITOR_UPDATED: "AUDITOR_UPDATED",
  ADMIN_DEACTIVATED: "ADMIN_DEACTIVATED",
  AUDITOR_DEACTIVATED: "AUDITOR_DEACTIVATED",
  ADMIN_REACTIVATED: "ADMIN_REACTIVATED",
  AUDITOR_REACTIVATED: "AUDITOR_REACTIVATED",
  // The account exists and works; only the courtesy notification failed. Worth
  // a row so "I was never told" can be checked against the record.
  ELEVATED_ACCESS_EMAIL_FAILED: "ELEVATED_ACCESS_EMAIL_FAILED",

  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENTS_BULK_IMPORTED: "STUDENTS_BULK_IMPORTED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  STUDENT_DEACTIVATED: "STUDENT_DEACTIVATED",
  STUDENT_REACTIVATED: "STUDENT_REACTIVATED",
};
