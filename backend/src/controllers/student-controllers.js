import ExcelJS from "exceljs";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { badRequest, conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import { normalizeEmail } from "../utils/email.js";
import {
  emailField,
  facultyIdField,
  nameField,
  normalizeFacultyKey,
  studentIdField,
  studentRowSchema,
} from "../utils/student-fields.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// Shape returned for a student everywhere in this controller. Nothing here is
// ballot-related and nothing ever should be: a student record must never carry
// how they voted, only who they are.
const STUDENT_FIELDS = {
  id: true,
  email: true,
  name: true,
  studentId: true,
  facultyId: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const createStudentSchema = z.object({
  email: emailField,
  studentId: studentIdField,
  name: nameField,
  facultyId: facultyIdField,
});

// role is deliberately absent: it cannot be changed through this endpoint, and
// zod strips unknown keys, so passing one is silently ignored rather than obeyed.
const updateStudentSchema = z
  .object({
    email: emailField.optional(),
    studentId: studentIdField.optional(),
    name: nameField.optional(),
    facultyId: facultyIdField.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one of name, email, studentId or facultyId",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  search: z.string().trim().min(1).optional(),
  facultyId: z.string().trim().min(1).optional(),
  active: z.enum(["true", "false", "all"]).default("all"),
});

// email and studentId are both @unique on User. Checked explicitly so a raw
// Prisma P2002 never reaches the client and the message can name the field.
async function findDuplicate({ email, studentId, excludeId }) {
  const clashes = [];

  if (email !== undefined) clashes.push({ email });
  if (studentId !== undefined) clashes.push({ studentId });

  if (clashes.length === 0) {
    return null;
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: clashes,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, email: true, studentId: true },
  });

  if (!existing) {
    return null;
  }

  return existing.email === email
    ? `A user with email "${email}" already exists`
    : `A student with studentId "${studentId}" already exists`;
}

async function facultyExists(facultyId) {
  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { id: true },
  });

  return Boolean(faculty);
}

// ---------------------------------------------------------------------------
// POST /api/students   (ADMIN)
// ---------------------------------------------------------------------------

export async function createStudent(req, res) {
  const parsed = createStudentSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { email, studentId, name, facultyId } = parsed.data;

  if (!(await facultyExists(facultyId))) {
    return badRequest(res, "No faculty exists with that facultyId", "FACULTY_NOT_FOUND");
  }

  const duplicate = await findDuplicate({ email, studentId });

  if (duplicate) {
    return conflict(res, duplicate, "STUDENT_ALREADY_EXISTS");
  }

  const student = await prisma.user.create({
    data: {
      email: normalizeEmail(email),
      studentId,
      name,
      facultyId,
      role: "STUDENT", // forced — never taken from the request body
      isActive: true,
    },
    select: STUDENT_FIELDS,
  });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.STUDENT_CREATED,
    entityType: "User",
    entityId: student.id,
    meta: {
      ...requestContext(req),
      studentId: student.studentId,
      facultyId: student.facultyId,
    },
  });

  return res.status(201).json({ student });
}

// ---------------------------------------------------------------------------
// GET /api/students   (ADMIN)
// ---------------------------------------------------------------------------

export async function listStudents(req, res) {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { page, limit, search, facultyId, active } = parsed.data;

  const where = {
    role: "STUDENT",
    ...(facultyId ? { facultyId } : {}),
    ...(active === "all" ? {} : { isActive: active === "true" }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { studentId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // id is the tiebreaker so pagination stays stable when names collide.
  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        ...STUDENT_FIELDS,
        faculty: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  return res.status(200).json({ data, page, limit, total });
}

// ---------------------------------------------------------------------------
// GET /api/students/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function getStudent(req, res) {
  const student = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      ...STUDENT_FIELDS,
      faculty: { select: { id: true, name: true, code: true } },
    },
  });

  // An ADMIN or AUDITOR id must 404 here rather than leak through a
  // student-management endpoint.
  if (!student || student.role !== "STUDENT") {
    return notFound(res, "Student not found", "STUDENT_NOT_FOUND");
  }

  return res.status(200).json({ student });
}

// ---------------------------------------------------------------------------
// PATCH /api/students/:id   (ADMIN)
// ---------------------------------------------------------------------------

export async function updateStudent(req, res) {
  const parsed = updateStudentSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { id } = req.params;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, studentId: true, facultyId: true, role: true },
  });

  if (!existing || existing.role !== "STUDENT") {
    return notFound(res, "Student not found", "STUDENT_NOT_FOUND");
  }

  const { email, studentId, name, facultyId } = parsed.data;

  if (facultyId !== undefined && !(await facultyExists(facultyId))) {
    return badRequest(res, "No faculty exists with that facultyId", "FACULTY_NOT_FOUND");
  }

  const duplicate = await findDuplicate({ email, studentId, excludeId: id });

  if (duplicate) {
    return conflict(res, duplicate, "STUDENT_ALREADY_EXISTS");
  }

  const student = await prisma.user.update({
    where: { id },
    data: {
      ...(email !== undefined ? { email: normalizeEmail(email) } : {}),
      ...(studentId !== undefined ? { studentId } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(facultyId !== undefined ? { facultyId } : {}),
    },
    select: {
      ...STUDENT_FIELDS,
      faculty: { select: { id: true, name: true, code: true } },
    },
  });

  // Only the fields that actually changed, so the log stays readable.
  const before = {};
  const after = {};

  for (const key of ["email", "studentId", "name", "facultyId"]) {
    if (parsed.data[key] !== undefined && existing[key] !== student[key]) {
      before[key] = existing[key];
      after[key] = student[key];
    }
  }

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.STUDENT_UPDATED,
    entityType: "User",
    entityId: student.id,
    meta: { ...requestContext(req), before, after },
  });

  return res.status(200).json({ student });
}

// ---------------------------------------------------------------------------
// PATCH /api/students/:id/deactivate  and  /reactivate   (ADMIN)
// ---------------------------------------------------------------------------

// SOFT only. Hard-deleting a student would orphan their VoteReceipt and audit
// rows — destroying the participation record that proves the election was run
// correctly. Deactivation blocks login (refresh kills the session family with
// reason DEACTIVATED) and voting, while the history survives.
async function setActive(req, res, { isActive, action }) {
  const { id } = req.params;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, studentId: true },
  });

  if (!existing || existing.role !== "STUDENT") {
    return notFound(res, "Student not found", "STUDENT_NOT_FOUND");
  }

  // Idempotent: repeating the call is a no-op success, not an error.
  const alreadyInState = existing.isActive === isActive;

  const student = alreadyInState
    ? await prisma.user.findUnique({ where: { id }, select: STUDENT_FIELDS })
    : await prisma.user.update({ where: { id }, data: { isActive }, select: STUDENT_FIELDS });

  // Only log an actual state change — repeated calls must not pad the log.
  if (!alreadyInState) {
    writeAudit({
      actorUserId: req.user.id,
      action,
      entityType: "User",
      entityId: student.id,
      meta: { ...requestContext(req), studentId: student.studentId },
    });
  }

  return res.status(200).json({ student, changed: !alreadyInState });
}

export async function deactivateStudent(req, res) {
  return setActive(req, res, {
    isActive: false,
    action: AUDIT_ACTIONS.STUDENT_DEACTIVATED,
  });
}

export async function reactivateStudent(req, res) {
  return setActive(req, res, {
    isActive: true,
    action: AUDIT_ACTIONS.STUDENT_REACTIVATED,
  });
}

// ---------------------------------------------------------------------------
// POST /api/students/bulk   (ADMIN) — Excel roster import
// ---------------------------------------------------------------------------

const MAX_IMPORT_ROWS = 5000;

// Header matching is deliberately loose: "Student ID", "student_id" and
// "STUDENTID" all resolve to the same column. The DATA is validated strictly;
// only the header spelling is forgiving.
function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const REQUIRED_COLUMNS = {
  name: "name",
  email: "email",
  studentId: "studentid",
  faculty: "faculty",
};

// ---------------------------------------------------------------------------
// PARSE LAYER ONLY.
//
// Everything below readSheet — validation, faculty resolution, dedupe, per-row
// errors, the atomic insert — is parser-agnostic and must stay that way. This
// function's whole contract is: bytes in, a DENSE matrix of trimmed strings out,
// with sheet row numbers preserved. It replaced a SheetJS implementation
// (prototype-pollution + ReDoS advisories, no fix on the npm registry); the
// contract below is written to reproduce SheetJS's
// `sheet_to_json(header:1, defval:"", raw:false, blankrows:true)` exactly.
//
// exceljs differences that mattered:
//   - async: the workbook is loaded with await, so readSheet is async.
//   - 1-based rows AND columns, vs SheetJS's 0-based matrix.
//   - iteration must be by index, not eachRow(): eachRow SKIPS empty rows,
//     which would silently renumber every row after a blank one and report
//     errors against the wrong line in the admin's spreadsheet.
//   - cell values are TYPED (number, Date, {richText}, {formula,result},
//     {text,hyperlink}, {error}), where raw:false handed us strings.
// ---------------------------------------------------------------------------

// The raw:false equivalent: whatever the cell holds, render the text a human
// sees in Excel. A studentId typed as the number 1001 must arrive as "1001",
// not 1001, or studentIdField's string check would reject a valid roster.
function cellText(cell) {
  if (!cell) {
    return "";
  }

  const { value } = cell;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    // Dates: defer to exceljs's own formatting, which honours the cell format.
    if (value instanceof Date) {
      return cell.text ?? "";
    }

    // Rich text — a cell someone bolded half of. Concatenate the runs.
    if (Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text).join("");
    }

    // Formula: use the cached result, which is what raw:false rendered too.
    if ("result" in value) {
      return value.result === null || value.result === undefined
        ? ""
        : String(value.result);
    }

    // Hyperlink — an email address Excel auto-linked, which is common in a
    // roster. The display text is the address.
    if ("text" in value) {
      return String(value.text);
    }

    // Error cells (#REF!, #N/A). Kept as their text so the row fails validation
    // loudly rather than looking like an empty field.
    if ("error" in value) {
      return String(value.error);
    }

    return cell.text ?? "";
  }

  return String(value);
}

async function readSheet(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    // Reached by a corrupt file and — importantly — by a genuine legacy .xls,
    // which multer still accepts but exceljs cannot read. Surfaced as a caller
    // error with a fix the admin can act on, never as a 500.
    return {
      error:
        "The file could not be read as an .xlsx workbook. If it is an older .xls file, open it in Excel and re-save as .xlsx.",
    };
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return { error: "The workbook contains no sheets" };
  }

  // rowCount/columnCount are the last populated row and column, so this walks
  // the same rectangle SheetJS's sheet range described — blank rows INSIDE it
  // included, which is what keeps row numbering aligned with the admin's file.
  const { rowCount, columnCount } = worksheet;

  const matrix = [];

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells = [];

    for (let column = 1; column <= columnCount; column += 1) {
      cells.push(cellText(row.getCell(column)));
    }

    matrix.push(cells);
  }

  if (matrix.length === 0) {
    return { error: "The sheet is empty" };
  }

  const headerCells = matrix[0].map(normalizeHeader);
  const columnIndex = {};

  for (const [field, expected] of Object.entries(REQUIRED_COLUMNS)) {
    const index = headerCells.indexOf(expected);

    if (index === -1) {
      return { error: `Missing required column "${field}"` };
    }

    columnIndex[field] = index;
  }

  // Sheet row numbers are 1-based and row 1 is the header, so the first data
  // row is row 2 — the number the admin sees in Excel.
  const rows = matrix
    .slice(1)
    .map((cells, offset) => ({
      row: offset + 2,
      name: String(cells[columnIndex.name] ?? "").trim(),
      email: String(cells[columnIndex.email] ?? "").trim(),
      studentId: String(cells[columnIndex.studentId] ?? "").trim(),
      faculty: String(cells[columnIndex.faculty] ?? "").trim(),
    }))
    // Trailing blank rows are an Excel artefact, not an admin error.
    .filter((row) => row.name || row.email || row.studentId || row.faculty);

  return { rows };
}

export async function bulkCreateStudents(req, res) {
  if (!req.file) {
    return badRequest(res, 'Attach a spreadsheet in a form field named "file"', "FILE_REQUIRED");
  }

  const parsedSheet = await readSheet(req.file.buffer);

  if (parsedSheet.error) {
    return badRequest(res, parsedSheet.error, "INVALID_SPREADSHEET");
  }

  const { rows } = parsedSheet;

  if (rows.length > MAX_IMPORT_ROWS) {
    return badRequest(
      res,
      `File contains ${rows.length} rows, which exceeds the ${MAX_IMPORT_ROWS}-row limit`,
      "TOO_MANY_ROWS"
    );
  }

  // --- Pre-fetch ONCE. Everything below is O(1) per row, no queries in the loop.

  const faculties = await prisma.faculty.findMany({
    select: { id: true, name: true, code: true },
  });

  // Keyed by BOTH normalized code and normalized name.
  const facultyByKey = new Map();

  for (const faculty of faculties) {
    const codeKey = normalizeFacultyKey(faculty.code);
    const nameKey = normalizeFacultyKey(faculty.name);

    if (codeKey) facultyByKey.set(`code:${codeKey}`, faculty);
    if (nameKey) facultyByKey.set(`name:${nameKey}`, faculty);
  }

  // Targeted lookup: only the values this file actually mentions.
  const candidateEmails = [...new Set(rows.map((row) => row.email.toLowerCase()).filter(Boolean))];
  const candidateStudentIds = [...new Set(rows.map((row) => row.studentId).filter(Boolean))];

  const existingUsers = await prisma.user.findMany({
    where: {
      OR: [{ email: { in: candidateEmails } }, { studentId: { in: candidateStudentIds } }],
    },
    select: { email: true, studentId: true },
  });

  const existingEmails = new Set(existingUsers.map((user) => user.email));
  const existingStudentIds = new Set(
    existingUsers.map((user) => user.studentId).filter(Boolean)
  );

  // --- Per-row validation.

  const errors = [];
  const validRows = [];
  const seenEmails = new Map(); // normalized email -> first row number in THIS file
  const seenStudentIds = new Map();

  for (const row of rows) {
    const parsed = studentRowSchema.safeParse({
      name: row.name,
      email: row.email,
      studentId: row.studentId,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: row.row, field: issue.path.join("."), message: issue.message });
      }
      continue;
    }

    const { name, email, studentId } = parsed.data;

    // Flexible input, STRICT resolution — code first, then name. Never guess.
    const key = normalizeFacultyKey(row.faculty);
    const faculty = key
      ? facultyByKey.get(`code:${key}`) ?? facultyByKey.get(`name:${key}`)
      : null;

    if (!faculty) {
      errors.push({
        row: row.row,
        field: "faculty",
        message: row.faculty
          ? `Unknown faculty "${row.faculty}"`
          : "faculty is required",
      });
      continue;
    }

    const duplicateEmailRow = seenEmails.get(email);

    if (duplicateEmailRow) {
      errors.push({
        row: row.row,
        field: "email",
        message: `Duplicate of row ${duplicateEmailRow} in this file`,
      });
      continue;
    }

    const duplicateStudentIdRow = seenStudentIds.get(studentId);

    if (duplicateStudentIdRow) {
      errors.push({
        row: row.row,
        field: "studentId",
        message: `Duplicate of row ${duplicateStudentIdRow} in this file`,
      });
      continue;
    }

    if (existingEmails.has(email)) {
      errors.push({ row: row.row, field: "email", message: "Email is already registered" });
      continue;
    }

    if (existingStudentIds.has(studentId)) {
      errors.push({
        row: row.row,
        field: "studentId",
        message: "studentId is already registered",
      });
      continue;
    }

    seenEmails.set(email, row.row);
    seenStudentIds.set(studentId, row.row);

    validRows.push({
      email: normalizeEmail(email),
      studentId,
      name,
      facultyId: faculty.id,
      role: "STUDENT",
      isActive: true,
    });
  }

  // --- Atomic insert of the survivors.
  //
  // Validation above is per-row lenient (a bad row does not sink the good ones),
  // but the WRITE is all-or-nothing. That way the "imported" count reported back
  // is never a half-truth about what actually landed in the database.

  let imported = 0;

  if (validRows.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        const result = await tx.user.createMany({ data: validRows });
        imported = result.count;
      });
    } catch (error) {
      console.error("[students] bulk import transaction failed:", error.message);

      return res.status(500).json({
        error: {
          code: "IMPORT_FAILED",
          message:
            "No students were imported — the insert failed and was rolled back. Please retry.",
        },
      });
    }
  }

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.STUDENTS_BULK_IMPORTED,
    entityType: "User",
    // Counts only. No names, emails or studentIds: an audit row must not become
    // a second copy of the roster.
    meta: { ...requestContext(req), imported, failed: errors.length, total: rows.length },
  });

  return res.status(200).json({
    imported,
    failed: errors.length,
    total: rows.length,
    errors,
  });
}
