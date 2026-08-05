import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";

// Codes are stored and compared uppercase so "eng" and "ENG" can never coexist.
const codeField = z
  .string("code is required")
  .trim()
  .min(1, "code is required")
  .max(10, "code must be 10 characters or fewer")
  .transform((value) => value.toUpperCase());

const nameField = z.string("name is required").trim().min(1, "name is required");

const createFacultySchema = z.object({
  name: nameField,
  code: codeField,
});

const updateFacultySchema = z
  .object({
    name: nameField.optional(),
    code: codeField.optional(),
  })
  // Without this an empty PATCH body would silently succeed and write nothing.
  .refine((body) => body.name !== undefined || body.code !== undefined, {
    message: "Provide at least one of name or code",
  });

// name and code are both @unique in the schema. Checking them explicitly keeps a
// raw Prisma P2002 out of the response and lets us say WHICH field collided.
async function findConflict({ name, code, excludeId }) {
  const clashes = [];

  if (name !== undefined) clashes.push({ name });
  if (code !== undefined) clashes.push({ code });

  if (clashes.length === 0) {
    return null;
  }

  const existing = await prisma.faculty.findFirst({
    where: {
      OR: clashes,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, code: true },
  });

  if (!existing) {
    return null;
  }

  return existing.code === code
    ? `A faculty with code "${code}" already exists`
    : `A faculty named "${name}" already exists`;
}

// ---------------------------------------------------------------------------
// GET /api/faculties   (AUTH — any logged-in user)
// ---------------------------------------------------------------------------

export async function listFaculties(req, res) {
  const faculties = await prisma.faculty.findMany({
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true, createdAt: true, updatedAt: true },
  });

  // Counted in one grouped query rather than per-faculty. Only ACTIVE students
  // count — a deactivated student is not part of an electorate.
  const grouped = await prisma.user.groupBy({
    by: ["facultyId"],
    where: { role: "STUDENT", isActive: true, facultyId: { not: null } },
    _count: { _all: true },
  });

  const counts = new Map(grouped.map((row) => [row.facultyId, row._count._all]));

  return res.status(200).json({
    faculties: faculties.map((faculty) => ({
      ...faculty,
      studentCount: counts.get(faculty.id) ?? 0,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/faculties   (ADMIN)
// ---------------------------------------------------------------------------

export async function createFaculty(req, res) {
  const parsed = createFacultySchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { name, code } = parsed.data;

  const clash = await findConflict({ name, code });

  if (clash) {
    return conflict(res, clash, "FACULTY_ALREADY_EXISTS");
  }

  const faculty = await prisma.faculty.create({
    data: { name, code },
    select: { id: true, name: true, code: true, createdAt: true, updatedAt: true },
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.FACULTY_CREATED,
    entityType: "Faculty",
    entityId: faculty.id,
    meta: { ...requestContext(req), name: faculty.name, code: faculty.code },
  });

  return res.status(201).json({ faculty: { ...faculty, studentCount: 0 } });
}

// ---------------------------------------------------------------------------
// PATCH /api/faculties/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function updateFaculty(req, res) {
  const parsed = updateFacultySchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { id } = req.params;

  const existing = await prisma.faculty.findUnique({
    where: { id },
    select: { id: true, name: true, code: true },
  });

  if (!existing) {
    return notFound(res, "Faculty not found", "FACULTY_NOT_FOUND");
  }

  const { name, code } = parsed.data;

  // excludeId so re-submitting a faculty's own name/code is not a conflict.
  const clash = await findConflict({ name, code, excludeId: id });

  if (clash) {
    return conflict(res, clash, "FACULTY_ALREADY_EXISTS");
  }

  const faculty = await prisma.faculty.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(code !== undefined ? { code } : {}),
    },
    select: { id: true, name: true, code: true, createdAt: true, updatedAt: true },
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.FACULTY_UPDATED,
    entityType: "Faculty",
    entityId: faculty.id,
    meta: {
      ...requestContext(req),
      before: { name: existing.name, code: existing.code },
      after: { name: faculty.name, code: faculty.code },
    },
  });

  return res.status(200).json({ faculty });
}

// ---------------------------------------------------------------------------
// DELETE /api/faculties/:id   (ADMIN)
// ---------------------------------------------------------------------------

function describeAttachments(studentCount, electionCount) {
  const parts = [];

  if (studentCount > 0) {
    parts.push(`${studentCount} student${studentCount === 1 ? "" : "s"}`);
  }

  if (electionCount > 0) {
    parts.push(`${electionCount} election${electionCount === 1 ? "" : "s"}`);
  }

  return parts.join(" and ");
}

export async function deleteFaculty(req, res) {
  const { id } = req.params;

  const existing = await prisma.faculty.findUnique({
    where: { id },
    select: { id: true, name: true, code: true },
  });

  if (!existing) {
    return notFound(res, "Faculty not found", "FACULTY_NOT_FOUND");
  }

  // Counts ALL attached users, not just active ones: a deactivated student is
  // still a row whose facultyId would be orphaned by the delete.
  const [studentCount, electionCount] = await Promise.all([
    prisma.user.count({ where: { facultyId: id } }),
    prisma.election.count({ where: { facultyId: id } }),
  ]);

  if (studentCount > 0 || electionCount > 0) {
    return conflict(
      res,
      `Cannot delete: ${describeAttachments(studentCount, electionCount)} attached`,
      "FACULTY_IN_USE"
    );
  }

  await prisma.faculty.delete({ where: { id } });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.FACULTY_DELETED,
    entityType: "Faculty",
    entityId: existing.id,
    meta: { ...requestContext(req), name: existing.name, code: existing.code },
  });

  return res.status(200).json({ message: "Faculty deleted", id: existing.id });
}
