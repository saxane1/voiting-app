import jwt from "jsonwebtoken";

import { verifyAccessToken } from "../utils/jwt.js";

// ---------------------------------------------------------------------------
// THE SOCKET EQUIVALENT OF requireAuth + requireRole("ADMIN").
//
// Mounted with io.use(), so it runs during the handshake — before `connection`
// fires and before the socket can join any room or receive any event. A
// rejected handshake never becomes a connection at all, which is what makes
// this the same gate the REST layer has, not a check bolted on afterwards.
//
// Same verifier as the HTTP middleware (utils/jwt.js). One token format, one
// secret, one verification path — a token that would be rejected by the API is
// rejected here for the same reason.
//
// ADMIN only. The live dashboard is an aggregate view of an election in
// progress, which is admin territory by design rule 8 (results are ADMIN-ONLY;
// there is no public results endpoint). A STUDENT token authenticates fine and
// is still refused here. AUDITOR is refused too: the auditor's surface is the
// audit log (B9) and the integrity endpoint, both after the fact — a live
// running tally is not part of that role.
//
// KNOWN PROPERTY, deliberately not fixed:
//   The token is verified ONCE, at connect. A socket that connected with a
//   valid token stays connected and keeps receiving updates for its whole
//   lifetime, including past the 15-minute ACCESS_TTL of the token that opened
//   it. There is no mid-connection re-verification and no server-side kill on
//   expiry. That is acceptable here — this is an admin dashboard held open on a
//   trusted machine during an election, and the alternative (tearing the
//   dashboard down every 15 minutes, or re-authing on a timer) buys little
//   against the threat model. It IS a real difference from the REST surface,
//   where every request re-verifies. Recorded as a property, not an oversight:
//   revoking an admin mid-election requires disconnecting their socket, not
//   just letting the token lapse.
// ---------------------------------------------------------------------------

// socket.io sends err.message to the client's `connect_error` handler, and
// err.data alongside it. The codes mirror the REST error envelope so a frontend
// can branch on the same strings it already knows.
function reject(next, code, message) {
  const error = new Error(message);

  error.data = { code };

  return next(error);
}

export function authenticateSocket(socket, next) {
  // The handshake `auth` payload, not a header: it is the one channel the
  // socket.io client can populate on every transport (including the polling
  // fallback) and on every reconnect attempt.
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== "string") {
    return reject(next, "NO_TOKEN", "Authentication token is missing");
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    // Same split as the REST middleware, so the client can tell "refresh and
    // reconnect" (TOKEN_EXPIRED) from "go to login" (INVALID_TOKEN).
    if (error instanceof jwt.TokenExpiredError) {
      return reject(next, "TOKEN_EXPIRED", "Access token has expired");
    }

    return reject(next, "INVALID_TOKEN", "Access token is invalid");
  }

  // A token signed with the right secret but the wrong shape — a refresh token,
  // or one issued before a payload change — is not usable here.
  if (!payload.sub || !payload.role) {
    return reject(next, "INVALID_TOKEN", "Access token payload is malformed");
  }

  if (payload.role !== "ADMIN") {
    return reject(next, "FORBIDDEN", "The live dashboard is restricted to administrators");
  }

  // Same shape as req.user, so handlers read socket.user.id / socket.user.role
  // exactly as controllers read req.user.
  socket.user = { id: payload.sub, role: payload.role };

  return next();
}
