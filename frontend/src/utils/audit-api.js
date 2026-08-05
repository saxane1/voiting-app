import api from "./axios";

/**
 * The one call the audit viewer makes: GET /api/audit (B9).
 *
 * Shape read off backend/src/controllers/audit-controllers.js and confirmed
 * against the running API:
 *
 *   GET /audit -> {
 *     data: [{
 *       id, action, entityType|null, entityId|null, metadata|null, createdAt,
 *       actor: { id, name, email, role, isSystem }
 *     }],
 *     page, limit, total
 *   }
 *
 * `actor` is ALWAYS an object — the controller substitutes a named
 * "System / anonymous" actor for rows whose actorUserId is null, so a template
 * can read actor.name unconditionally.
 *
 * WHAT THIS ENDPOINT DOES NOT RETURN, and why the viewer never asks for it:
 * the controller queries auditLog and user, and nothing else. It never joins to
 * Vote. A VOTE_CAST row therefore carries an actor, entityType "Election", the
 * election's id, an hour-floored createdAt and metadata
 * { ip, userAgent, electionId, participation: true } — no candidateId, no vote
 * id, no chain hash. There is no parameter that would make it return one, and
 * this module deliberately offers none.
 *
 * READS OF THIS LOG ARE NOT AUDITED (docs/API-Map.md B9) — this is a GET and
 * there is no write path here to invent. Opening the viewer leaves no trace,
 * unlike opening the results dashboard.
 */

/** The backend's own zod defaults (audit-controllers.js). */
export const AUDIT_DEFAULT_LIMIT = 25;

/**
 * `limit` is `.max(100)` in the schema, and zod's max REJECTS rather than
 * clamps — 101 is a 400, not a quietly trimmed 100. The page-size control is
 * therefore built from a fixed list that cannot express a value the API refuses.
 */
export const AUDIT_MAX_LIMIT = 100;

export const AUDIT_PAGE_SIZES = [25, 50, 100];

/**
 * Filters are passed through exactly as the backend defines them. Two rules are
 * enforced HERE rather than left to the server, because both are cheap to
 * respect and expensive to hit:
 *
 *   - `entityId` without `entityType` is a 400 (the [entityType, entityId]
 *     index is keyed on the type, and the same uuid could in principle appear
 *     under two types). An unpaired id is dropped rather than sent.
 *   - empty strings are dropped, not sent as "" — every string filter is
 *     `.min(1)`, so an empty box would turn into a validation error instead of
 *     meaning "no filter".
 */
export async function fetchAuditLog({
  page,
  limit,
  action,
  actorUserId,
  entityType,
  entityId,
  from,
  to,
} = {}) {
  const { data } = await api.get("/audit", {
    // axios omits undefined params entirely, so an unset filter is simply not
    // in the query string and the backend's own default applies.
    params: {
      page,
      limit,
      action: action || undefined,
      actorUserId: actorUserId || undefined,
      entityType: entityType || undefined,
      entityId: entityType && entityId ? entityId : undefined,
      from: from || undefined,
      to: to || undefined,
    },
  });

  // Renamed on the way in: `data.data` reads badly at every call site.
  return {
    entries: data.data ?? [],
    page: data.page,
    limit: data.limit,
    total: data.total ?? 0,
  };
}
