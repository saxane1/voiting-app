import { prisma } from "../config/prisma.js";
import { notFound } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
import { verifyVoteChain } from "../utils/chain.js";
// The aggregates themselves live in utils/tally.js, NOT here. B8's socket
// broadcaster calls the same two functions, so the number pushed to a live
// dashboard and the number returned by these endpoints are computed by the same
// code and cannot drift apart. Do not reimplement a tally in this file.
import { computeTallies, computeTurnout, totalVotesOf } from "../utils/tally.js";

// ---------------------------------------------------------------------------
// ADMIN-ONLY. There is no public results endpoint and there will not be one
// (design rule 8) — the university announces official results outside the app.
//
// SECRECY BOUNDARY FOR THIS WHOLE FILE:
//   /results  reads Vote        -> aggregate counts per candidate
//   /turnout  reads VoteReceipt -> aggregate participation
// The two headline numbers come from the two unlinked tables INDEPENDENTLY.
// Nothing here joins Vote to VoteReceipt or to User, and nothing may. The only
// place the two tables meet is a comparison of two integers in /integrity.
// That boundary is now enforced inside utils/tally.js, which is where the
// queries live — see the header there.
// ---------------------------------------------------------------------------

async function loadElection(id) {
  return prisma.election.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      facultyId: true,
      startAt: true,
      endAt: true,
      eligibleCount: true,
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/elections/:id/results   (ADMIN)
// ---------------------------------------------------------------------------

export async function getResults(req, res) {
  const election = await loadElection(req.params.id);

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  // Aggregate only — the groupBy behind this returns counts per candidate and
  // never a single ballot row, let alone a voter. Zero-vote candidates are
  // included and the ordering is decided in one place, shared with B8.
  const results = await computeTallies(election.id);
  const totalVotes = totalVotesOf(results);

  // AWAITED, unlike the other two. Results are the most sensitive read in the
  // system — who saw the tally before it was announced is exactly the question
  // an audit is for — so the access is recorded BEFORE it is disclosed, which
  // closes the window where the process dies between responding and logging.
  // writeAudit swallows its own errors, so this can still never fail the
  // request: an audit outage must not lock an admin out of results mid-election
  // (the B1 availability rule). A failure is logged loudly instead.
  await writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.RESULTS_VIEWED,
    entityType: "Election",
    entityId: election.id,
    meta: {
      ...requestContext(req),
      statusAtView: election.status,
      totalVotes,
      candidateCount: results.length,
    },
  });

  return res.status(200).json({
    election: {
      id: election.id,
      title: election.title,
      type: election.type,
      status: election.status,
    },
    results,
    totalVotes,
  });
}

// ---------------------------------------------------------------------------
// GET /api/elections/:id/turnout   (ADMIN)
// ---------------------------------------------------------------------------

export async function getTurnout(req, res) {
  const election = await loadElection(req.params.id);

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  // Participation side only — VoteReceipt, never Vote. includeHourly is the
  // one thing this endpoint asks for that a dashboard tick does not: the hourly
  // curve, which is exactly as fine-grained as the stored data gets.
  const turnout = await computeTurnout(election, { includeHourly: true });

  // The FROZEN denominator, captured at /open. Never recomputed from the
  // current student list — students added or deactivated mid-election must not
  // move a turnout percentage that has already been reported.
  const { voted, eligible } = turnout;

  const payload = {
    election: {
      id: election.id,
      title: election.title,
      status: election.status,
    },
    ...turnout,
  };

  if (eligible === null) {
    payload.note =
      "This election has never been opened, so no eligible electorate was frozen. Turnout percentage is undefined.";
  }

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.TURNOUT_VIEWED,
    entityType: "Election",
    entityId: election.id,
    meta: { ...requestContext(req), statusAtView: election.status, voted, eligible },
  });

  return res.status(200).json(payload);
}

// ---------------------------------------------------------------------------
// GET /api/elections/:id/integrity   (ADMIN)
// ---------------------------------------------------------------------------

export async function checkIntegrity(req, res) {
  const election = await loadElection(req.params.id);

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  const [votes, receiptsCount] = await Promise.all([
    prisma.vote.findMany({
      where: { electionId: election.id },
      select: { id: true, prevHash: true, hash: true, candidateId: true },
    }),
    // A COUNT, not a join. The two tables are compared as two integers and in
    // no other way.
    prisma.voteReceipt.count({ where: { electionId: election.id } }),
  ]);

  const report = verifyVoteChain({ electionId: election.id, votes, receiptsCount });

  writeAudit({
    actorUserId: req.user.id,
    action: AUDIT_ACTIONS.INTEGRITY_CHECKED,
    entityType: "Election",
    entityId: election.id,
    meta: {
      ...requestContext(req),
      statusAtView: election.status,
      valid: report.valid,
      votesCount: report.votesCount,
      receiptsCount: report.receiptsCount,
      problemCount: report.problems.length,
      problemKinds: [...new Set(report.problems.map((problem) => problem.kind))],
    },
  });

  return res.status(200).json({
    election: {
      id: election.id,
      title: election.title,
      status: election.status,
    },
    ...report,
  });
}
