import { z } from "zod";

import { prisma } from "../config/prisma.js";
// B8 realtime. Both helpers swallow their own errors, so a socket problem can
// never fail an administrative transition.
import { emitElectionStatus, flushElectionResults } from "../socket/results-broadcaster.js";
import { badRequest, conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import {
  ELECTION_STATUS,
  canTransition,
  describeIllegalTransition,
  isDeletable,
  isEditable,
} from "../utils/election-status.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const ELECTION_FIELDS = {
  id: true,
  title: true,
  type: true,
  facultyId: true,
  status: true,
  startAt: true,
  endAt: true,
  eligibleCount: true,
  resultsPublishedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

const FACULTY_SELECT = { select: { id: true, name: true, code: true } };

const titleField = z
  .string("title is required")
  .trim()
  .min(1, "title is required")
  .max(200, "title must be 200 characters or fewer");

const typeField = z.enum(["FACULTY", "UNIVERSITY"], "type must be FACULTY or UNIVERSITY");

// coerce.date accepts an ISO string and yields a Date; an unparseable value
// becomes Invalid Date, which zod reports as an invalid date rather than
// silently producing NaN downstream.
const dateTimeField = z.coerce.date("must be a valid ISO datetime");

const createElectionSchema = z
  .object({
    title: titleField,
    type: typeField,
    facultyId: z.string().trim().min(1).nullish(),
    startAt: dateTimeField,
    endAt: dateTimeField,
  })
  .refine((body) => body.startAt < body.endAt, {
    path: ["endAt"],
    message: "endAt must be after startAt",
  })
  .refine((body) => body.endAt > new Date(), {
    path: ["endAt"],
    message: "endAt must be in the future",
  });

// Every field optional, but the type<->faculty rule and the window are
// re-checked against the MERGED result, not just the submitted keys.
const updateElectionSchema = z
  .object({
    title: titleField.optional(),
    type: typeField.optional(),
    facultyId: z.string().trim().min(1).nullish(),
    startAt: dateTimeField.optional(),
    endAt: dateTimeField.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  status: z.enum(["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "PUBLISHED"]).optional(),
  type: typeField.optional(),
  facultyId: z.string().trim().min(1).optional(),
});

// Mirrors the faculty_election_has_faculty CHECK constraint in the database, so
// an admin gets a clean 400 instead of a raw Postgres constraint violation.
async function validateTypeAndFaculty(type, facultyId) {
  if (type === "FACULTY") {
    if (!facultyId) {
      return "A FACULTY election requires a facultyId";
    }

    const faculty = await prisma.faculty.findUnique({
      where: { id: facultyId },
      select: { id: true },
    });

    return faculty ? null : "No faculty exists with that facultyId";
  }

  // UNIVERSITY (Gudoomiye) is university-wide, so scoping it to a faculty is
  // contradictory rather than merely unnecessary.
  if (facultyId) {
    return "A UNIVERSITY election must not have a facultyId";
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST /api/elections   (ADMIN)
// ---------------------------------------------------------------------------

export async function createElection(req, res) {
  const parsed = createElectionSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { title, type, startAt, endAt } = parsed.data;
  const facultyId = parsed.data.facultyId ?? null;

  const problem = await validateTypeAndFaculty(type, facultyId);

  if (problem) {
    return badRequest(res, problem, "INVALID_ELECTION_SCOPE");
  }

  const election = await prisma.election.create({
    data: {
      title,
      type,
      facultyId,
      startAt,
      endAt,
      // Always DRAFT. Reaching any other status goes through a transition
      // endpoint, never through the request body.
      status: ELECTION_STATUS.DRAFT,
      eligibleCount: null, // frozen when the election is OPENed (Prompt B)
      createdById: req.user.id,
    },
    select: { ...ELECTION_FIELDS, faculty: FACULTY_SELECT },
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ELECTION_CREATED,
    entityType: "Election",
    entityId: election.id,
    meta: {
      ...requestContext(req),
      title: election.title,
      type: election.type,
      facultyId: election.facultyId,
      startAt: election.startAt,
      endAt: election.endAt,
    },
  });

  return res.status(201).json({ election });
}

// ---------------------------------------------------------------------------
// GET /api/elections   (ADMIN)
// ---------------------------------------------------------------------------

export async function listElections(req, res) {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { page, limit, status, type, facultyId } = parsed.data;

  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(facultyId ? { facultyId } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.election.count({ where }),
    prisma.election.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        ...ELECTION_FIELDS,
        faculty: FACULTY_SELECT,
        _count: { select: { candidates: true } },
      },
    }),
  ]);

  return res.status(200).json({
    data: data.map(({ _count, ...election }) => ({
      ...election,
      candidateCount: _count.candidates,
    })),
    page,
    limit,
    total,
  });
}

// ---------------------------------------------------------------------------
// GET /api/elections/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function getElection(req, res) {
  const election = await prisma.election.findUnique({
    where: { id: req.params.id },
    select: {
      ...ELECTION_FIELDS,
      faculty: FACULTY_SELECT,
      candidates: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          manifesto: true,
          photoUrl: true,
          createdAt: true,
          user: { select: { id: true, name: true, studentId: true } },
        },
      },
    },
  });

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  return res.status(200).json({
    election: { ...election, candidateCount: election.candidates.length },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/elections/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function updateElection(req, res) {
  const parsed = updateElectionSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { id } = req.params;

  const existing = await prisma.election.findUnique({
    where: { id },
    select: { ...ELECTION_FIELDS },
  });

  if (!existing) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  if (!isEditable(existing.status)) {
    return conflict(
      res,
      `An election in ${existing.status} cannot be edited. Editing is allowed only while DRAFT or SCHEDULED.`,
      "ELECTION_NOT_EDITABLE"
    );
  }

  // Merge submitted values over current ones, then validate the RESULT — a
  // partial update must not be able to leave the row in an invalid combination.
  const type = parsed.data.type ?? existing.type;
  const facultyId =
    parsed.data.facultyId !== undefined ? parsed.data.facultyId ?? null : existing.facultyId;
  const startAt = parsed.data.startAt ?? existing.startAt;
  const endAt = parsed.data.endAt ?? existing.endAt;

  if (startAt >= endAt) {
    return badRequest(res, "endAt must be after startAt", "INVALID_ELECTION_WINDOW");
  }

  const problem = await validateTypeAndFaculty(type, facultyId);

  if (problem) {
    return badRequest(res, problem, "INVALID_ELECTION_SCOPE");
  }

  const election = await prisma.election.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.type !== undefined ? { type } : {}),
      ...(parsed.data.facultyId !== undefined ? { facultyId } : {}),
      ...(parsed.data.startAt !== undefined ? { startAt } : {}),
      ...(parsed.data.endAt !== undefined ? { endAt } : {}),
    },
    select: { ...ELECTION_FIELDS, faculty: FACULTY_SELECT },
  });

  const before = {};
  const after = {};

  for (const key of ["title", "type", "facultyId", "startAt", "endAt"]) {
    const wasSubmitted = parsed.data[key] !== undefined;
    const changed = String(existing[key]) !== String(election[key]);

    if (wasSubmitted && changed) {
      before[key] = existing[key];
      after[key] = election[key];
    }
  }

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ELECTION_UPDATED,
    entityType: "Election",
    entityId: election.id,
    meta: { ...requestContext(req), before, after },
  });

  return res.status(200).json({ election });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:id/schedule  and  /unschedule   (ADMIN)
// ---------------------------------------------------------------------------

// Shared transition runner. Legality comes from the transitions map in
// election-status.js, never from a check written inline here.
async function runTransition(req, res, { to, action, data = {}, meta = {}, finalFlush = false }) {
  const { id } = req.params;

  const existing = await prisma.election.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  });

  if (!existing) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  if (!canTransition(existing.status, to)) {
    return conflict(
      res,
      describeIllegalTransition(existing.status, to),
      "ILLEGAL_STATUS_TRANSITION"
    );
  }

  const election = await prisma.election.update({
    where: { id },
    data: { status: to, ...data },
    select: { ...ELECTION_FIELDS, faculty: FACULTY_SELECT },
  });

  // B8 — announced from the shared runner rather than from each handler, so a
  // transition added later cannot forget to tell the dashboard about itself.
  // /open and /reopen have their own guarded bodies and emit separately.
  emitElectionStatus(election.id, election.status);

  if (finalFlush) {
    // /close only. The last aggregate a dashboard received could be up to one
    // throttle window old — a final tally frozen 5 seconds short of the truth,
    // with no further vote coming to correct it. Push the real final numbers
    // once, immediately, bypassing the throttle.
    flushElectionResults(election.id);
  }

  writeAudit({
    actorUserId: req.user.id,
    action,
    entityType: "Election",
    entityId: election.id,
    meta: { ...requestContext(req), from: existing.status, to, ...meta },
  });

  return res.status(200).json({ election });
}

export async function scheduleElection(req, res) {
  return runTransition(req, res, {
    to: ELECTION_STATUS.SCHEDULED,
    action: AUDIT_ACTIONS.ELECTION_SCHEDULED,
  });
}

export async function unscheduleElection(req, res) {
  return runTransition(req, res, {
    to: ELECTION_STATUS.DRAFT,
    action: AUDIT_ACTIONS.ELECTION_UNSCHEDULED,
  });
}

// ---------------------------------------------------------------------------
// Shared guards for OPEN and REOPEN
// ---------------------------------------------------------------------------

// The scope of a seat: one Gudoomiye race university-wide, one leader race per
// faculty. Two elections for the SAME seat must never be OPEN at once, or a
// student would be shown two ballots for one position and the "one person, one
// vote" receipt would be per-election rather than per-seat.
function sameScopeWhere(election) {
  return election.type === "UNIVERSITY"
    ? { type: "UNIVERSITY", status: ELECTION_STATUS.OPEN, id: { not: election.id } }
    : {
        type: "FACULTY",
        facultyId: election.facultyId,
        status: ELECTION_STATUS.OPEN,
        id: { not: election.id },
      };
}

// The frozen turnout denominator. Computed ONCE, at open. Never recomputed on
// close or reopen: if students are added or deactivated mid-election, turnout
// percentages must stay comparable to what was announced.
function eligibleCountWhere(election) {
  return {
    role: "STUDENT",
    isActive: true,
    ...(election.type === "FACULTY" ? { facultyId: election.facultyId } : {}),
  };
}

// Guard results are returned rather than thrown, so the transaction only ever
// writes after every check has passed — a refusal leaves no state change at all.
function refuse(status, code, message) {
  return { refusal: { status, code, message } };
}

function sendRefusal(res, refusal) {
  return res.status(refusal.status).json({
    error: { code: refusal.code, message: refusal.message },
  });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:id/open   (ADMIN)   DRAFT|SCHEDULED -> OPEN
// ---------------------------------------------------------------------------

export async function openElection(req, res) {
  const { id } = req.params;

  // Serializable: the concurrency guard reads "is another same-scope election
  // OPEN" and then writes OPEN. Under a weaker isolation level two simultaneous
  // /open calls could both read "no" and both succeed.
  const outcome = await prisma.$transaction(
    async (tx) => {
      const election = await tx.election.findUnique({
        where: { id },
        select: { id: true, title: true, type: true, facultyId: true, status: true, startAt: true, endAt: true },
      });

      if (!election) {
        return refuse(404, "ELECTION_NOT_FOUND", "Election not found");
      }

      // 1. Transition legality — from the map, not from an inline check.
      if (!canTransition(election.status, ELECTION_STATUS.OPEN)) {
        return refuse(
          409,
          "ILLEGAL_STATUS_TRANSITION",
          describeIllegalTransition(election.status, ELECTION_STATUS.OPEN)
        );
      }

      // 2. Window sanity. This is the future-window check deferred from PATCH:
      //    editing a stale draft is fine, opening one is not.
      const now = new Date();

      if (election.startAt >= election.endAt) {
        return refuse(400, "INVALID_ELECTION_WINDOW", "endAt must be after startAt");
      }

      if (election.endAt <= now) {
        return refuse(
          400,
          "INVALID_ELECTION_WINDOW",
          "Cannot open; the voting window has already ended. Update endAt first."
        );
      }

      // 3. Contest rule — an uncontested ballot is not an election.
      const candidateCount = await tx.candidate.count({ where: { electionId: id } });

      if (candidateCount < 2) {
        return refuse(
          409,
          "INSUFFICIENT_CANDIDATES",
          `An election needs at least 2 candidates to open; this one has ${candidateCount}`
        );
      }

      // 4. Concurrency guard.
      const conflicting = await tx.election.findFirst({
        where: sameScopeWhere(election),
        select: { id: true, title: true },
      });

      if (conflicting) {
        return refuse(
          409,
          "SCOPE_ALREADY_OPEN",
          `Another election for this scope is already open: "${conflicting.title}" (${conflicting.id}). Close it first.`
        );
      }

      // 5. Freeze the denominator, then flip.
      const eligibleCount = await tx.user.count({ where: eligibleCountWhere(election) });

      const updated = await tx.election.update({
        where: { id },
        data: { status: ELECTION_STATUS.OPEN, eligibleCount },
        select: { ...ELECTION_FIELDS, faculty: FACULTY_SELECT },
      });

      return { election: updated, from: election.status, candidateCount, eligibleCount };
    },
    { isolationLevel: "Serializable" }
  );

  if (outcome.refusal) {
    return sendRefusal(res, outcome.refusal);
  }

  // B8 — voting is live. Any dashboard already joined to this room switches to
  // its live view on this event.
  emitElectionStatus(outcome.election.id, ELECTION_STATUS.OPEN);

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ELECTION_OPENED,
    entityType: "Election",
    entityId: outcome.election.id,
    meta: {
      ...requestContext(req),
      from: outcome.from,
      to: ELECTION_STATUS.OPEN,
      eligibleCount: outcome.eligibleCount,
      candidateCount: outcome.candidateCount,
      window: { startAt: outcome.election.startAt, endAt: outcome.election.endAt },
    },
  });

  return res.status(200).json({
    election: outcome.election,
    candidateCount: outcome.candidateCount,
  });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:id/close   (ADMIN)   OPEN -> CLOSED
// ---------------------------------------------------------------------------

// Nothing is recomputed here. B6 already refuses votes outside the window; this
// is the definitive administrative stop.
export async function closeElection(req, res) {
  return runTransition(req, res, {
    to: ELECTION_STATUS.CLOSED,
    action: AUDIT_ACTIONS.ELECTION_CLOSED,
    // The one transition that ends vote collection, so the one that owes the
    // dashboard a final, unthrottled tally.
    finalFlush: true,
  });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:id/reopen   (ADMIN)   CLOSED -> OPEN
// ---------------------------------------------------------------------------

// Deliberately NOT folded into /open. Reopening a live election is the most
// dangerous administrative action in the system, so it gets its own guard block
// and its own unmistakable audit event.
export async function reopenElection(req, res) {
  const { id } = req.params;

  const outcome = await prisma.$transaction(
    async (tx) => {
      const election = await tx.election.findUnique({
        where: { id },
        select: { id: true, title: true, type: true, facultyId: true, status: true, startAt: true, endAt: true, eligibleCount: true },
      });

      if (!election) {
        return refuse(404, "ELECTION_NOT_FOUND", "Election not found");
      }

      // 1. Only from CLOSED. PUBLISHED is terminal in the map, so a published
      //    result can never be reopened for more voting.
      if (!canTransition(election.status, ELECTION_STATUS.OPEN)) {
        return refuse(
          409,
          "ILLEGAL_STATUS_TRANSITION",
          describeIllegalTransition(election.status, ELECTION_STATUS.OPEN)
        );
      }

      // 2. THE INTEGRITY FENCE. Reopening may only restore voting that should
      //    still be happening. Once endAt has passed, the election is over and
      //    no administrator can add ballots to it.
      if (election.endAt <= new Date()) {
        return refuse(
          409,
          "WINDOW_ENDED",
          "Cannot reopen; the voting window has ended."
        );
      }

      // 3. Re-check concurrency — another election for this seat may have been
      //    opened while this one was closed.
      const conflicting = await tx.election.findFirst({
        where: sameScopeWhere(election),
        select: { id: true, title: true },
      });

      if (conflicting) {
        return refuse(
          409,
          "SCOPE_ALREADY_OPEN",
          `Another election for this scope is already open: "${conflicting.title}" (${conflicting.id}). Close it first.`
        );
      }

      // 4. eligibleCount is NOT touched — it stays frozen at its original value.
      const updated = await tx.election.update({
        where: { id },
        data: { status: ELECTION_STATUS.OPEN },
        select: { ...ELECTION_FIELDS, faculty: FACULTY_SELECT },
      });

      return { election: updated, from: election.status };
    },
    { isolationLevel: "Serializable" }
  );

  if (outcome.refusal) {
    return sendRefusal(res, outcome.refusal);
  }

  // B8 — voting is live again. Emitted for the same reason the audit event is
  // SENSITIVE: anyone watching this election should see the reopen happen.
  emitElectionStatus(outcome.election.id, ELECTION_STATUS.OPEN);

  // When it was closed, taken from the audit trail rather than a column, so the
  // reviewer sees the actual close event this reopen undid.
  const lastClose = await prisma.auditLog.findFirst({
    where: { entityType: "Election", entityId: id, action: AUDIT_ACTIONS.ELECTION_CLOSED },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ELECTION_REOPENED,
    entityType: "Election",
    entityId: outcome.election.id,
    meta: {
      ...requestContext(req),
      severity: "SENSITIVE",
      detail: "A closed election was reopened while its voting window was still live",
      from: outcome.from,
      to: ELECTION_STATUS.OPEN,
      closedAt: lastClose?.createdAt ?? null,
      reopenedAt: new Date(),
      byAdmin: req.user.id,
      eligibleCount: outcome.election.eligibleCount, // frozen, unchanged
    },
  });

  return res.status(200).json({ election: outcome.election });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:id/publish   (ADMIN)   CLOSED -> PUBLISHED
// ---------------------------------------------------------------------------

// Bookkeeping ONLY. Results stay ADMIN-only in the app — there is no public
// results endpoint and there will not be one. The university announces officially.
export async function publishElection(req, res) {
  return runTransition(req, res, {
    to: ELECTION_STATUS.PUBLISHED,
    action: AUDIT_ACTIONS.ELECTION_PUBLISHED,
    data: { resultsPublishedAt: new Date() },
    meta: { note: "Bookkeeping only; results remain admin-only in the app" },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/elections/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function deleteElection(req, res) {
  const { id } = req.params;

  const existing = await prisma.election.findUnique({
    where: { id },
    select: { id: true, title: true, type: true, status: true, facultyId: true },
  });

  if (!existing) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  if (!isDeletable(existing.status)) {
    return conflict(
      res,
      `An election in ${existing.status} cannot be deleted. Deletion is allowed only while DRAFT.`,
      "ELECTION_NOT_DELETABLE"
    );
  }

  // Candidates cascade from the schema; a DRAFT election can hold no receipts
  // or votes, so nothing else can be orphaned by this.
  await prisma.election.delete({ where: { id } });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ELECTION_DELETED,
    entityType: "Election",
    entityId: existing.id,
    meta: {
      ...requestContext(req),
      title: existing.title,
      type: existing.type,
      facultyId: existing.facultyId,
    },
  });

  return res.status(200).json({ message: "Election deleted", id: existing.id });
}
