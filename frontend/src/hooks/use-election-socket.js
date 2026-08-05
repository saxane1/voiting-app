"use client";

import { useEffect, useRef, useState } from "react";

import { refreshAccessToken } from "@/utils/axios";
import { SOCKET_ERROR, acquireSocket, releaseSocket, socketErrorCode } from "@/utils/socket";

/**
 * Live aggregates for ONE election (B8), for ONE admin dashboard.
 *
 * WHAT ARRIVES ON THIS SOCKET — the complete list, from
 * backend/src/config/socket.js:
 *
 *   results-update  { electionId, tallies[{ candidateId, name, voteCount }],
 *                     turnout{ voted, eligible, turnoutPct } }
 *   election-status { electionId, status }
 *
 * That is everything. There is deliberately no per-vote event and there never
 * will be one — the backend's own comment explains why: an observer watching a
 * live per-vote feed while also watching who walks up to a terminal
 * reconstructs ballots in real time, with no database access at all. The 5s
 * throttle is therefore a SECRECY mechanism as much as a performance one. This
 * hook renders what arrives and asks for nothing else.
 *
 * THE ROOM IS THE SUBSCRIPTION. Connecting is not subscribing: an admin
 * receives updates only for elections they have explicitly joined, so a
 * dashboard showing the Engineering race never sees the Gudoomiye tally.
 *
 * REST FIRST, SOCKET SECOND, REST AGAIN ON RECONNECT:
 *   - The page seeds from GET /results + GET /turnout, so it is never blank.
 *   - `join-election` triggers an immediate one-socket snapshot, then live
 *     ticks take over.
 *   - Every reconnect AFTER the first calls `onResync`, because a socket that
 *     was down missed ticks and the throttle means nothing replays them. A
 *     stale tally must never be painted as if it were live.
 *
 * TOKENS. The handshake token comes from the in-memory store via the `auth`
 * callback in utils/socket.js, re-read on every attempt. The server verifies it
 * once at connect and never again for that socket's lifetime — so the case that
 * needs handling is a RECONNECT whose token has since expired, which arrives as
 * `connect_error` with `TOKEN_EXPIRED`. That is answered by refreshing through
 * F0's single-flight refresh and reconnecting, whereupon the callback supplies
 * the new token. Nothing crashes and nothing loops.
 *
 * STATE DISCIPLINE. Every value below is written ONLY from a socket callback —
 * an ack, an event, or a connection handler. The effect body itself sets no
 * state: it wires listeners and connects, and the state that results is
 * reported back asynchronously. `feed` carries the electionId it belongs to, so
 * a payload left over from a previous election is ignored by derivation rather
 * than having to be cleared.
 */

export const CONNECTION = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  REFUSED: "refused",
};

/** How long to wait before retrying a handshake error we do not recognise. */
const UNKNOWN_ERROR_RETRY_MS = 3000;

const EMPTY_FEED = {
  electionId: null,
  phase: CONNECTION.CONNECTING,
  refusal: null,
  live: null,
  liveStatus: null,
};

export function useElectionSocket({ electionId, enabled, onResync, onStatusChange }) {
  const [feed, setFeed] = useState(EMPTY_FEED);

  // Callbacks change identity every render; holding them in a ref keeps the
  // effect below keyed on the election alone, so a parent re-render cannot tear
  // the connection down and rebuild it. Written after render, never during.
  const callbacks = useRef({ onResync, onStatusChange });

  useEffect(() => {
    callbacks.current = { onResync, onStatusChange };
  });

  // Survives across reconnects within one mount: the FIRST connect is the one
  // the page already seeded from REST, so only later ones need a re-seed.
  const hasConnected = useRef(false);

  useEffect(() => {
    if (!enabled || !electionId) {
      return undefined;
    }

    const socket = acquireSocket();

    let cancelled = false;
    let retryTimer = null;
    let refreshing = false;

    /** Every state write goes through here, tagged with the election it is for. */
    function update(patch) {
      if (cancelled) return;

      setFeed((current) => ({
        ...(current.electionId === electionId ? current : EMPTY_FEED),
        electionId,
        ...patch,
      }));
    }

    function join() {
      // The ack tells us the election exists and what the server thinks its
      // status is right now — worth having before the first tick arrives.
      socket.emit("join-election", { electionId }, (ack) => {
        if (ack?.ok) {
          update({ phase: CONNECTION.LIVE, liveStatus: ack.status, refusal: null });
          return;
        }

        update({
          phase: CONNECTION.REFUSED,
          refusal: ack?.error?.message ?? "This election's live feed could not be joined.",
        });
      });
    }

    function handleConnect() {
      join();

      if (hasConnected.current) {
        // We were disconnected and missed an unknown number of throttled ticks.
        // Re-read the authoritative numbers rather than trusting what is on
        // screen.
        callbacks.current.onResync?.();
      }

      hasConnected.current = true;
    }

    function handleDisconnect(reason) {
      // Our own teardown on unmount — not a fault, and the component is going
      // away anyway.
      if (reason === "io client disconnect") return;

      update({ phase: CONNECTION.RECONNECTING });
    }

    async function handleConnectError(error) {
      // A transport-level failure (backend restarting, network blip). socket.io
      // retries these itself with its own backoff, so stay out of its way.
      if (socket.active) {
        update({ phase: CONNECTION.RECONNECTING });
        return;
      }

      // Everything below is a HANDSHAKE rejection from io.use(). socket.io does
      // NOT auto-retry those — reconnecting is explicitly our job.
      const code = socketErrorCode(error);

      if (code === SOCKET_ERROR.FORBIDDEN || code === SOCKET_ERROR.INVALID_TOKEN) {
        // A non-admin, or a token this server will never accept. Retrying would
        // hammer the handshake to no purpose.
        update({
          phase: CONNECTION.REFUSED,
          refusal: error?.message ?? "The live feed refused this session.",
        });
        return;
      }

      update({ phase: CONNECTION.RECONNECTING });

      if (code === SOCKET_ERROR.TOKEN_EXPIRED || code === SOCKET_ERROR.NO_TOKEN) {
        // The in-memory token lapsed while the dashboard sat open. Refresh
        // through F0 (single-flight, shared with every REST call), then
        // reconnect — the auth callback reads the NEW token on the next attempt.
        if (refreshing) return;

        refreshing = true;

        try {
          await refreshAccessToken();
        } catch {
          // The refresh cookie is gone too; axios's own handler has already
          // ended the session and routed to /login. Nothing left to do here.
          return;
        } finally {
          refreshing = false;
        }

        if (!cancelled) socket.connect();

        return;
      }

      // An unrecognised handshake error. Retry once on a timer rather than
      // giving up silently or spinning.
      retryTimer = setTimeout(() => {
        if (!cancelled) socket.connect();
      }, UNKNOWN_ERROR_RETRY_MS);
    }

    function handleResultsUpdate(payload) {
      // Room membership already scopes this, but a client that joined two
      // elections in quick succession could still see one stray payload.
      if (payload?.electionId !== electionId) return;

      update({
        live: {
          tallies: payload.tallies ?? [],
          turnout: payload.turnout ?? null,
          receivedAt: Date.now(),
        },
      });
    }

    function handleElectionStatus(payload) {
      if (payload?.electionId !== electionId) return;

      update({ liveStatus: payload.status });
      callbacks.current.onStatusChange?.(payload.status);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("results-update", handleResultsUpdate);
    socket.on("election-status", handleElectionStatus);

    if (socket.connected) {
      // The shared client was already up (another dashboard, or a remount).
      // join()'s ack reports LIVE; nothing is set synchronously here.
      hasConnected.current = true;
      join();
    } else {
      socket.connect();
    }

    return () => {
      cancelled = true;

      if (retryTimer) clearTimeout(retryTimer);

      // Leave the room BEFORE letting go of the connection: if another
      // dashboard is holding it open, the socket survives this unmount and
      // would otherwise keep receiving an election nobody is looking at.
      if (socket.connected) {
        socket.emit("leave-election", { electionId });
      }

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("results-update", handleResultsUpdate);
      socket.off("election-status", handleElectionStatus);

      releaseSocket();
    };
  }, [electionId, enabled]);

  // Derived, not stored: a feed belonging to a different election (or a hook
  // that is disabled) reports nothing rather than leaking the previous one's
  // numbers while the new connection comes up.
  const isCurrent = Boolean(enabled && electionId && feed.electionId === electionId);

  return {
    connection: !enabled || !electionId
      ? CONNECTION.IDLE
      : isCurrent
        ? feed.phase
        : CONNECTION.CONNECTING,
    refusal: isCurrent ? feed.refusal : null,
    live: isCurrent ? feed.live : null,
    liveStatus: isCurrent ? feed.liveStatus : null,
  };
}
