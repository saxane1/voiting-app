import api from "./axios";

/**
 * Faculty writes. Reads go through hooks/use-faculties.js, which every module
 * since F3 already shares — this module deliberately does not add a second way
 * to fetch the same list.
 *
 * Shapes read off backend/src/controllers/faculty-controllers.js and confirmed
 * against the running API:
 *
 *   GET    /faculties      -> { faculties: [{ id, name, code, createdAt,
 *                                             updatedAt, studentCount }] }   (AUTH)
 *   POST   /faculties      -> 201 { faculty }        (ADMIN) body { name, code }
 *   PATCH  /faculties/:id  -> { faculty }            (ADMIN) name and/or code
 *   DELETE /faculties/:id  -> { message, id }        (ADMIN)
 *
 * There is NO GET /faculties/:id. The edit screen therefore reads its faculty
 * out of the shared list rather than fetching one — see faculty-edit-page.js.
 *
 * `code` is uppercased server-side, so "eng" collides with an existing "ENG".
 * The form uppercases as you type to make that visible before submitting.
 */

export async function createFaculty(payload) {
  const { data } = await api.post("/faculties", payload);

  return data.faculty;
}

export async function updateFaculty(id, payload) {
  const { data } = await api.patch(`/faculties/${id}`, payload);

  return data.faculty;
}

/**
 * Deletion is refused with 409 FACULTY_IN_USE while ANY user or election still
 * points at the faculty — see the delete guard, which counts
 * `user.count({ facultyId })` (every role, active or not) plus
 * `election.count({ facultyId })`.
 *
 * That is BROADER than the `studentCount` the list exposes, which counts only
 * ACTIVE students. So a faculty showing "0 students" can still be refused, and
 * the UI has to treat the server's answer as the authority rather than
 * promising the delete will work.
 */
export async function deleteFaculty(id) {
  const { data } = await api.delete(`/faculties/${id}`);

  return data;
}
