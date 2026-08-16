import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { badRequest, conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import { normalizeEmail } from "../utils/email.js";
import { sendElevatedAccessEmail, sendLoginEmailChangedEmail } from "../utils/mailer.js";
// Shared with the student endpoints on purpose. What counts as a valid email or
// a valid name must not be allowed to differ between the two ways an account can
// enter this system — the module is named for where the rules first appeared,
// not for the only place they apply.
import { emailField, nameField } from "../utils/student-fields.js";

// ---------------------------------------------------------------------------
// B3b — ADMIN and AUDITOR account management.
//
// This slice manages ELEVATED accounts only. Students are created and edited
// through /api/students (B3) and are invisible here; conversely nothing in this
// file can create, read or modify a STUDENT. That split is deliberate: the two
// populations have different shapes (a student has a studentId and a faculty, an
// elevated account has neither) and very different blast radii.
//
// Because authentication is passwordless, creating an account provisions NO
// credential. The account is an email plus a role; the holder logs in through
// the ordinary OTP flow. There is nothing here to leak.
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// The only roles this endpoint may create. Locked decision 3: the RBAC model is
// flat — any ADMIN may create any ADMIN or AUDITOR, and there is no super-admin
// tier. isRoot is NOT a tier; it is a permanence flag on the single seed
// account and is never settable through the API.
const ELEVATED_ROLES = ["ADMIN", "AUDITOR"];

// Never includes studentId or facultyId: an elevated account has neither, and
// echoing them back as null would imply this endpoint could set them.
const USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  isRoot: true,
  createdAt: true,
  updatedAt: true,
};

// Student-only columns. Accepting either here would let an admin quietly mint a
// half-student/half-admin hybrid that no screen in the app knows how to render
// and that the faculty-scoping logic in B6 would have to reason about.
const STUDENT_ONLY_FIELDS = ["studentId", "facultyId"];

// Fields a PATCH must never touch, each for its own reason. Rejected loudly
// rather than stripped: an admin who sends `isActive: false` and gets a 200 back
// would reasonably believe the account was disabled, and it would not be.
const NOT_EDITABLE_FIELDS = {
  role: "role cannot be changed here. Promoting or demoting an existing account is deferred future work — create the account with the role it needs.",
  isRoot:
    "isRoot cannot be set through the API. The root of trust is claimed by the seed script alone, and the database enforces that only one account may hold it.",
  isActive:
    "isActive cannot be changed here. Use PATCH /api/users/:id/deactivate or /reactivate, which apply the root, self and last-admin guards this endpoint deliberately does not.",
};

const createUserSchema = z.object({
  email: emailField,
  name: nameField,
  role: z.enum(ELEVATED_ROLES, {
    message: 'role must be either "ADMIN" or "AUDITOR"',
  }),
});

// name and/or email, at least one. Everything else is refused before this runs
// (see NOT_EDITABLE_FIELDS and STUDENT_ONLY_FIELDS), so zod's silent stripping
// of unknown keys can never be what handles a field that matters.
const updateUserSchema = z
  .object({
    email: emailField.optional(),
    name: nameField.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one of name or email",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  search: z.string().trim().min(1).optional(),
  role: z.enum(ELEVATED_ROLES).optional(),
});

// Audit action per role, so an auditor can filter on "every grant of admin
// power" without post-processing a generic event.
const CREATED_ACTION = {
  ADMIN: AUDIT_ACTIONS.ADMIN_CREATED,
  AUDITOR: AUDIT_ACTIONS.AUDITOR_CREATED,
};

const UPDATED_ACTION = {
  ADMIN: AUDIT_ACTIONS.ADMIN_UPDATED,
  AUDITOR: AUDIT_ACTIONS.AUDITOR_UPDATED,
};

const DEACTIVATED_ACTION = {
  ADMIN: AUDIT_ACTIONS.ADMIN_DEACTIVATED,
  AUDITOR: AUDIT_ACTIONS.AUDITOR_DEACTIVATED,
};

const REACTIVATED_ACTION = {
  ADMIN: AUDIT_ACTIONS.ADMIN_REACTIVATED,
  AUDITOR: AUDIT_ACTIONS.AUDITOR_REACTIVATED,
};

// ---------------------------------------------------------------------------
// POST /api/users   (ADMIN)
// ---------------------------------------------------------------------------

export async function createUser(req, res) {
  // Checked before zod so the message names the offending field. zod strips
  // unknown keys rather than rejecting them (the convention in this codebase),
  // which would silently ignore these instead of refusing them.
  for (const field of STUDENT_ONLY_FIELDS) {
    if (req.body?.[field] !== undefined) {
      return badRequest(
        res,
        `${field} is not accepted here — ADMIN and AUDITOR accounts have no ${field}. Create students through /api/students.`,
        "STUDENT_FIELD_NOT_ALLOWED"
      );
    }
  }

  const parsed = createUserSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { name, role } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  // Email is the login identity, so it is unique across the WHOLE table, not
  // just among elevated accounts. Locked decision 5: an address already used by
  // a student is a rejection, never a silent promotion of that student into an
  // administrator — that would be privilege escalation triggered by a typo.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return conflict(res, `A user with email "${email}" already exists`, "EMAIL_ALREADY_EXISTS");
  }

  let user;

  try {
    user = await prisma.user.create({
      data: {
        email,
        name,
        role, // validated against ELEVATED_ROLES above — never STUDENT
        isActive: true,
        // Explicit rather than relying on the column default: the root of trust
        // is claimed by the seed script alone, and no request body can ever set
        // it. A partial unique index on users(is_root) WHERE is_root enforces
        // the same rule one layer down.
        isRoot: false,
      },
      select: USER_FIELDS,
    });
  } catch (error) {
    // The findUnique above is not atomic with this insert, so two simultaneous
    // creates of the same address both pass it and one loses here. Mapped back
    // to the same 409 the pre-check returns, so the caller sees one consistent
    // answer instead of a 500 that leaks a Prisma error code.
    if (error.code === "P2002") {
      return conflict(res, `A user with email "${email}" already exists`, "EMAIL_ALREADY_EXISTS");
    }

    throw error;
  }

  // The account is already created and fully usable at this point. A send
  // failure must NOT roll it back: the holder can still get in through the
  // ordinary OTP flow or the admin manual-code fallback, so destroying a valid
  // account over a courtesy email would be the worse outcome. Same posture as
  // B1's OTP send failure — logged, recorded, never fatal.
  let notificationSent = true;

  try {
    await sendElevatedAccessEmail({ to: user.email, name: user.name, role: user.role });
  } catch (error) {
    notificationSent = false;
    console.error("[users] failed to send elevated-access email:", error.message);

    writeAudit({
      actorUserId: req.user.id,
      action: AUDIT_ACTIONS.ELEVATED_ACCESS_EMAIL_FAILED,
      entityType: "User",
      entityId: user.id,
      meta: { ...requestContext(req), role: user.role },
    });
  }

  writeAudit({
    actorUserId: req.user.id,
    action: CREATED_ACTION[user.role],
    entityType: "User",
    entityId: user.id,
    meta: { ...requestContext(req), role: user.role, notificationSent },
  });

  return res.status(201).json({
    user,
    // Non-fatal, and shaped so the UI can show a warning next to a success
    // toast rather than having to guess from a status code.
    notification: {
      sent: notificationSent,
      ...(notificationSent
        ? {}
        : {
            warning:
              "The account was created, but the notification email could not be sent. Tell the holder they can log in at the login page using their email address.",
          }),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/users   (ADMIN)
// ---------------------------------------------------------------------------

export async function listUsers(req, res) {
  const parsed = listQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { page, limit, search, role } = parsed.data;

  const where = {
    // Written as an allow-list rather than `not: "STUDENT"`. If a fourth role is
    // ever added to the enum it must be opted IN to this screen deliberately,
    // instead of appearing in the account-management table by default.
    role: role ? { equals: role } : { in: ELEVATED_ROLES },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
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
      select: USER_FIELDS,
    }),
  ]);

  return res.status(200).json({ data, page, limit, total });
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id   (ADMIN)
// ---------------------------------------------------------------------------

// IDENTITY ONLY: name and email. Nothing about an account's POWER is editable
// here — not its role, not its root flag, not whether it is active. Each of
// those has its own reason (see NOT_EDITABLE_FIELDS), but they share one: a
// generic "update the user" endpoint that quietly accepted them would be a way
// around the guards that make the rest of this slice safe.
//
// EDITING THE ROOT ACCOUNT'S NAME OR EMAIL IS ALLOWED. Root means the account
// cannot be DEACTIVATED — it is the permanent trust anchor, not an immutable
// record. Refusing to correct a typo in the root admin's address would be a
// different and worse rule: the address is the only way to log in as it.
export async function updateUser(req, res) {
  for (const field of STUDENT_ONLY_FIELDS) {
    if (req.body?.[field] !== undefined) {
      return badRequest(
        res,
        `${field} is not accepted here — ADMIN and AUDITOR accounts have no ${field}.`,
        "STUDENT_FIELD_NOT_ALLOWED"
      );
    }
  }

  for (const [field, reason] of Object.entries(NOT_EDITABLE_FIELDS)) {
    if (req.body?.[field] !== undefined) {
      return badRequest(res, reason, "FIELD_NOT_EDITABLE");
    }
  }

  const parsed = updateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { id } = req.params;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isRoot: true },
  });

  // A STUDENT id 404s here exactly as it does on the activation routes —
  // students are edited through /api/students, and this endpoint must not
  // become a second, guard-free way into that table.
  if (!existing || !ELEVATED_ROLES.includes(existing.role)) {
    return notFound(res, "No ADMIN or AUDITOR account exists with that id", "USER_NOT_FOUND");
  }

  const name = parsed.data.name;
  // Normalised BEFORE comparing, so "Admin@PSU.EDU" is recognised as the same
  // address the row already holds rather than being treated as a change. The
  // @unique index on email is case-SENSITIVE; this is what makes the rule
  // case-insensitive in practice, on every path that writes an address.
  const email = parsed.data.email === undefined ? undefined : normalizeEmail(parsed.data.email);

  const emailChanged = email !== undefined && email !== existing.email;
  const nameChanged = name !== undefined && name !== existing.name;

  if (emailChanged) {
    // Global uniqueness again, and for the same reason as on create: the email
    // IS the login identity, so colliding with ANY other user — including a
    // student — would make two accounts contend for one sign-in.
    const clash = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (clash && clash.id !== id) {
      return conflict(res, `A user with email "${email}" already exists`, "EMAIL_ALREADY_EXISTS");
    }
  }

  const changedFields = [
    ...(nameChanged ? ["name"] : []),
    ...(emailChanged ? ["email"] : []),
  ];

  // Nothing actually differs. Return the record unchanged rather than writing a
  // no-op audit row and emailing someone about an address that did not move.
  if (changedFields.length === 0) {
    const unchanged = await prisma.user.findUnique({ where: { id }, select: USER_FIELDS });

    return res.status(200).json({ user: unchanged, changed: false });
  }

  let user;

  try {
    user = await prisma.user.update({
      where: { id },
      data: {
        ...(nameChanged ? { name } : {}),
        ...(emailChanged ? { email } : {}),
      },
      select: USER_FIELDS,
    });
  } catch (error) {
    // The uniqueness check above is not atomic with this write. Mapped to the
    // same 409 so a lost race reads identically to losing the pre-check.
    if (error.code === "P2002") {
      return conflict(res, `A user with email "${email}" already exists`, "EMAIL_ALREADY_EXISTS");
    }

    throw error;
  }

  // Only an ADDRESS change is worth an email, and it goes to the NEW address —
  // the one that can now sign in. A name change notifies nobody: it does not
  // affect access, and mail nobody needs is mail nobody reads.
  let notification;

  if (emailChanged) {
    try {
      await sendLoginEmailChangedEmail({ to: user.email, name: user.name, role: user.role });
      notification = { sent: true };
    } catch (error) {
      console.error("[users] failed to send login-email-changed email:", error.message);

      writeAudit({
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.ELEVATED_ACCESS_EMAIL_FAILED,
        entityType: "User",
        entityId: user.id,
        meta: { ...requestContext(req), role: user.role, trigger: "EMAIL_CHANGED" },
      });

      // Same posture as B3b §6: the update already succeeded and the new address
      // already works. Rolling it back over a failed courtesy email would strand
      // the account on an address the admin has just decided is wrong.
      notification = {
        sent: false,
        warning:
          "The account was updated, but the notification could not be emailed to the new address. Tell the holder their login email has changed.",
      };
    }
  }

  writeAudit({
    actorUserId: req.user.id,
    action: UPDATED_ACTION[user.role],
    entityType: "User",
    entityId: user.id,
    // FIELD NAMES ONLY. The old and new addresses are deliberately absent: the
    // audit log is read by more people and exported more often than this table
    // is, and "which admin changed which account's email, and when" is the
    // forensic question — the address values are in the record itself.
    meta: {
      ...requestContext(req),
      role: user.role,
      changedFields,
      ...(emailChanged ? { notificationSent: notification.sent } : {}),
    },
  });

  return res.status(200).json({
    user,
    changed: true,
    // Present ONLY when an address change actually triggered a send, so a
    // name-only edit cannot make the UI show a mail warning about nothing.
    ...(notification ? { notification } : {}),
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/deactivate  and  /reactivate   (ADMIN)
// ---------------------------------------------------------------------------

// SOFT only, never a hard delete (locked decision 6). Every audit row written by
// this account references it as the actor; deleting the row would orphan that
// trail and destroy the evidence of what the account did while it held power.
// Deactivation blocks login, blocks the API (requireAuth) and kills the session
// family on the next refresh, while the history survives intact.
async function setElevatedActive(req, res, { isActive }) {
  const { id } = req.params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isActive: true, isRoot: true },
  });

  // A student id must 404 here rather than be deactivated through the elevated
  // route — /api/students/:id/deactivate is where that belongs.
  if (!target || !ELEVATED_ROLES.includes(target.role)) {
    return notFound(res, "No ADMIN or AUDITOR account exists with that id", "USER_NOT_FOUND");
  }

  if (!isActive) {
    // GUARD 1 — the root of trust is permanent (locked decision 4). Refused for
    // everyone including the root itself, which is what guarantees the system
    // can never be left with nobody able to administer it.
    if (target.isRoot) {
      return conflict(
        res,
        "The root administrator account is permanent and cannot be deactivated",
        "ROOT_ACCOUNT_IMMUTABLE"
      );
    }

    // GUARD 2 — no self-deactivation. An admin locking themselves out mid
    // election is an availability incident, and it is never what was intended.
    if (target.id === req.user.id) {
      return conflict(
        res,
        "You cannot deactivate your own account. Ask another administrator to do it.",
        "CANNOT_DEACTIVATE_SELF"
      );
    }

    // GUARD 3 — never remove the last active administrator. Belt-and-suspenders
    // behind GUARD 1: the root is always an active ADMIN, so this should be
    // unreachable in a correctly seeded database. It is here for the case where
    // it is not — and that redundancy is also why this count is not wrapped in a
    // serializable transaction. Two admins deactivating the last two accounts in
    // the same instant could both pass this check, but GUARD 1 still stops the
    // root going down, so the floor of one administrator holds regardless.
    if (target.role === "ADMIN" && target.isActive) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true, id: { not: target.id } },
      });

      if (otherActiveAdmins === 0) {
        return conflict(
          res,
          "This is the last active administrator. Create another administrator before deactivating this one.",
          "LAST_ACTIVE_ADMIN"
        );
      }
    }
  }

  // Idempotent: repeating the call is a no-op success, not an error.
  const alreadyInState = target.isActive === isActive;

  const user = alreadyInState
    ? await prisma.user.findUnique({ where: { id }, select: USER_FIELDS })
    : await prisma.user.update({ where: { id }, data: { isActive }, select: USER_FIELDS });

  // Only log an actual state change — repeated calls must not pad the log.
  if (!alreadyInState) {
    const action = isActive ? REACTIVATED_ACTION[user.role] : DEACTIVATED_ACTION[user.role];

    writeAudit({
      actorUserId: req.user.id,
      action,
      entityType: "User",
      entityId: user.id,
      meta: { ...requestContext(req), role: user.role },
    });
  }

  return res.status(200).json({ user, changed: !alreadyInState });
}

export async function deactivateUser(req, res) {
  return setElevatedActive(req, res, { isActive: false });
}

export async function reactivateUser(req, res) {
  return setElevatedActive(req, res, { isActive: true });
}
