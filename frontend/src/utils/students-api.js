import api from "./axios";

/**
 * Every call the admin student screens make, in one place.
 *
 * The shapes below were read off backend/src/controllers/student-controllers.js
 * and confirmed against the running API, so the components never guess at an
 * envelope:
 *
 *   GET    /students            -> { data: [...], page, limit, total }
 *   GET    /students/:id        -> { student }
 *   POST   /students            -> 201 { student }
 *   PATCH  /students/:id        -> { student }
 *   PATCH  /students/:id/deactivate -> { student, changed }
 *   PATCH  /students/:id/reactivate -> { student, changed }
 *   POST   /students/bulk       -> { imported, failed, total, errors: [...] }
 *
 * A student row carries `faculty: { id, name, code }` alongside `facultyId`, so
 * the list needs NO client-side join against GET /faculties to show a faculty
 * name. (The faculty query is still used — for the filter and the form select.)
 *
 * Everything goes through the F0 axios instance: Bearer token from memory,
 * `withCredentials` for the refresh cookie, and the single-flight 401 retry.
 */

/** The file field name multer expects (backend/src/middleware/upload.js). */
export const IMPORT_FILE_FIELD = "file";

/** multer's fileFilter accepts this extension only. */
export const IMPORT_ACCEPT = ".xlsx";

/** multer's `limits.fileSize`. Checked here too so a 6MB roster fails instantly. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** The header row the importer looks for, in the order the template writes them. */
export const IMPORT_COLUMNS = ["name", "email", "studentId", "faculty"];

export async function fetchStudents({ page, limit, search, facultyId, active } = {}) {
  const { data } = await api.get("/students", {
    // axios omits undefined params, so an unset filter simply isn't sent and
    // the backend's own default applies.
    params: {
      page,
      limit,
      search: search || undefined,
      facultyId: facultyId || undefined,
      active: active || undefined,
    },
  });

  // Renamed on the way in: `data.data` reads badly at every call site.
  return {
    students: data.data ?? [],
    page: data.page,
    limit: data.limit,
    total: data.total ?? 0,
  };
}

export async function fetchStudent(id) {
  const { data } = await api.get(`/students/${id}`);

  return data.student;
}

export async function createStudent(payload) {
  const { data } = await api.post("/students", payload);

  return data.student;
}

export async function updateStudent(id, payload) {
  const { data } = await api.patch(`/students/${id}`, payload);

  return data.student;
}

/**
 * Deactivation is REVERSIBLE: the backend exposes both
 * PATCH /students/:id/deactivate and PATCH /students/:id/reactivate, both
 * idempotent (repeating one returns 200 with `changed: false`).
 */
export async function setStudentActive(id, isActive) {
  const { data } = await api.patch(`/students/${id}/${isActive ? "reactivate" : "deactivate"}`);

  return data;
}

export async function importStudents(file, { onProgress } = {}) {
  const formData = new FormData();

  formData.append(IMPORT_FILE_FIELD, file);

  const { data } = await api.post("/students/bulk", formData, {
    // The instance defaults to application/json, and axios turns FormData into
    // a JSON body when it sees that content type. Naming multipart here stops
    // that, and axios then clears the header so the browser can set the
    // multipart boundary itself — which multer needs to parse the part at all.
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null)
      : undefined,
  });

  return data;
}
