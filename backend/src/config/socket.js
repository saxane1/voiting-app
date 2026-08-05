import { Server } from "socket.io";

import { registerElectionHandlers } from "../socket/election-events.js";
import { attachBroadcaster, stopBroadcaster } from "../socket/results-broadcaster.js";
import { authenticateSocket } from "../socket/socket-auth.js";
import { env } from "./env.js";

// ---------------------------------------------------------------------------
// B8 — the realtime admin dashboard.
//
// This file wires the pieces together and owns nothing else:
//   src/socket/socket-auth.js          ADMIN-only handshake gate (io.use)
//   src/socket/election-events.js      join-election / leave-election
//   src/socket/results-broadcaster.js  the 5s throttle + the emitters
//
// WHAT GOES OVER THIS SOCKET, AND WHAT NEVER DOES.
// Two events, both aggregate:
//   results-update  { electionId, tallies[{candidateId,name,voteCount}],
//                     turnout{voted,eligible,turnoutPct} }
//   election-status { electionId, status }
//
// There is deliberately no "a vote just happened" event, and there never will
// be. Such an event is the most dangerous thing this module could ship: an
// observer watching a live per-vote feed while also watching who walks up to a
// terminal reconstructs ballots in real time, with no database access at all.
// So the throttle is not only a performance decision — batching emits into a
// 5-second aggregate is also what keeps an individual ballot unobservable on
// the wire. A socket payload carries counts, never events: no userId, no
// receipt, no vote id, no candidate-plus-timestamp pair, nothing finer than the
// hour that already exists in the data (src/utils/time.js).
// ---------------------------------------------------------------------------

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  // The gate. Runs during the handshake, so a non-admin never reaches
  // `connection` and can never join a room.
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    console.log(`[socket] admin ${socket.user.id} connected (${socket.id})`);

    registerElectionHandlers(socket);

    socket.on("disconnect", (reason) => {
      // socket.io removes the socket from its rooms automatically.
      console.log(`[socket] admin ${socket.user.id} disconnected (${reason})`);
    });
  });

  // Starts the throttle timer that turns "these elections are dirty" into at
  // most one aggregate emit per election per 5 seconds.
  attachBroadcaster(io);

  return io;
}

export function getIo() {
  if (!io) {
    throw new Error("Socket.io is not initialised — call initSocket(httpServer) first.");
  }

  return io;
}

// Used by the shutdown path (and by tests) so the throttle timer and the socket
// server do not outlive the process they belong to.
export async function closeSocket() {
  stopBroadcaster();

  if (io) {
    await io.close();
    io = null;
  }
}
