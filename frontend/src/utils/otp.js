/**
 * OTP policy the UI needs to know about.
 *
 * These MIRROR backend settings; they are not the source of truth and are used
 * only to shape the experience (how many boxes to draw, when to enable the
 * resend button, which of two indistinguishable failures to lead with). Every
 * one of them is re-checked server-side, so a drifted value here degrades the
 * wording, never the security.
 *
 * Backend counterparts:
 *   OTP_LENGTH               backend/src/utils/otp.js generateOtp()
 *   RESEND_COOLDOWN_SECONDS  backend/src/controllers/auth-controllers.js
 *   OTP_TTL_SECONDS          env OTP_TTL_MIN (default 10)
 *   OTP_MAX_ATTEMPTS         env OTP_MAX_ATTEMPTS (default 5)
 */

/**
 * Single config point for the code length — the component draws whatever this
 * says rather than assuming six. Note the backend currently pins the same
 * number in `verifyOtpSchema` (/^\d{6}$/), so a real change has to move both.
 */
export const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH) || 6;

export const RESEND_COOLDOWN_SECONDS = 60;

export const OTP_TTL_SECONDS = 10 * 60;

export const OTP_MAX_ATTEMPTS = 5;

/** Digits only, capped at `maxLength`. Used for typing AND for paste. */
export function sanitizeOtp(value, maxLength = OTP_LENGTH) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, maxLength);
}
