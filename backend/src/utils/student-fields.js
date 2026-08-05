import { z } from "zod";

// Single source of truth for what a valid student field looks like. Imported by
// BOTH the create-one endpoint and the bulk Excel import, so a rule can never be
// enforced on one path and not the other.

// Normalize before validating, so " Ali@PSU.EDU " is stored and later looked up
// the same way the login flow normalizes it.
export const emailField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("A valid email address is required")
);

export const studentIdField = z
  .string("studentId is required")
  .trim()
  .min(1, "studentId is required")
  .max(50, "studentId must be 50 characters or fewer");

export const nameField = z
  .string("name is required")
  .trim()
  .min(1, "name is required")
  .max(150, "name must be 150 characters or fewer");

export const facultyIdField = z
  .string("facultyId is required")
  .trim()
  .min(1, "facultyId is required");

// The three identity fields a student row must carry, however it arrives.
// Faculty is resolved separately: by id on create-one, by code-or-name in bulk.
export const studentRowSchema = z.object({
  name: nameField,
  email: emailField,
  studentId: studentIdField,
});

// Faculty codes and names are matched case- and whitespace-insensitively.
export function normalizeFacultyKey(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}
