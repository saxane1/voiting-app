import { prisma } from "../config/prisma.js";

// ---------------------------------------------------------------------------
// THE ONE PLACE ELECTION RESULTS ARE COMPUTED.
//
// B7's REST endpoints (GET /results, GET /turnout) and B8's socket broadcaster
// both call these functions, and that is the entire point of this file. An
// admin watching the live dashboard and an admin refreshing the results page
// must never be shown two different numbers for the same election. Two separate
// implementations that agree today will drift the first time one of them is
// touched; one implementation cannot drift at all.
//
// SECRECY BOUNDARY — identical to results-controllers.js, and it moves here
// with the logic:
//   computeTallies  reads Vote        ONLY -> aggregate counts per candidate
//   computeTurnout  reads VoteReceipt ONLY -> aggregate participation
// The two headline numbers come from the two unlinked tables INDEPENDENTLY.
// Nothing here joins Vote to VoteReceipt or to User, nothing returns a userId,
// a Vote id, a receipt or a sub-hour timestamp, and nothing here ever may.
// A leak added here would leak on the REST response AND on the socket wire.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tallies — the Vote side.
// ---------------------------------------------------------------------------

// Returns the full per-candidate row (including presentation fields). Callers
// project down to whatever their transport needs; the counts and the ordering
// are computed once, here.
export async function computeTallies(electionId) {
  // groupBy returns counts per candidate and never a single ballot row, let
  // alone a voter.
  const [tally, candidates] = await Promise.all([
    prisma.vote.groupBy({
      by: ["candidateId"],
      where: { electionId },
      _count: { _all: true },
    }),
    prisma.candidate.findMany({
      where: { electionId },
      select: {
        id: true,
        manifesto: true,
        photoUrl: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const counts = new Map(tally.map((row) => [row.candidateId, row._count._all]));

  return (
    candidates
      // Candidates with no votes must still appear, at zero.
      .map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.user.name, // admin-only surfaces, so candidate PII is fine
        manifesto: candidate.manifesto,
        photoUrl: candidate.photoUrl,
        voteCount: counts.get(candidate.id) ?? 0,
      }))
      // Ties are simply equal counts. This reports numbers; it does not declare
      // a winner and does not resolve ties — the university announces.
      .sort((a, b) => b.voteCount - a.voteCount || a.name.localeCompare(b.name))
  );
}

export function totalVotesOf(tallies) {
  return tallies.reduce((sum, row) => sum + row.voteCount, 0);
}

// The lean shape that goes over the socket wire: three fields, all aggregate.
// Deliberately narrower than the REST row — a dashboard tick needs a count, not
// a manifesto.
export function toWireTallies(tallies) {
  return tallies.map(({ candidateId, name, voteCount }) => ({
    candidateId,
    name,
    voteCount,
  }));
}

// ---------------------------------------------------------------------------
// Turnout — the VoteReceipt side.
// ---------------------------------------------------------------------------

// `election` must carry { id, eligibleCount }. eligibleCount is the FROZEN
// denominator captured at /open — never recomputed from the current student
// list, so students added or deactivated mid-election cannot move a turnout
// percentage that has already been reported.
//
// `includeHourly` is off by default: the hourly curve is a REST-report detail,
// and running that second groupBy on every 5-second dashboard tick would be a
// query nobody reads.
export async function computeTurnout(election, { includeHourly = false } = {}) {
  // Participation only. No candidateId is read anywhere in this function.
  const [voted, buckets] = await Promise.all([
    prisma.voteReceipt.count({ where: { electionId: election.id } }),
    includeHourly
      ? // votedAt is already floored to the hour at write time, so grouping by
        // it IS the hourly curve. This is the only time signal that exists for
        // votes, by design — see src/utils/time.js.
        prisma.voteReceipt.groupBy({
          by: ["votedAt"],
          where: { electionId: election.id },
          _count: { _all: true },
          orderBy: { votedAt: "asc" },
        })
      : null,
  ]);

  const eligible = election.eligibleCount;

  const turnout = {
    voted,
    eligible,
    turnoutPct: eligible ? Number(((voted / eligible) * 100).toFixed(1)) : null,
  };

  if (includeHourly) {
    turnout.hourly = buckets.map((bucket) => ({
      hour: bucket.votedAt,
      count: bucket._count._all,
    }));
  }

  return turnout;
}

// ---------------------------------------------------------------------------
// The socket payload.
// ---------------------------------------------------------------------------

// Exactly what `results-update` carries: { electionId, tallies, turnout }.
// Built from the same two functions the REST endpoints use, so the live number
// and the refreshed number are the same number.
export async function computeAggregate(election) {
  const [tallies, turnout] = await Promise.all([
    computeTallies(election.id),
    computeTurnout(election),
  ]);

  return {
    electionId: election.id,
    tallies: toWireTallies(tallies),
    turnout,
  };
}
