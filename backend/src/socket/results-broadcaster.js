import { prisma } from "../config/prisma.js";
import { computeAggregate } from "../utils/tally.js";
import { electionRoom } from "./rooms.js";

// ---------------------------------------------------------------------------
// THE THROTTLE — this is the part that keeps a live dashboard from taxing the
// vote hot path.
//
// THE NAIVE DESIGN, which this is not: the vote controller finishes a
// transaction, then computes the tally and emits it. That puts two aggregate
// queries (a groupBy over every Vote plus a count over every VoteReceipt) on
// the critical path of every single ballot. 500 votes in five seconds would be
// 500 aggregate recomputes over a table that is 500 rows longer each time —
// quadratic work, on the connection pool the votes themselves are queuing for,
// during the exact minutes it must not be slow. B6 spent real effort making
// that path fast; it is not being handed back here.
//
// THE DESIGN: the two responsibilities are cut apart.
//
//   WRITER (the vote controller, on the hot path) calls notifyVote(electionId).
//   That is one Set.add. No query, no aggregate, no io lookup, no await, no
//   promise. It cannot be slow because there is nothing in it to be slow.
//
//   READER (this module's timer, off the hot path) wakes every THROTTLE_MS,
//   takes whatever elections are dirty, and computes ONE aggregate and emits
//   ONE `results-update` per dirty election. 500 votes in a five-second window
//   produce one aggregate query and one emit — not 500. The recompute runs on
//   the TIMER's schedule; the votes only ever set a flag.
//
// Trailing edge, on purpose: the emit carries the LATEST state at the end of
// the interval, so a burst is reported once, complete, rather than being
// reported early and then again. A dashboard that is at most five seconds
// behind is a live dashboard; per-vote emits would be a self-inflicted load
// test.
//
// FIRE-AND-FORGET IS ABSOLUTE. Every export here swallows its own errors. The
// socket layer being down, the io server being unattached, an emit throwing, an
// aggregate query failing — none of it may ever slow, fail or roll back a vote
// or an administrative transition. Availability of voting outranks liveness of
// a dashboard, always (the B1 availability rule).
// ---------------------------------------------------------------------------

// Five seconds: fast enough that a projector-mounted dashboard reads as live,
// slow enough that a heavy voting minute is ~12 aggregate queries instead of
// thousands.
export const THROTTLE_MS = 5_000;

// Election ids with votes committed since the last emit. A Set, so a thousand
// votes for one election collapse into one entry.
const dirtyElections = new Set();

let io = null;
let timer = null;

// ---------------------------------------------------------------------------
// WRITE SIDE — called from the vote controller. Keep this trivial.
// ---------------------------------------------------------------------------

// The ENTIRE cost a committed vote pays for the realtime dashboard.
//
// Do not add a query here. Do not make it async. Do not have it touch `io`.
// Everything expensive belongs on the timer below. The try/catch is belt and
// braces — Set.add on a string cannot realistically throw — but it guarantees
// the signature this function promises: it can never throw into the vote path.
export function notifyVote(electionId) {
  try {
    dirtyElections.add(electionId);
  } catch (error) {
    console.error(`[socket] notifyVote failed for election ${electionId}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// READ SIDE — the timer, and the aggregate emitters.
// ---------------------------------------------------------------------------

// eligibleCount is the frozen turnout denominator; id is all computeAggregate
// needs besides it.
async function loadElectionForAggregate(electionId) {
  return prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true, eligibleCount: true },
  });
}

function roomIsEmpty(room) {
  return !io?.sockets.adapter.rooms.get(room)?.size;
}

async function buildPayload(electionId) {
  const election = await loadElectionForAggregate(electionId);

  // Deleted between the vote and the tick. Nothing to report.
  if (!election) {
    return null;
  }

  return computeAggregate(election);
}

// Emits to everyone in the election's room. Never throws.
async function emitResultsUpdate(electionId) {
  try {
    if (!io) {
      return;
    }

    const room = electionRoom(electionId);

    // Nobody is watching this election, so skip the aggregate entirely. The
    // cheapest query is the one not run — on a quiet night with no dashboard
    // open, voting costs the database nothing extra at all.
    if (roomIsEmpty(room)) {
      return;
    }

    const payload = await buildPayload(electionId);

    if (payload) {
      io.to(room).emit("results-update", payload);
    }
  } catch (error) {
    // Loud, but contained. A dashboard that misses a tick recovers on the next
    // one; the vote that triggered this has long since been committed and
    // answered.
    console.error(
      `[socket] results-update failed for election ${electionId}: ${error.message}`
    );
  }
}

// Emits to ONE socket. Used for the snapshot a dashboard gets the moment it
// joins a room, so it renders the current standing immediately instead of
// sitting blank until the next vote arrives. Never throws.
export async function sendResultsSnapshot(socket, electionId) {
  try {
    const payload = await buildPayload(electionId);

    if (payload) {
      socket.emit("results-update", payload);
    }
  } catch (error) {
    console.error(
      `[socket] results snapshot failed for election ${electionId}: ${error.message}`
    );
  }
}

async function flushDirty() {
  if (dirtyElections.size === 0) {
    return;
  }

  const electionIds = [...dirtyElections];

  // Cleared BEFORE the awaits, not after. A vote that commits while these
  // aggregate queries are in flight re-marks its election dirty and is picked
  // up by the NEXT tick. Clearing afterwards would drop that vote's signal into
  // the gap and leave the dashboard permanently one burst behind.
  dirtyElections.clear();

  await Promise.all(electionIds.map((electionId) => emitResultsUpdate(electionId)));
}

// ---------------------------------------------------------------------------
// STATUS EVENTS + THE FINAL FLUSH — called from the B4 transition handlers.
// ---------------------------------------------------------------------------

// Synchronous and self-catching, so an administrative transition never waits on
// (or fails because of) a socket.
export function emitElectionStatus(electionId, status) {
  try {
    io?.to(electionRoom(electionId)).emit("election-status", { electionId, status });
  } catch (error) {
    console.error(
      `[socket] election-status failed for election ${electionId}: ${error.message}`
    );
  }
}

// THE FINAL FLUSH, for /close.
//
// Without it, the last aggregate a dashboard ever receives for an election
// could be up to THROTTLE_MS old — a final tally frozen five seconds short of
// the truth, with no further vote coming to correct it. So closing bypasses the
// throttle and pushes the real final numbers once, immediately.
//
// The dirty flag is dropped first: this emit supersedes any pending one, and
// leaving it set would fire a redundant duplicate on the next tick.
export function flushElectionResults(electionId) {
  dirtyElections.delete(electionId);

  // Deliberately not awaited by the caller — /close responds on its own
  // schedule, and emitResultsUpdate swallows its own failures.
  void emitResultsUpdate(electionId);
}

// ---------------------------------------------------------------------------
// LIFECYCLE
// ---------------------------------------------------------------------------

export function attachBroadcaster(server) {
  io = server;

  if (timer) {
    return;
  }

  timer = setInterval(() => {
    // void, not await: setInterval cannot await, and flushDirty never rejects.
    void flushDirty();
  }, THROTTLE_MS);

  // A dashboard heartbeat must not be the reason the process refuses to exit.
  timer.unref?.();
}

export function stopBroadcaster() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  dirtyElections.clear();
  io = null;
}
