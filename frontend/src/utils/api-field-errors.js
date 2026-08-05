import { apiErrorCode, apiErrorMessage } from "./api-error";

/**
 * Turns a backend failure into per-field form errors, so a rejection lands on
 * the input that caused it instead of in a banner the admin has to map back to
 * a field themselves.
 *
 * Two shapes are handled (backend/src/utils/api-response.js):
 *
 *   400 VALIDATION_ERROR — carries `details: [{ path, message }]`, where `path`
 *        is the zod path ("email", "studentId", …). Direct hit.
 *
 *   409 STUDENT_ALREADY_EXISTS — carries NO field, only a message. The
 *        controller emits exactly one of two sentences and the wording is the
 *        only thing that says which unique column collided:
 *          A user with email "x@psu.edu.so" already exists
 *          A student with studentId "PSU-1021" already exists
 *        Both are matched from the start of the string, so an address that
 *        happens to contain the word "studentid" cannot be misfiled.
 */

const CONFLICT_PATTERNS = [
  [/^A user with email\b/i, "email"],
  [/^A student with studentId\b/i, "studentId"],
];

/** Codes whose whole meaning is "the faculty you picked is wrong". */
const FACULTY_CODES = new Set(["FACULTY_NOT_FOUND"]);

/**
 * @returns {{ fields: Record<string,string>, formError: string|null }}
 *   `fields` is keyed by form field name; `formError` is whatever could not be
 *   attributed to one and must be shown at form level instead of dropped.
 */
export function fieldErrorsFromApi(error, fallback = "Something went wrong. Please try again.") {
  const code = apiErrorCode(error);
  const message = apiErrorMessage(error, fallback);
  const details = error?.response?.data?.error?.details;

  if (code === "VALIDATION_ERROR" && Array.isArray(details) && details.length > 0) {
    const fields = {};
    const unattributed = [];

    for (const detail of details) {
      const path = String(detail?.path || "").split(".")[0];

      if (path) {
        // First message per field wins — zod can report several on one value
        // and stacking them under an input just makes noise.
        if (!fields[path]) fields[path] = detail.message;
      } else {
        unattributed.push(detail?.message);
      }
    }

    return {
      fields,
      formError: unattributed.filter(Boolean).join(" ") || null,
    };
  }

  if (FACULTY_CODES.has(code)) {
    return { fields: { facultyId: message }, formError: null };
  }

  if (code === "STUDENT_ALREADY_EXISTS") {
    for (const [pattern, field] of CONFLICT_PATTERNS) {
      if (pattern.test(message)) {
        return { fields: { [field]: message }, formError: null };
      }
    }
  }

  return { fields: {}, formError: message };
}
