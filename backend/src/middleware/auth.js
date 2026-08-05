import jwt from "jsonwebtoken";

import { verifyAccessToken } from "../utils/jwt.js";

// Pure token verification — deliberately NO database access. Keeping this
// stateless means every authenticated request costs zero queries, which matters
// on election day. A revoked/deactivated-user check is a separate concern: the
// access token is short-lived (ACCESS_TTL), and refresh is where revocation is
// enforced against the RefreshToken table.

function unauthorized(res, code, message) {
  return res.status(401).json({ error: { code, message } });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return unauthorized(res, "NO_TOKEN", "Authorization header is missing");
  }

  // Split rather than slice so "Bearer" alone, or a wrong scheme, is caught.
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return unauthorized(
      res,
      "NO_TOKEN",
      "Authorization header must be in the form 'Bearer <token>'"
    );
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    // Distinct codes so the frontend axios interceptor can branch:
    // TOKEN_EXPIRED -> silently call /auth/refresh and retry;
    // INVALID_TOKEN -> bounce to login, refreshing will not help.
    if (error instanceof jwt.TokenExpiredError) {
      return unauthorized(res, "TOKEN_EXPIRED", "Access token has expired");
    }

    return unauthorized(res, "INVALID_TOKEN", "Access token is invalid");
  }

  // A token signed with the right secret but the wrong shape (e.g. a refresh
  // token, or one issued before a payload change) is not usable here.
  if (!payload.sub || !payload.role) {
    return unauthorized(res, "INVALID_TOKEN", "Access token payload is malformed");
  }

  req.user = { id: payload.sub, role: payload.role };

  next();
}
