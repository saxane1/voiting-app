import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { badRequest, conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import { isEditable } from "../utils/election-status.js";

const MAX_MANIFESTO_LENGTH = 5000;

const manifestoField = z
  .string()
  .trim()
  .max(MAX_MANIFESTO_LENGTH, `manifesto must be ${MAX_MANIFESTO_LENGTH} characters or fewer`);

const photoUrlField = z.url("photoUrl must be a valid URL");

const addCandidateSchema = z.object({
  userId: z.string("userId is required").trim().min(1, "userId is required"),
  manifesto: manifestoField.nullish(),
  photoUrl: photoUrlField.nullish(),
});

const updateCandidateSchema = z
  .object({
    manifesto: manifestoField.nullish(),
    photoUrl: photoUrlField.nullish(),
  })
  .refine((body) => body.manifesto !== undefined || body.photoUrl !== undefined, {
    message: "Provide at least one of manifesto or photoUrl",
  });

// The candidate roster is frozen the moment an election leaves DRAFT/SCHEDULED.
// Same rule for add, edit and remove: /open counts candidates and freezes
// eligibleCount against them, so the ballot a voter sees must not shift underneath.
function candidatesLocked(res, status) {
  return conflict(
    res,
    `Candidates can't be changed once an election is ${status}.`,
    "CANDIDATES_LOCKED"
  );
}

// ---------------------------------------------------------------------------
// GET /api/elections/:electionId/candidates   (AUTH — any logged-in user)
// ---------------------------------------------------------------------------

// AUTH-level because students see this on their ballot. Candidate identity is
// not secret — but the LEAN shape is deliberate: no email, no studentId, and
// above all no tally. Results are ADMIN-only (B7) and never surface here.
export async function listCandidates(req, res) {
  const { electionId } = req.params;

  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true },
  });

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  const candidates = await prisma.candidate.findMany({
    where: { electionId },
    orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      manifesto: true,
      photoUrl: true,
      userId: true,
      user: { select: { name: true } },
    },
  });

  return res.status(200).json({
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.user.name,
      manifesto: candidate.manifesto,
      photoUrl: candidate.photoUrl,
      userId: candidate.userId,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:electionId/candidates   (ADMIN)
// ---------------------------------------------------------------------------

export async function addCandidate(req, res) {
  const parsed = addCandidateSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { electionId } = req.params;
  const { userId, manifesto, photoUrl } = parsed.data;

  // 1. Election must exist and still be editable.
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true, type: true, facultyId: true, status: true, faculty: { select: { code: true } } },
  });

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  if (!isEditable(election.status)) {
    return candidatesLocked(res, election.status);
  }

  // 2. The nominee must be a real, active student.
  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      facultyId: true,
      faculty: { select: { code: true } },
    },
  });

  if (!student) {
    return notFound(res, "No user exists with that userId", "USER_NOT_FOUND");
  }

  if (student.role !== "STUDENT") {
    return badRequest(
      res,
      "Only students can be candidates; administrators and auditors cannot stand for election",
      "NOT_A_STUDENT"
    );
  }

  if (!student.isActive) {
    return badRequest(
      res,
      "That student is deactivated and cannot be registered as a candidate",
      "STUDENT_INACTIVE"
    );
  }

  // 3. Faculty match — only meaningful for a FACULTY election. A UNIVERSITY
  //    (Gudoomiye) race is open to any active student.
  if (election.type === "FACULTY" && student.facultyId !== election.facultyId) {
    return badRequest(
      res,
      `Candidate belongs to faculty ${student.faculty?.code ?? student.facultyId ?? "none"}, but this election is for faculty ${election.faculty?.code ?? election.facultyId}`,
      "FACULTY_MISMATCH"
    );
  }

  // 4. One candidacy per student per election. Standing in a DIFFERENT election
  //    at the same time is legitimate and deliberately not blocked.
  const existing = await prisma.candidate.findUnique({
    where: { electionId_userId: { electionId, userId } },
    select: { id: true },
  });

  if (existing) {
    return conflict(
      res,
      "That student is already a candidate in this election",
      "ALREADY_CANDIDATE"
    );
  }

  const candidate = await prisma.candidate.create({
    data: {
      electionId,
      userId,
      manifesto: manifesto ?? null,
      photoUrl: photoUrl ?? null,
    },
    select: {
      id: true,
      electionId: true,
      userId: true,
      manifesto: true,
      photoUrl: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.CANDIDATE_ADDED,
    entityType: "Candidate",
    entityId: candidate.id,
    meta: {
      ...requestContext(req),
      electionId,
      userId,
      electionType: election.type,
      electionFacultyId: election.facultyId,
    },
  });

  return res.status(201).json({
    candidate: {
      id: candidate.id,
      name: candidate.user.name,
      manifesto: candidate.manifesto,
      photoUrl: candidate.photoUrl,
      userId: candidate.userId,
      electionId: candidate.electionId,
      createdAt: candidate.createdAt,
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/candidates/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function updateCandidate(req, res) {
  const parsed = updateCandidateSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { id } = req.params;

  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true,
      manifesto: true,
      photoUrl: true,
      userId: true,
      electionId: true,
      election: { select: { status: true } },
    },
  });

  if (!existing) {
    return notFound(res, "Candidate not found", "CANDIDATE_NOT_FOUND");
  }

  // Presentation is frozen with the roster: a manifesto must not change under a
  // voter mid-election any more than the list of names can.
  if (!isEditable(existing.election.status)) {
    return candidatesLocked(res, existing.election.status);
  }

  const { manifesto, photoUrl } = parsed.data;

  const candidate = await prisma.candidate.update({
    where: { id },
    data: {
      ...(manifesto !== undefined ? { manifesto: manifesto ?? null } : {}),
      ...(photoUrl !== undefined ? { photoUrl: photoUrl ?? null } : {}),
    },
    select: {
      id: true,
      manifesto: true,
      photoUrl: true,
      userId: true,
      electionId: true,
      user: { select: { name: true } },
    },
  });

  const before = {};
  const after = {};

  for (const key of ["manifesto", "photoUrl"]) {
    if (parsed.data[key] !== undefined && existing[key] !== candidate[key]) {
      before[key] = existing[key];
      after[key] = candidate[key];
    }
  }

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.CANDIDATE_UPDATED,
    entityType: "Candidate",
    entityId: candidate.id,
    meta: { ...requestContext(req), electionId: candidate.electionId, before, after },
  });

  return res.status(200).json({
    candidate: {
      id: candidate.id,
      name: candidate.user.name,
      manifesto: candidate.manifesto,
      photoUrl: candidate.photoUrl,
      userId: candidate.userId,
      electionId: candidate.electionId,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/candidates/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function removeCandidate(req, res) {
  const { id } = req.params;

  const existing = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      electionId: true,
      election: { select: { status: true } },
    },
  });

  if (!existing) {
    return notFound(res, "Candidate not found", "CANDIDATE_NOT_FOUND");
  }

  // The editable-status guard is what makes a HARD delete safe here: an election
  // that has never been OPEN can have no Vote rows pointing at this candidate,
  // so there is nothing to orphan and no tally to corrupt.
  if (!isEditable(existing.election.status)) {
    return candidatesLocked(res, existing.election.status);
  }

  await prisma.candidate.delete({ where: { id } });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.CANDIDATE_REMOVED,
    entityType: "Candidate",
    entityId: existing.id,
    meta: { ...requestContext(req), electionId: existing.electionId, userId: existing.userId },
  });

  return res.status(200).json({ message: "Candidate removed", id: existing.id });
}
