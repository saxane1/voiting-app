import { apiErrorCode, apiErrorMessage } from "./api-error";
import { CANDIDATE_PICKER_ERROR_CODES } from "./candidate-rules";

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

/**
 * 409s that name their field only in prose, per error code.
 *
 * Each controller picks one of two sentences and the wording is the only thing
 * that says which unique column collided. Patterns are anchored at the start of
 * the string so a value that happens to contain one of these words (an email
 * like "studentid@psu.edu.so", a faculty named "Faculty with code X") cannot be
 * misfiled.
 */
const CONFLICT_FIELD_PATTERNS = {
  STUDENT_ALREADY_EXISTS: [
    [/^A user with email\b/i, "email"],
    [/^A student with studentId\b/i, "studentId"],
  ],
  FACULTY_ALREADY_EXISTS: [
    [/^A faculty with code\b/i, "code"],
    [/^A faculty named\b/i, "name"],
  ],
};

/**
 * Error codes that carry no `details` but whose whole meaning IS one field.
 *
 * INVALID_ELECTION_SCOPE covers all three type/faculty refusals a FACULTY or
 * UNIVERSITY election can draw ("requires a facultyId", "must not have a
 * facultyId", "No faculty exists with that facultyId") — every one of them is
 * about the faculty the admin picked, or failed to.
 *
 * INVALID_ELECTION_WINDOW is the PATCH-time endAt<=startAt refusal and the
 * open-time "window has already ended". Both are answered on endAt, which is
 * the field the admin has to move in either case.
 *
 * The five candidate codes all answer the same question — "that student cannot
 * be attached to this election" — so they land on `userId`, the field holding
 * the chosen student. CANDIDATES_LOCKED is deliberately NOT here: it is about
 * the election's status rather than the student, and the add form is about to
 * be replaced by a read-only roster, so it must surface at screen level.
 */
const FIELD_BY_CODE = {
  FACULTY_NOT_FOUND: "facultyId",
  INVALID_ELECTION_SCOPE: "facultyId",
  INVALID_ELECTION_WINDOW: "endAt",

  ...Object.fromEntries(CANDIDATE_PICKER_ERROR_CODES.map((code) => [code, "userId"])),
};

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

  if (FIELD_BY_CODE[code]) {
    return { fields: { [FIELD_BY_CODE[code]]: message }, formError: null };
  }

  if (CONFLICT_FIELD_PATTERNS[code]) {
    for (const [pattern, field] of CONFLICT_FIELD_PATTERNS[code]) {
      if (pattern.test(message)) {
        return { fields: { [field]: message }, formError: null };
      }
    }
  }

  return { fields: {}, formError: message };
}
