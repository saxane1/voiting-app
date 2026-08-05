import api from "./axios";

/**
 * Every call the admin election screens make.
 *
 * Shapes read off backend/src/controllers/election-controllers.js and confirmed
 * against the running API:
 *
 *   GET    /elections           -> { data: [...], page, limit, total }
 *   GET    /elections/:id       -> { election }            (embeds candidates)
 *   POST   /elections           -> 201 { election }
 *   PATCH  /elections/:id       -> { election }
 *   DELETE /elections/:id       -> { message, id }
 *   POST   /elections/:id/<transition> -> { election }     (+ candidateCount on /open)
 *
 * A list row carries `faculty: { id, name, code }` and `candidateCount`, so the
 * list needs no join. It ALSO carries `eligibleCount` — the frozen turnout
 * denominator — and `resultsPublishedAt`. eligibleCount is deliberately never
 * rendered by F4: turnout belongs to F7 and is admin-only there.
 *
 * Everything goes through the F0 axios instance: memory-only Bearer token,
 * `withCredentials` for the refresh cookie, single-flight 401 retry.
 */

export async function fetchElections({ page, limit, status, type, facultyId } = {}) {
  const { data } = await api.get("/elections", {
    // axios drops undefined params, so an unset filter is simply not sent and
    // the backend's own default applies.
    params: {
      page,
      limit,
      status: status || undefined,
      type: type || undefined,
      facultyId: facultyId || undefined,
    },
  });

  return {
    elections: data.data ?? [],
    page: data.page,
    limit: data.limit,
    total: data.total ?? 0,
  };
}

export async function fetchElection(id) {
  const { data } = await api.get(`/elections/${id}`);

  return data.election;
}

export async function createElection(payload) {
  const { data } = await api.post("/elections", payload);

  return data.election;
}

export async function updateElection(id, payload) {
  const { data } = await api.patch(`/elections/${id}`, payload);

  return data.election;
}

export async function deleteElection(id) {
  const { data } = await api.delete(`/elections/${id}`);

  return data;
}

/**
 * Drive a status transition. `path` is the route segment from the transition
 * descriptor (schedule | unschedule | open | close | reopen | publish) — never
 * a status name, because two different routes both target OPEN and they are not
 * interchangeable: /open freezes the electorate size, /reopen refuses once the
 * window has ended and writes a SENSITIVE audit event.
 */
export async function runElectionTransition(id, path) {
  const { data } = await api.post(`/elections/${id}/${path}`);

  return data;
}
