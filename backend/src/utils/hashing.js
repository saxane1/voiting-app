import crypto from "node:crypto";

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// ⚠ DO NOT REMOVE THE SHA-256 PRE-DIGEST. It is not redundant with bcrypt, and
// deleting it silently reintroduces an authentication bypass.
//
// Why: bcrypt truncates its input at 72 bytes. OTP codes are far shorter, so the
// truncation is invisible there — but a refresh token is a ~155-byte JWT whose
// first 72 bytes are the shared algorithm header plus only the opening of the
// payload. Two DIFFERENT refresh tokens issued to the same user are therefore
// often identical within that 72-byte window, so bcrypt would consider them the
// same value. A rotated-away (or explicitly revoked) refresh token would still
// verify against its replacement's stored hash, defeating rotation and
// revocation — design rule 6 in CLAUDE.md.
//
// Pre-digesting to a fixed-length 64-char SHA-256 hex string keeps every input
// inside bcrypt's limit, so one hashing API stays correct for both short OTP
// codes and long tokens. Verified by the B1 smoke test: two distinct 155-byte
// refresh tokens must produce non-matching hashes.
function digest(plain) {
  return crypto.createHash("sha256").update(String(plain)).digest("hex");
}

export async function hashValue(plain) {
  return bcrypt.hash(digest(plain), SALT_ROUNDS);
}

export async function compareValue(plain, hash) {
  if (!plain || !hash) {
    return false;
  }

  return bcrypt.compare(digest(plain), hash);
}
