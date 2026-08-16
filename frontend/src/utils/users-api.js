import api from "./axios";

/**
 * Every call the elevated-account screens make (B3b), in one place.
 *
 * Shapes read off backend/src/controllers/adminstration-controllers.js and
 * confirmed against the running API:
 *
 *   GET    /users                  -> { data: [...], page, limit, total }
 *   POST   /users                  -> 201 { user, notification }
 *   PATCH  /users/:id              -> { user, changed, notification? }
 *   PATCH  /users/:id/deactivate   -> { user, changed }
 *   PATCH  /users/:id/reactivate   -> { user, changed }
 *
 * This slice manages ADMIN and AUDITOR accounts ONLY. Students are a separate
 * population with their own screens (F3) and their own endpoints; nothing here
 * can read or write one, and /users never returns a STUDENT row.
 *
 * A user row carries `isRoot`, which the table renders as a badge and which
 * disables its own deactivate control. That is a convenience, not the rule —
 * the server refuses the call regardless (ROOT_ACCOUNT_IMMUTABLE).
 *
 * Everything goes through the F0 axios instance: Bearer token from memory,
 * `withCredentials` for the refresh cookie, and the single-flight 401 retry.
 */

/** The only roles this screen can create. The server validates the same set. */
export const ELEVATED_ROLES = ["ADMIN", "AUDITOR"];

export const ROLE_LABELS = {
  ADMIN: "Administrator",
  AUDITOR: "Auditor",
};

export const ROLE_HINTS = {
  ADMIN: "Manages students, faculties, elections and candidates, and sees results.",
  AUDITOR: "Read-only oversight. Sees the audit log and nothing else.",
};

export async function fetchUsers({ page, limit, search, role } = {}) {
  const { data } = await api.get("/users", {
    // axios omits undefined params, so an unset filter simply isn't sent and
    // the backend's own default applies.
    params: {
      page,
      limit,
      search: search || undefined,
      role: role || undefined,
    },
  });

  // Renamed on the way in: `data.data` reads badly at every call site.
  return {
    users: data.data ?? [],
    page: data.page,
    limit: data.limit,
    total: data.total ?? 0,
  };
}

/**
 * Returns the WHOLE body, not just the user.
 *
 * `notification` is the second half of the answer: the account is created and
 * valid even when the notification email fails, so the caller has to be able to
 * tell "created, they were emailed" from "created, go tell them yourself". A
 * helper that returned `data.user` would throw that away and the admin would
 * never learn the message did not go out.
 */
export async function createUser(payload) {
  const { data } = await api.post("/users", payload);

  return data;
}

/**
 * Edit an account's IDENTITY — name and/or email, nothing else. Role, isRoot and
 * isActive are all refused by the server (400 FIELD_NOT_EDITABLE); activation
 * has its own endpoints below, with guards a general PATCH must not bypass.
 *
 * Returns the whole body for the same reason createUser does: `notification` is
 * present only when an EMAIL change triggered a send, and a helper that returned
 * just the user would hide a failed send from the admin who needs to act on it.
 */
export async function updateUser(id, payload) {
  const { data } = await api.patch(`/users/${id}`, payload);

  return data;
}

/**
 * Deactivation is REVERSIBLE and soft: the audit log references these accounts
 * as actors, so a hard delete would orphan the trail. Both calls are idempotent
 * and answer { user, changed } — `changed: false` meaning it was already so.
 */
export async function setUserActive(id, isActive) {
  const { data } = await api.patch(`/users/${id}/${isActive ? "reactivate" : "deactivate"}`);

  return data;
}
