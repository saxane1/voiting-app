import { prisma } from "../config/prisma.js";
import { sendResultsSnapshot } from "./results-broadcaster.js";
import { electionRoom } from "./rooms.js";

// ---------------------------------------------------------------------------
// Per-socket event handlers. Every socket that reaches this file has already
// cleared the ADMIN handshake gate in socket-auth.js.
//
// ROOMS: an admin receives updates only for elections they have explicitly
// joined. A connection is not a subscription — during a multi-election voting
// day, a dashboard showing the Engineering race has no business receiving the
// Gudoomiye tally, and it will not. Room membership is the whole scoping
// mechanism, so `results-update` is always emitted to a room and never
// broadcast server-wide.
// ---------------------------------------------------------------------------

// socket.io's ack callback is optional on the client. Guard it so a client that
// omits it does not crash the handler.
function respond(ack, payload) {
  if (typeof ack === "function") {
    ack(payload);
  }
}

function fail(ack, code, message) {
  respond(ack, { ok: false, error: { code, message } });
}

function readElectionId(payload) {
  const value = payload?.electionId;

  return typeof value === "string" ? value.trim() : "";
}

async function handleJoin(socket, payload, ack) {
  const electionId = readElectionId(payload);

  if (!electionId) {
    return fail(ack, "INVALID_PAYLOAD", "electionId is required");
  }

  // The election must actually exist. Without this check a typo'd id would
  // silently create a room nobody ever emits to, and the dashboard would look
  // like an election with no votes rather than an error.
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true, status: true },
  });

  if (!election) {
    return fail(ack, "ELECTION_NOT_FOUND", "Election not found");
  }

  await socket.join(electionRoom(election.id));

  respond(ack, { ok: true, electionId: election.id, status: election.status });

  // Immediate snapshot to THIS socket only. A dashboard that renders blank
  // until the next ballot happens to arrive is not a live dashboard — and
  // during a quiet stretch that could be minutes. Aggregate-only, same payload
  // as every other results-update.
  await sendResultsSnapshot(socket, election.id);
}

async function handleLeave(socket, payload, ack) {
  const electionId = readElectionId(payload);

  if (!electionId) {
    return fail(ack, "INVALID_PAYLOAD", "electionId is required");
  }

  // No existence check: leaving a room you are not in is a no-op, and refusing
  // to let a client detach from a deleted election would be perverse.
  await socket.leave(electionRoom(electionId));

  respond(ack, { ok: true, electionId });
}

// An async listener that rejects becomes an unhandled rejection, which in
// Node 15+ terminates the process. One bad `join-election` payload must not be
// able to take the API server down mid-election.
function guard(handler, socket, event) {
  return (payload, ack) => {
    Promise.resolve(handler(socket, payload, ack)).catch((error) => {
      console.error(`[socket] ${event} failed for admin ${socket.user.id}: ${error.message}`);
      fail(ack, "INTERNAL_ERROR", "Could not process the request");
    });
  };
}

export function registerElectionHandlers(socket) {
  socket.on("join-election", guard(handleJoin, socket, "join-election"));
  socket.on("leave-election", guard(handleLeave, socket, "leave-election"));
}
