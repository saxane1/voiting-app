// Single definition of "the same email". Used by the OTP rate limiter, the user
// lookup, and the OtpToken lookup — if these ever diverge, a student could be
// rate-limited under one spelling of their address while requesting codes under
// another, or fail to be found at all.
export function normalizeEmail(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}
