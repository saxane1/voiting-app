import { subSeconds } from "date-fns";
import { z } from "zod";

import { env, isProduction } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import { normalizeEmail } from "../utils/email.js";
import { compareValue, hashValue } from "../utils/hashing.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { generateOtp, getOtpExpiry } from "../utils/otp.js";

// Seconds a user must wait between OTP requests. Distinct from otpRequestLimiter
// (5 per 15 min) — this stops rapid-fire resends filling an inbox.
const RESEND_COOLDOWN_SECONDS = 60;

// Identical body for every request-otp outcome. Anti-enumeration: a caller must
// not be able to tell a registered address from an unregistered one.
const GENERIC_OTP_RESPONSE = {
  message: "If that email is registered, a code has been sent.",
};

// Internally distinguishable outcomes. The caller only ever sees the generic
// response, but res.locals carries the real reason so the B9 audit log can
// record what actually happened.
export const OTP_REQUEST_OUTCOMES = {
  SENT: "OTP_SENT",
  USER_NOT_FOUND: "OTP_USER_NOT_FOUND",
  USER_INACTIVE: "OTP_USER_INACTIVE",
  COOLDOWN: "OTP_COOLDOWN",
  SEND_FAILED: "OTP_SEND_FAILED",
};

export const OTP_VERIFY_OUTCOMES = {
  SUCCESS: "OTP_VERIFIED",
  USER_NOT_FOUND: "OTP_VERIFY_USER_NOT_FOUND",
  USER_INACTIVE: "OTP_VERIFY_USER_INACTIVE",
  NO_ACTIVE_CODE: "OTP_VERIFY_NO_ACTIVE_CODE",
  EXPIRED: "OTP_VERIFY_EXPIRED",
  WRONG_CODE: "OTP_VERIFY_WRONG_CODE",
  ATTEMPTS_EXCEEDED: "OTP_VERIFY_ATTEMPTS_EXCEEDED",
};

export const REFRESH_OUTCOMES = {
  ROTATED: "REFRESH_ROTATED",
  NO_COOKIE: "REFRESH_NO_COOKIE",
  INVALID: "REFRESH_INVALID",
  UNKNOWN_TOKEN: "REFRESH_UNKNOWN_TOKEN",
  HASH_MISMATCH: "REFRESH_HASH_MISMATCH",
  EXPIRED: "REFRESH_EXPIRED",
  REUSE_DETECTED: "REFRESH_REUSE_DETECTED",
  SESSION_ENDED: "REFRESH_SESSION_ENDED",
  USER_UNAVAILABLE: "REFRESH_USER_UNAVAILABLE",
};

// Mirrors the RevokeReason enum in schema.prisma.
const REVOKE_REASON = {
  ROTATED: "ROTATED",
  LOGGED_OUT: "LOGGED_OUT",
  DEACTIVATED: "DEACTIVATED",
};

export const ADMIN_OTP_OUTCOMES = {
  ISSUED: "ADMIN_OTP_ISSUED",
  STUDENT_NOT_FOUND: "ADMIN_OTP_STUDENT_NOT_FOUND",
};

// Normalize BEFORE validating, so " Admin@PSU.EDU " is accepted and stored the
// same way it is looked up.
const emailField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("A valid email address is required")
);

const requestOtpSchema = z.object({ email: emailField });

const verifyOtpSchema = z.object({
  email: emailField,
  code: z
    .string("A 6-digit code is required")
    .regex(/^\d{6}$/, "Code must be exactly 6 digits"),
});


// ---------------------------------------------------------------------------
// POST /api/auth/request-otp   (PUBLIC, behind otpRequestLimiter)
// ---------------------------------------------------------------------------

export async function requestOtp(req, res) {
  const parsed = requestOtpSchema.safeParse(req.body);

  // A malformed body is rejected here, which is what makes the limiter's
  // "skip when no email" decision safe — no code is ever issued on this path.
  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const email = normalizeEmail(parsed.data.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  // Both branches return the SAME 200 body. Never reveal existence.
  if (!user) {
    res.locals.otpOutcome = OTP_REQUEST_OUTCOMES.USER_NOT_FOUND;

    // Logged WITHOUT actor and WITHOUT the attempted address: enough to spot an
    // enumeration sweep from one source, not enough to build a list of probed
    // addresses out of the audit table.
    writeAudit({
      action: AUDIT_ACTIONS.OTP_REQUESTED_UNKNOWN_EMAIL,
      meta: requestContext(req),
    });

    return res.status(200).json(GENERIC_OTP_RESPONSE);
  }

  if (!user.isActive) {
    res.locals.otpOutcome = OTP_REQUEST_OUTCOMES.USER_INACTIVE;
    res.locals.otpUserId = user.id;
    return res.status(200).json(GENERIC_OTP_RESPONSE);
  }

  res.locals.otpUserId = user.id;

  const recentToken = await prisma.otpToken.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: subSeconds(new Date(), RESEND_COOLDOWN_SECONDS) },
    },
    select: { id: true },
  });

  if (recentToken) {
    res.locals.otpOutcome = OTP_REQUEST_OUTCOMES.COOLDOWN;

    // Accepted leak: a cooldown 429 only ever fires for a real account. It is
    // reachable solely by someone already sending to that address repeatedly,
    // and the alternative (silently swallowing it as a 200) would let an
    // attacker flood a real student's inbox unthrottled.
    return res.status(429).json({
      error: {
        code: "COOLDOWN",
        message: `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
      },
    });
  }

  // ONE ACTIVE CODE: consume any outstanding un-consumed codes first, so an
  // older code can never be used once a newer one has been sent.
  await prisma.otpToken.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp();
  const codeHash = await hashValue(code);

  await prisma.otpToken.create({
    data: {
      userId: user.id,
      codeHash, // only ever the hash — the plaintext leaves in the email alone
      expiresAt: getOtpExpiry(),
      attempts: 0,
    },
  });

  try {
    await sendOtpEmail(user.email, code);
    res.locals.otpOutcome = OTP_REQUEST_OUTCOMES.SENT;
  } catch (error) {
    // Deliberately NOT surfaced to the caller: a 500 here would make a
    // registered address distinguishable from an unregistered one, undoing the
    // anti-enumeration guarantee. Logged server-side (never with the code) and
    // recoverable through the admin manual-code fallback.
    res.locals.otpOutcome = OTP_REQUEST_OUTCOMES.SEND_FAILED;
    console.error("[auth] failed to send OTP email:", error.message);
  }

  // A code really was issued for a real account. The code itself is never here.
  writeAudit({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.OTP_REQUESTED,
    entityType: "User",
    entityId: user.id,
    meta: {
      ...requestContext(req),
      delivery: "EMAIL",
      sendFailed: res.locals.otpOutcome === OTP_REQUEST_OUTCOMES.SEND_FAILED,
    },
  });

  return res.status(200).json(GENERIC_OTP_RESPONSE);
}

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp   (PUBLIC)
// ---------------------------------------------------------------------------

// One generic 401 for every failure mode: a caller must not learn whether the
// email exists, whether a code is outstanding, whether it expired, or how many
// attempts remain. The reason is recorded on res.locals for the audit log.
function rejectVerification(res, outcome) {
  res.locals.verifyOutcome = outcome;

  return res.status(401).json({
    error: {
      code: "INVALID_OR_EXPIRED",
      message: "That code is invalid or has expired. Please request a new one.",
    },
  });
}

function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true, // not readable by JS — this is why it is not in localStorage
    secure: isProduction,
    // Prod frontend and API may sit on different domains, which requires
    // SameSite=None (and therefore Secure). In dev both are localhost, so Lax
    // works and avoids needing HTTPS locally.
    sameSite: isProduction ? "none" : "lax",
    // Scoped to the auth routes: /auth/refresh and /auth/logout are the only
    // endpoints that need it, so it is not attached to every API call.
    path: "/api/auth",
    expires: expiresAt,
  };
}

// clearCookie only works when the attributes match those the cookie was set
// with, so path/sameSite/secure are repeated here deliberately.
function clearRefreshCookie(res) {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
  });
}

// The refresh token's `jti` claim doubles as the RefreshToken row's primary key.
// That gives an O(1) lookup from a presented token to its stored row without a
// separate jti column, and makes replacedByTokenId a direct pointer to the next
// jti in the rotation chain. Both are random UUIDs, so nothing is weakened.
async function buildRefreshToken(userId) {
  const token = signRefreshToken({ sub: userId });
  const payload = verifyRefreshToken(token);

  return {
    token,
    jti: payload.jti,
    expiresAt: new Date(payload.exp * 1000),
    tokenHash: await hashValue(token),
  };
}

export async function verifyOtp(req, res) {
  const parsed = verifyOtpSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const email = normalizeEmail(parsed.data.email);
  const { code } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      studentId: true,
      facultyId: true,
      isActive: true,
    },
  });

  if (!user) {
    return rejectVerification(res, OTP_VERIFY_OUTCOMES.USER_NOT_FOUND);
  }

  if (!user.isActive) {
    return rejectVerification(res, OTP_VERIFY_OUTCOMES.USER_INACTIVE);
  }

  res.locals.otpUserId = user.id;

  // A burned or already-used code has consumedAt set, so it is not "active" and
  // falls into NO_ACTIVE_CODE — indistinguishable to the caller from never
  // having requested one.
  const otpToken = await prisma.otpToken.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otpToken) {
    return rejectVerification(res, OTP_VERIFY_OUTCOMES.NO_ACTIVE_CODE);
  }

  if (otpToken.expiresAt <= new Date()) {
    return rejectVerification(res, OTP_VERIFY_OUTCOMES.EXPIRED);
  }

  const isCorrect = await compareValue(code, otpToken.codeHash);

  if (!isCorrect) {
    const attempts = otpToken.attempts + 1;
    const shouldBurn = attempts >= env.OTP_MAX_ATTEMPTS;

    await prisma.otpToken.update({
      where: { id: otpToken.id },
      data: {
        attempts,
        // BURN: consuming the code means even the correct value can never
        // verify it afterwards. Forces the attacker back through request-otp,
        // which is rate-limited and cooldown-gated.
        ...(shouldBurn ? { consumedAt: new Date() } : {}),
      },
    });

    // Every wrong code is a failed-verify event, including the one that burns
    // the code — so a count of OTP_VERIFY_FAILED is a true count of attempts.
    writeAudit({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.OTP_VERIFY_FAILED,
      entityType: "User",
      entityId: user.id,
      meta: { ...requestContext(req), attempts, maxAttempts: env.OTP_MAX_ATTEMPTS },
    });

    if (shouldBurn) {
      writeAudit({
        actorUserId: user.id,
        action: AUDIT_ACTIONS.OTP_CODE_BURNED,
        entityType: "User",
        entityId: user.id,
        meta: { ...requestContext(req), attempts, maxAttempts: env.OTP_MAX_ATTEMPTS },
      });
    }

    return rejectVerification(
      res,
      shouldBurn
        ? OTP_VERIFY_OUTCOMES.ATTEMPTS_EXCEEDED
        : OTP_VERIFY_OUTCOMES.WRONG_CODE
    );
  }

  // Correct code. Issue the session.
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refresh = await buildRefreshToken(user.id);

  // Single-use consumption and refresh-token persistence in one transaction: a
  // crash between them would either burn the code without granting a session,
  // or leave a reusable code alongside a live session.
  await prisma.$transaction([
    prisma.otpToken.update({
      where: { id: otpToken.id },
      data: { consumedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        id: refresh.jti, // row id IS the token's jti — see buildRefreshToken
        userId: user.id,
        tokenHash: refresh.tokenHash, // hash only, never the raw token
        expiresAt: refresh.expiresAt,
        userAgent: req.get("user-agent") ?? null,
        ip: req.ip ?? null,
      },
    }),
  ]);

  res.cookie("refreshToken", refresh.token, refreshCookieOptions(refresh.expiresAt));
  res.locals.verifyOutcome = OTP_VERIFY_OUTCOMES.SUCCESS;

  writeAudit({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
    entityType: "User",
    entityId: user.id,
    meta: { ...requestContext(req), role: user.role },
  });

  // Same identity shape as GET /auth/me, so the client's in-memory user is
  // complete from the moment of login rather than only after a reload has gone
  // through /auth/me. studentId and facultyId are null for ADMIN/AUDITOR.
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: user.studentId,
      facultyId: user.facultyId,
    },
    accessToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh   (PUBLIC*, guarded by the refresh cookie itself)
// ---------------------------------------------------------------------------

function rejectRefresh(res, outcome, code, message) {
  res.locals.refreshOutcome = outcome;
  clearRefreshCookie(res);

  return res.status(401).json({ error: { code, message } });
}

export async function refresh(req, res) {
  const presentedToken = req.cookies?.refreshToken;

  if (!presentedToken) {
    res.locals.refreshOutcome = REFRESH_OUTCOMES.NO_COOKIE;
    return res.status(401).json({
      error: { code: "NO_REFRESH", message: "No refresh token was provided" },
    });
  }

  let payload;

  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.INVALID,
      "INVALID_REFRESH",
      "Refresh token is invalid or has expired"
    );
  }

  // O(1) lookup via the jti-as-primary-key. Never scan the table comparing
  // bcrypt hashes — that would be one expensive compare per stored token.
  const stored = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  if (!stored) {
    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.UNKNOWN_TOKEN,
      "INVALID_REFRESH",
      "Refresh token is invalid or has expired"
    );
  }

  // The jti identifies the row; the hash proves the bearer holds the real token
  // and not merely a forged JWT carrying a known jti.
  const matchesStoredHash = await compareValue(presentedToken, stored.tokenHash);

  if (!matchesStoredHash) {
    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.HASH_MISMATCH,
      "INVALID_REFRESH",
      "Refresh token is invalid or has expired"
    );
  }

  // A revoked row means this exact token was already retired. WHY it was retired
  // decides the response:
  //
  //   LOGGED_OUT — the user ended this one session on purpose. Replaying it is a
  //     stale browser tab or a client that did not clear its cookie, not an
  //     attack. Refuse the request and stop there.
  //
  //   ROTATED — the token was superseded by a newer one during /refresh. A
  //     legitimate client discards a token the instant it rotates, so seeing one
  //     again means a copy existed elsewhere: the theft signal. Kill the family.
  //
  // The distinction is per-token, not per-user, and that is what makes it safe.
  // Logout tags ONLY the single token being logged out; every token retired by
  // rotation still carries ROTATED. So a thief replaying a stolen predecessor
  // token still hits the ROTATED branch and still triggers full family
  // revocation — logging out cannot be used to launder a stolen token into the
  // benign path, because logout never touches a token it was not presented with.
  if (stored.revokedAt) {
    res.locals.refreshUserId = stored.userId;

    if (stored.revokedReason === REVOKE_REASON.LOGGED_OUT) {
      return rejectRefresh(
        res,
        REFRESH_OUTCOMES.SESSION_ENDED,
        "SESSION_ENDED",
        "This session has ended. Please log in again."
      );
    }

    // ROTATED (or a legacy row backfilled as ROTATED) — treat as compromised.
    const killed = await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: REVOKE_REASON.ROTATED },
    });

    // SECURITY INCIDENT — the one row in this table that should trigger a human
    // looking at it. Deliberately carries no jti and no token material: the
    // userId and the timestamp are what an investigation needs.
    writeAudit({
      actorUserId: stored.userId,
      action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
      entityType: "User",
      entityId: stored.userId,
      meta: {
        ...requestContext(req),
        severity: "SECURITY_INCIDENT",
        detail: "An already-rotated refresh token was replayed; session family revoked",
        sessionsRevoked: killed.count,
      },
    });

    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.REUSE_DETECTED,
      "TOKEN_REUSE_DETECTED",
      "This session has been terminated for security reasons. Please log in again."
    );
  }

  if (stored.expiresAt <= new Date()) {
    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.EXPIRED,
      "INVALID_REFRESH",
      "Refresh token is invalid or has expired"
    );
  }

  // Re-read the user on every refresh: this is where a deactivated account is
  // caught, since requireAuth deliberately does not touch the database.
  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      studentId: true,
      facultyId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    // Not a theft signal — the account was deactivated. Family revocation
    // behaviour is unchanged; only the recorded reason is now truthful, so an
    // auditor can tell an administrative deactivation from a replay incident.
    const killed = await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: REVOKE_REASON.DEACTIVATED },
    });

    writeAudit({
      actorUserId: stored.userId,
      action: AUDIT_ACTIONS.USER_DEACTIVATED_SESSION_KILLED,
      entityType: "User",
      entityId: stored.userId,
      meta: {
        ...requestContext(req),
        revokeReason: REVOKE_REASON.DEACTIVATED,
        sessionsRevoked: killed.count,
        userStillExists: Boolean(user),
      },
    });

    return rejectRefresh(
      res,
      REFRESH_OUTCOMES.USER_UNAVAILABLE,
      "INVALID_REFRESH",
      "Refresh token is invalid or has expired"
    );
  }

  const rotated = await buildRefreshToken(user.id);
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  // One transaction: the old token must not be revoked unless its replacement
  // exists, and the replacement must not exist unless the old one is dead.
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        id: rotated.jti,
        userId: user.id,
        tokenHash: rotated.tokenHash,
        expiresAt: rotated.expiresAt,
        userAgent: req.get("user-agent") ?? null,
        ip: req.ip ?? null,
      },
    }),
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        revokedReason: REVOKE_REASON.ROTATED,
        replacedByTokenId: rotated.jti,
      },
    }),
  ]);

  res.cookie("refreshToken", rotated.token, refreshCookieOptions(rotated.expiresAt));
  res.locals.refreshOutcome = REFRESH_OUTCOMES.ROTATED;
  res.locals.refreshUserId = user.id;

  // Same identity shape as GET /auth/me, so the client's in-memory user is
  // complete from the moment of login rather than only after a reload has gone
  // through /auth/me. studentId and facultyId are null for ADMIN/AUDITOR.
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: user.studentId,
      facultyId: user.facultyId,
    },
    accessToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout   (AUTH)
// ---------------------------------------------------------------------------

// Idempotent by design: a second logout, a missing cookie, or a already-revoked
// token all succeed. Logging out must never fail — a client stuck unable to end
// its session is worse than a redundant no-op.
//
// Only THIS token is revoked, not the family. Family-wide revocation is the
// reuse-detection response, and applying it here would log a student out of
// their phone when they log out on a lab PC.
export async function logout(req, res) {
  const presentedToken = req.cookies?.refreshToken;

  if (presentedToken) {
    try {
      const payload = verifyRefreshToken(presentedToken);

      // Tags ONLY this one token. Scoping by id (never by userId) is what keeps
      // the LOGGED_OUT exemption from leaking onto sibling or predecessor
      // tokens, which must stay ROTATED so a stolen one still trips detection.
      await prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: REVOKE_REASON.LOGGED_OUT },
      });
    } catch {
      // An unverifiable cookie has nothing to revoke — clearing it is enough.
    }
  }

  clearRefreshCookie(res);

  // Worth a row: it is the counterpart to LOGIN_SUCCEEDED, so a session's start
  // and end can be paired without any token material linking them.
  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: "User",
    entityId: req.user.id,
    meta: { ...requestContext(req), hadCookie: Boolean(presentedToken) },
  });

  return res.status(200).json({ message: "Logged out" });
}

// ---------------------------------------------------------------------------
// GET /api/auth/me   (AUTH)
// ---------------------------------------------------------------------------

export async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      studentId: true,
      facultyId: true,
      isActive: true,
    },
  });

  // A still-valid access token can outlive the account it was issued for, since
  // requireAuth performs no database lookup. This is where that is caught.
  if (!user || !user.isActive) {
    return res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "User account is no longer available" },
    });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: user.studentId,
      facultyId: user.facultyId,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/admin/issue-otp   (ADMIN)
// ---------------------------------------------------------------------------

const adminIssueOtpSchema = z.object({
  studentId: z.string("studentId is required").trim().min(1, "studentId is required"),
});

// Availability fallback: a student whose email is failing on election day can be
// read a code over the phone or at a desk. Deliberately bypasses the per-email
// OTP limiter (the ADMIN role gate is the control here) but still honours the
// one-active-code invariant, the expiry, and the attempts cap.
export async function adminIssueOtp(req, res) {
  const parsed = adminIssueOtpSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { studentId } = parsed.data;

  const student = await prisma.user.findUnique({
    where: { studentId },
    select: { id: true, email: true, name: true, studentId: true, isActive: true },
  });

  // No anti-enumeration masking here: the caller is already an authenticated
  // ADMIN, and an admin needs to know the studentId was wrong.
  if (!student || !student.isActive) {
    res.locals.adminOtpOutcome = ADMIN_OTP_OUTCOMES.STUDENT_NOT_FOUND;

    return res.status(404).json({
      error: { code: "STUDENT_NOT_FOUND", message: "No active student found with that student ID" },
    });
  }

  await prisma.otpToken.updateMany({
    where: { userId: student.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp();
  const codeHash = await hashValue(code);
  const expiresAt = getOtpExpiry();

  await prisma.otpToken.create({
    data: {
      userId: student.id,
      codeHash,
      expiresAt,
      attempts: 0,
      // Records WHICH admin issued it — this is the audit trail for a manual
      // code, and the reason the column exists on OtpToken.
      issuedByAdminId: req.user.id,
    },
  });

  res.locals.adminOtpOutcome = ADMIN_OTP_OUTCOMES.ISSUED;
  res.locals.adminOtpStudentId = student.id;

  // SENSITIVE: an admin minting a login code for someone else is the single
  // most abusable action in the auth surface. Actor is the ADMIN; the entity is
  // the student. The code is NOT recorded.
  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.ADMIN_ISSUED_OTP,
    entityType: "User",
    entityId: student.id,
    meta: {
      ...requestContext(req),
      issuedForStudentId: student.studentId,
      issuedForUserId: student.id,
      delivery: "MANUAL_READ_OUT",
    },
  });

  // The plaintext is returned rather than emailed — that is the entire point of
  // this endpoint. It is never logged.
  return res.status(201).json({
    code,
    expiresAt,
    student: {
      id: student.id,
      name: student.name,
      studentId: student.studentId,
      email: student.email,
    },
  });
}
