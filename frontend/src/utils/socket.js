import { io } from "socket.io-client";

import { getAccessToken } from "./auth-token";
import { API_ORIGIN } from "./axios";

/**
 * THE ONE socket.io client for the whole app (B8).
 *
 * ADMIN-ONLY, and the client is written so it cannot casually become otherwise:
 * `acquireSocket()` is called from the results dashboard, which lives under the
 * ADMIN-guarded admin shell, and the hook that calls it additionally refuses to
 * connect unless the session's role is ADMIN. The server refuses non-admins at
 * the handshake anyway (backend/src/socket/socket-auth.js — STUDENT and AUDITOR
 * both rejected before `connection` fires), but a student's browser should not
 * be opening a connection that is going to be slammed shut either.
 *
 * THE TOKEN, AND WHY `auth` IS A FUNCTION.
 *
 * The handshake reads `socket.handshake.auth.token`. Passing `auth` as a plain
 * object would freeze whatever token existed at construction time into every
 * future reconnect attempt — and since the access token is memory-only and
 * rotates on refresh, that frozen copy would be stale exactly when it matters.
 * socket.io-client re-invokes an `auth` CALLBACK before every connection
 * attempt, including every automatic reconnect, so this reads the CURRENT
 * in-memory token each time. A reconnect after an F0 refresh therefore carries
 * the new token without anything having to remember to update it.
 *
 * The token stays memory-only here as everywhere else: it is read from the
 * auth-token store at connect time and never persisted, never copied into a
 * query string, never stored on the socket instance.
 *
 * KNOWN SERVER PROPERTY (backend/src/socket/socket-auth.js says so explicitly):
 * the token is verified ONCE, at connect, and is NOT re-checked for the
 * socket's lifetime. So an open dashboard keeps working past the 15-minute
 * ACCESS_TTL — but a RECONNECT needs a token that is valid right now. That is
 * what the callback above guarantees, and what the TOKEN_EXPIRED handling in
 * hooks/use-election-socket.js completes.
 */

/** Handshake refusal codes from backend/src/socket/socket-auth.js. */
export const SOCKET_ERROR = {
  NO_TOKEN: "NO_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_TOKEN: "INVALID_TOKEN",
  FORBIDDEN: "FORBIDDEN",
};

let socket = null;
let refCount = 0;

/**
 * The shared instance, reference-counted so two dashboards open at once share
 * one connection and the last one to unmount is the one that closes it.
 *
 * `autoConnect: false` — the caller connects deliberately, after it has checked
 * the role and confirmed there is a token to connect with.
 */
export function acquireSocket() {
  if (!socket) {
    socket = io(API_ORIGIN, {
      autoConnect: false,
      withCredentials: true,
      // Re-read per connection attempt. See the note above — this is the whole
      // reason a reconnect picks up a refreshed token.
      auth: (callback) => callback({ token: getAccessToken() }),
    });
  }

  refCount += 1;

  return socket;
}

/**
 * Release one hold. The connection is torn down only when the last holder lets
 * go, so navigating between two results screens does not close and reopen it.
 */
export function releaseSocket() {
  refCount = Math.max(0, refCount - 1);

  if (refCount === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}

/** The refusal code the server attached to a `connect_error`, if any. */
export function socketErrorCode(error) {
  return error?.data?.code ?? null;
}
