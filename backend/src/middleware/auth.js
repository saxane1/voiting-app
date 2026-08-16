import jwt from "jsonwebtoken";

import { prisma } from "../config/prisma.js";
import { verifyAccessToken } from "../utils/jwt.js";

// ---------------------------------------------------------------------------
// TOKEN VERIFICATION + A LIVE ACCOUNT CHECK.
//
// This middleware used to be deliberately stateless — zero queries per request,
// with revocation left entirely to /auth/refresh and bounded by the short
// ACCESS_TTL. B3b changed the requirement: an administrator can now be
// deactivated from a screen in the app, and "deactivated" that leaves the
// account working for up to another ACCESS_TTL is not a revocation, it is a
// delay. When the reason for pulling someone's access is that they should not
// have it RIGHT NOW, a 15-minute tail is the whole problem.
//
// The cost is one indexed primary-key lookup per authenticated request. That is
// the cheapest query this database serves, and every route behind this
// middleware already issues at least one query of its own, so the added load is
// a fraction of a request that was never free. It is a real cost on election
// day and it was accepted knowingly — see docs/B3b-user-management.md §5.
//
// NOT covered by this: an established Socket.io connection. The B8 handshake
// verifies the token once at connect and never re-checks it, so a deactivated
// admin keeps a live results feed until that socket drops. Aggregate-only data,
// but worth knowing.
// ---------------------------------------------------------------------------

function unauthorized(res, code, message) {
  return res.status(401).json({ error: { code, message } });
}

export async function requireAuth(req, res, next) {
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

  // The account behind a structurally valid token may have been deactivated —
  // or deleted — since the token was issued. This is the check that makes
  // PATCH /api/users/:id/deactivate bite immediately instead of on token expiry.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    // A distinct code from INVALID_TOKEN: the token is fine, the account is not,
    // and an operator reading logs should be able to tell those apart. The
    // frontend interceptor retries any 401 once through /auth/refresh, which
    // rejects a deactivated user too, so this resolves to a clean logout.
    return unauthorized(
      res,
      "ACCOUNT_INACTIVE",
      "This account is no longer active. Please contact the election commission."
    );
  }

  // Role is taken from the DATABASE, not from the token's claim. The two agree
  // in normal operation, but where they disagree the database is the authority —
  // a stale role in an already-issued token must never outrank the live record.
  req.user = { id: user.id, role: user.role };

  next();
}
