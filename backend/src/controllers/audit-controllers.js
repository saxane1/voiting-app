import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { validationError } from "../utils/api-response.js";

// ---------------------------------------------------------------------------
// B9 — THE AUDIT LOG VIEWER. Read-only, ADMIN or AUDITOR.
//
// Writing happens across B1–B8 through utils/audit.js. Nothing in this file
// writes, and nothing in this file may change what a write stores.
//
// SECRECY BOUNDARY FOR THIS WHOLE FILE (design rule 1, same rigor as B7):
//   This module queries auditLog and user. It does NOT query Vote, and it must
//   never query Vote — not for VOTE_CAST, not for anything, not "just to show
//   the candidate name". A VOTE_CAST row records participation only: an actor,
//   an election, and an hour-floored time. There is no candidateId, no vote id
//   and no hash in the stored row, and joining one in here would rebuild
//   exactly the voter -> ballot link that the two unlinked tables exist to
//   prevent. Rows are displayed AS STORED.
//
//   The ONE enrichment allowed is resolving actorUserId to a display identity.
//   That is a User lookup on a foreign key that is already in the row — it
//   reveals nothing the row did not already contain. PII (name/email) is fine
//   here: the audience is ADMIN and AUDITOR, and an audit trail naming "user
//   3f9a..." and nothing else is not an audit trail anyone can act on.
//
// NOT AUDITED: reads of this endpoint. Logging every view of the log would
// grow the table on read, drown the real signal in viewer noise, and (since
// the viewer is itself an audited surface) invite recursion. Reading a
// forensic record is not a state change.
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Accepts a plain date (2026-08-03) or a full ISO datetime. Deliberately not
// z.coerce.date(), which happily turns "5" and "not-a-date"-adjacent junk into
// a Date rather than a 400 — a filter that silently means something other than
// what the auditor typed is worse than a rejected one.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ][\d:.+\-Z]*)?$/i;

const isoDateField = z
  .string()
  .trim()
  .regex(ISO_DATE_PATTERN, "Must be an ISO date (2026-08-03) or datetime (2026-08-03T14:30:00Z)")
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), "Not a valid date");

// `action` is a free string, not an enum of AUDIT_ACTIONS. The log is a
// historical record: an action name that was retired from the constant map
// still exists in rows already written, and an auditor must still be able to
// filter for it. Matching is exact — no partial search, so the [action,
// createdAt] index is usable.
const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    action: z.string().trim().min(1).optional(),
    actorUserId: z.string().trim().min(1).optional(),
    entityType: z.string().trim().min(1).optional(),
    entityId: z.string().trim().min(1).optional(),
    from: isoDateField.optional(),
    to: isoDateField.optional(),
  })
  // entityId alone cannot use the [entityType, entityId] index (entityType is
  // the leading column) and is ambiguous besides — the same uuid could in
  // principle appear as two entity types. Require the pair.
  .refine((query) => !(query.entityId && !query.entityType), {
    path: ["entityType"],
    message: "entityType is required when filtering by entityId",
  })
  .refine((query) => !(query.from && query.to) || query.from <= query.to, {
    path: ["from"],
    message: "from must be earlier than or equal to to",
  });

// Rows written by the system itself, or on behalf of someone who turned out not
// to exist (OTP_REQUESTED_UNKNOWN_EMAIL is the common one — an unknown email is
// never resolved to a user, by design, so there is no actor to record). These
// are real, meaningful entries; they are rendered as a named non-user actor so
// a viewer template can read actor.name unconditionally and never null-crash.
const SYSTEM_ACTOR = Object.freeze({
  id: null,
  name: "System / anonymous",
  email: null,
  role: null,
  isSystem: true,
});

const ACTOR_FIELDS = { id: true, name: true, email: true, role: true };

function presentActor(actor) {
  if (!actor) {
    return SYSTEM_ACTOR;
  }

  return { ...actor, isSystem: false };
}

// ---------------------------------------------------------------------------
// GET /api/audit   (ADMIN or AUDITOR)
//
// Index usage — every supported filter is served by an index declared on
// AuditLog, which is why the filter set is exactly this and not "anything":
//   action (+ ordering)    -> @@index([action, createdAt])
//   actorUserId            -> @@index([actorUserId])
//   entityType + entityId  -> @@index([entityType, entityId])
//   from/to alone          -> a range on createdAt; no dedicated index, so this
//                             is the one filter that can degrade to a scan on a
//                             large table. Combined with action it rides the
//                             composite index's second column.
// ---------------------------------------------------------------------------

export async function listAudit(req, res) {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { page, limit, action, actorUserId, entityType, entityId, from, to } = parsed.data;

  const createdAt = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };

  const where = {
    ...(action ? { action } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };

  // id is the tiebreaker: audit rows are written in bursts and VOTE_CAST rows
  // share an hour-floored createdAt by design, so createdAt alone is not a
  // total order and pages would overlap or skip without it.
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        // The only relation loaded, and the only one that ever may be. Note
        // what is NOT selected: the actor's faculty, their receipts, their
        // candidacies. An auditor needs to know who acted, not to walk the
        // graph outward from them.
        actor: { select: ACTOR_FIELDS },
      },
    }),
  ]);

  // metadata is passed through exactly as it was stored. Whatever a write path
  // put there is what an auditor sees — this endpoint does not reshape, filter
  // or supplement the recorded facts.
  const data = rows.map((row) => ({ ...row, actor: presentActor(row.actor) }));

  return res.status(200).json({ data, page, limit, total });
}
