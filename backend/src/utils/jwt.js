import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

// Tokens carry the minimum needed for authorisation and nothing else — no email,
// no name, no studentId, no facultyId. A JWT payload is only base64, readable by
// anyone holding the token, so PII must not go in it.

export function signAccessToken({ sub, role }) {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: sub,
    expiresIn: env.ACCESS_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

// The refresh token carries only the subject and a random jti. Role is
// deliberately omitted so a role change takes effect on the next refresh rather
// than being frozen into a long-lived token. Revocation is handled by the
// RefreshToken table, not here.
//
// The jti exists because {sub, iat, exp} alone has one-second resolution: two
// tokens rotated for the same user inside the same second would be byte-identical
// and collide on RefreshToken.tokenHash @unique. It also gives the rotation chain
// a stable handle. Random UUID, so it carries no PII.
export function signRefreshToken({ sub }) {
  return jwt.sign({ jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    subject: sub,
    expiresIn: env.REFRESH_TTL,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
