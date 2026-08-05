import { z } from "zod";

import { prisma } from "../config/prisma.js";
// B8 realtime. The ONLY socket import allowed in this file, and it must stay a
// synchronous, non-throwing, non-querying flag-setter — see the note at its
// call site below.
import { notifyVote } from "../socket/results-broadcaster.js";
import { badRequest, conflict, notFound, validationError } from "../utils/api-response.js";
import { AUDIT_ACTIONS, requestContext, writeAudit } from "../utils/audit.js";
// Shared with GET /integrity — the writer and the verifier must never compute
// the hash differently.
import { GENESIS_HASH, computeVoteHash } from "../utils/chain.js";
import { ELECTION_STATUS } from "../utils/election-status.js";
import { floorToHour } from "../utils/time.js";

// ---------------------------------------------------------------------------
// BALLOT SECRECY — READ SIDE
//
// Nothing in this file reads, joins to, or exposes the Vote table. The only
// "have I voted?" signal comes from VoteReceipt, which records participation
// (userId + electionId) and deliberately has no link to a ballot.
//
// There is NO student-facing way to see one's own choice, by design. Adding one
// would give a coercer something to demand, which is exactly what the split
// VoteReceipt/Vote design (rule 1) exists to prevent. Do not add it.
// ---------------------------------------------------------------------------

const ELECTION_SUMMARY = {
  id: true,
  title: true,
  type: true,
  status: true,
  startAt: true,
  endAt: true,
  facultyId: true,
};

// A student in faculty F votes in: their own faculty's leader election, plus
// every university-wide (Gudoomiye) election. Nothing else is theirs to see.
function eligibilityFilter(facultyId) {
  return {
    OR: [
      { type: "UNIVERSITY" },
      ...(facultyId ? [{ type: "FACULTY", facultyId }] : []),
    ],
  };
}

function isEligible(election, facultyId) {
  if (election.type === "UNIVERSITY") {
    return true;
  }

  return Boolean(facultyId) && election.facultyId === facultyId;
}

function withinWindow(election, now = new Date()) {
  return election.startAt <= now && now <= election.endAt;
}

// Faculty ballot first, then the university race — the order a student is
// expected to work through them.
function ballotOrder(a, b) {
  if (a.type !== b.type) {
    return a.type === "FACULTY" ? -1 : 1;
  }

  return a.title.localeCompare(b.title);
}

async function loadVoter(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, facultyId: true, isActive: true, role: true },
  });
}

// ---------------------------------------------------------------------------
// GET /api/me/ballots   (STUDENT)
// ---------------------------------------------------------------------------

export async function listMyBallots(req, res) {
  const voter = await loadVoter(req.user.id);

  if (!voter || !voter.isActive) {
    return notFound(res, "User account is no longer available", "USER_NOT_FOUND");
  }

  // Only OPEN elections: a student has nothing to do with a DRAFT, SCHEDULED,
  // CLOSED or PUBLISHED one.
  const elections = await prisma.election.findMany({
    where: {
      status: ELECTION_STATUS.OPEN,
      ...eligibilityFilter(voter.facultyId),
    },
    select: ELECTION_SUMMARY,
  });

  // Participation lookup — VoteReceipt only, never Vote.
  const receipts = await prisma.voteReceipt.findMany({
    where: { userId: voter.id, electionId: { in: elections.map((e) => e.id) } },
    select: { electionId: true },
  });

  const votedIn = new Set(receipts.map((receipt) => receipt.electionId));
  const now = new Date();

  const ballots = elections
    .map((election) => ({
      id: election.id,
      title: election.title,
      type: election.type,
      status: election.status,
      startAt: election.startAt,
      endAt: election.endAt,
      withinWindow: withinWindow(election, now),
      // Voted elections stay in the list, flagged — the student should see that
      // their vote was recorded rather than have the ballot silently vanish.
      votedAlready: votedIn.has(election.id),
    }))
    .sort(ballotOrder);

  return res.status(200).json({ ballots });
}

// ---------------------------------------------------------------------------
// GET /api/me/ballots/:electionId   (STUDENT)
// ---------------------------------------------------------------------------

export async function getMyBallot(req, res) {
  const voter = await loadVoter(req.user.id);

  if (!voter || !voter.isActive) {
    return notFound(res, "User account is no longer available", "USER_NOT_FOUND");
  }

  const election = await prisma.election.findUnique({
    where: { id: req.params.electionId },
    select: ELECTION_SUMMARY,
  });

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  // Checked before anything else is revealed, so another faculty's ballot never
  // leaks through this endpoint.
  if (!isEligible(election, voter.facultyId)) {
    return res.status(403).json({
      error: {
        code: "NOT_ELIGIBLE",
        message: "You are not eligible to vote in this election",
      },
    });
  }

  const now = new Date();

  if (election.status !== ELECTION_STATUS.OPEN) {
    return conflict(
      res,
      `Voting is not open for this election (status ${election.status})`,
      "VOTING_NOT_OPEN"
    );
  }

  if (now < election.startAt) {
    return conflict(res, "Voting has not started yet for this election", "VOTING_NOT_OPEN");
  }

  if (now > election.endAt) {
    return conflict(res, "The voting window for this election has closed", "VOTING_NOT_OPEN");
  }

  const [candidates, receipt] = await Promise.all([
    prisma.candidate.findMany({
      where: { electionId: election.id },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        manifesto: true,
        photoUrl: true,
        user: { select: { name: true } },
      },
    }),
    // Participation only. This tells us THAT they voted, never for whom.
    prisma.voteReceipt.findUnique({
      where: { userId_electionId: { userId: voter.id, electionId: election.id } },
      select: { votedAt: true },
    }),
  ]);

  return res.status(200).json({
    election: {
      id: election.id,
      title: election.title,
      type: election.type,
      status: election.status,
      startAt: election.startAt,
      endAt: election.endAt,
    },
    // Same lean shape as B5: no email, no studentId, no tallies.
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.user.name,
      manifesto: candidate.manifesto,
      photoUrl: candidate.photoUrl,
    })),
    alreadyVoted: Boolean(receipt),
    votedAt: receipt?.votedAt ?? null,
  });
}

// ---------------------------------------------------------------------------
// GET /api/me/voting-status   (STUDENT)
// ---------------------------------------------------------------------------

// The student's own participation history. Built entirely from VoteReceipt:
// electionId, title and votedAt. There is no candidateId here and there never
// will be — see the secrecy note at the top of this file.
export async function getMyVotingStatus(req, res) {
  const receipts = await prisma.voteReceipt.findMany({
    where: { userId: req.user.id },
    orderBy: { votedAt: "desc" },
    select: {
      electionId: true,
      votedAt: true,
      election: { select: { title: true } },
    },
  });

  return res.status(200).json({
    voted: receipts.map((receipt) => ({
      electionId: receipt.electionId,
      title: receipt.election.title,
      votedAt: receipt.votedAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/elections/:electionId/vote   (STUDENT)
// ---------------------------------------------------------------------------

// The chain is inherently serial: every ballot must append to the current tip,
// so concurrent voters contend for one link. Under N simultaneous voters the
// unluckiest may lose up to ~N races before winning, so the ceiling must exceed
// the realistic concurrent-writer count (bounded in practice by the pg pool),
// not the theoretical voter count. 5 was far too low and produced 503s.
const MAX_VOTE_ATTEMPTS = 25;

const castVoteSchema = z.object({
  candidateId: z.string("candidateId is required").trim().min(1, "candidateId is required"),
});

// The chain tip is the one vote in this election whose hash nobody points at.
// Found this way rather than by "most recent", because Vote deliberately has no
// timestamp and no sequence column — the chain IS the ordering. The
// @@unique([electionId, prevHash]) constraint guarantees at most one successor
// per link, so at most one such row can exist.
// Serialize appends to ONE election's chain.
//
// pg_advisory_xact_lock is TRANSACTION-scoped: Postgres releases it on commit or
// rollback, so it can never outlive the transaction. The session-scoped
// pg_advisory_lock would be a trap here — with a pooled connection the lock
// would be returned to the pool still held, and the next borrower of that
// connection would inherit it, freezing voting for that election until restart.
//
// Key derivation: pg_advisory_xact_lock takes a bigint but electionId is a UUID,
// so the id is hashed with hashtextextended(text, 0). It is deterministic and
// stable, so the same election always maps to the same key and different
// elections almost always map to different keys — votes in separate elections
// therefore do NOT serialize against each other. A 64-bit collision between two
// election ids would only cause two elections to share a queue: slower, never
// incorrect.
// $executeRaw, not $queryRaw: pg_advisory_xact_lock() returns void, and the pg
// driver adapter cannot deserialize a void column ("UnsupportedNativeDataType").
// $executeRaw runs the statement without decoding a result set.
async function lockElectionChain(tx, electionId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${electionId}::text, 0))`;
}

async function readChainTip(tx, electionId) {
  const rows = await tx.$queryRaw`
    SELECT v.hash
    FROM votes v
    WHERE v.election_id = ${electionId}
      AND NOT EXISTS (
        SELECT 1 FROM votes w
        WHERE w.election_id = ${electionId} AND w.prev_hash = v.hash
      )
    LIMIT 1
  `;

  return rows[0]?.hash ?? GENESIS_HASH;
}

// Prisma 7 with the pg driver adapter does NOT populate meta.target. The
// constraint details live under meta.driverAdapterError.cause.constraint, as
// either { fields: [...] } or { index: "constraint_name" }. Every known
// location is gathered into one searchable string so classification cannot
// silently fall through — which it did, turning every collision into a 500 and
// leaving the retry loop dead code.
function constraintOf(error) {
  const parts = [];
  const meta = error?.meta ?? {};

  if (meta.target) {
    parts.push(Array.isArray(meta.target) ? meta.target.join(",") : String(meta.target));
  }

  const cause = meta.driverAdapterError?.cause;

  if (cause?.constraint) {
    if (Array.isArray(cause.constraint.fields)) {
      parts.push(cause.constraint.fields.join(","));
    }

    if (cause.constraint.index) {
      parts.push(String(cause.constraint.index));
    }
  }

  if (cause?.originalMessage) {
    parts.push(String(cause.originalMessage));
  }

  // Last resort: the rendered message names the fields too.
  if (error?.message) {
    parts.push(String(error.message));
  }

  return parts.join(" | ");
}

// The receipt's unique(userId, electionId) firing means this student already
// voted. That is a definitive answer, never a race worth retrying.
function isReceiptCollision(error) {
  const constraint = constraintOf(error);

  return (
    error?.code === "P2002" &&
    (constraint.includes("user_id") || constraint.includes("vote_receipt"))
  );
}

// unique(electionId, prevHash) firing means another voter appended to the same
// link first. Our read of the tip is simply stale — re-read and try again.
function isChainRace(error) {
  const constraint = constraintOf(error);

  return (
    error?.code === "P2002" &&
    (constraint.includes("prev_hash") || constraint.includes("hash"))
  );
}

// Serializable isolation aborts one side of a conflicting pair rather than
// letting both commit. Retrying is the prescribed response.
function isSerializationFailure(error) {
  const originalCode = error?.meta?.driverAdapterError?.cause?.originalCode;

  return (
    error?.code === "P2034" ||
    error?.code === "40001" ||
    originalCode === "40001" || // serialization_failure
    originalCode === "40P01" || // deadlock_detected
    /write conflict|deadlock|could not serialize/i.test(error?.message ?? "")
  );
}

// P2028 = "Unable to start a transaction in the given time": the request queued
// for a connection longer than maxWait. NOTHING was executed, so this is always
// safe to retry — and under election-day load it is the most likely failure,
// not a chain race. Left unclassified it surfaced as a 500.
function isTransactionStartTimeout(error) {
  return error?.code === "P2028";
}

const backoff = (attempt) =>
  new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.floor(Math.random() * 25)));

export async function castVote(req, res) {
  const parsed = castVoteSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const { electionId } = req.params;
  const { candidateId } = parsed.data;

  const voter = await loadVoter(req.user.id);

  if (!voter || !voter.isActive) {
    return notFound(res, "User account is no longer available", "USER_NOT_FOUND");
  }

  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: ELECTION_SUMMARY,
  });

  if (!election) {
    return notFound(res, "Election not found", "ELECTION_NOT_FOUND");
  }

  // --- PRE-CHECKS: cheap, definitive rejections before any transaction.

  // 1. Time-bound (design rule 9).
  const now = new Date();

  if (election.status !== ELECTION_STATUS.OPEN) {
    return conflict(
      res,
      `Voting is not open for this election (status ${election.status})`,
      "VOTING_NOT_OPEN"
    );
  }

  if (now < election.startAt) {
    return conflict(res, "Voting has not started yet for this election", "VOTING_NOT_OPEN");
  }

  if (now > election.endAt) {
    return conflict(res, "The voting window for this election has closed", "VOTING_NOT_OPEN");
  }

  // 2. Eligibility, re-checked server-side. The client having shown this ballot
  //    proves nothing — a forged request would bypass the UI entirely.
  if (!isEligible(election, voter.facultyId)) {
    return res.status(403).json({
      error: {
        code: "NOT_ELIGIBLE",
        message: "You are not eligible to vote in this election",
      },
    });
  }

  // 3. The candidate must belong to THIS election, or a voter could cast a
  //    ballot for someone standing in a different race.
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, electionId: true },
  });

  if (!candidate || candidate.electionId !== election.id) {
    return badRequest(
      res,
      "That candidate is not standing in this election",
      "INVALID_CANDIDATE"
    );
  }

  // 4. Courtesy pre-check for a clean error message. The unique constraint
  //    inside the transaction is the actual guarantee (design rule 3).
  const existingReceipt = await prisma.voteReceipt.findUnique({
    where: { userId_electionId: { userId: voter.id, electionId: election.id } },
    select: { votedAt: true },
  });

  if (existingReceipt) {
    return conflict(res, "You have already voted in this election", "ALREADY_VOTED");
  }

  // --- THE ATOMIC VOTE (design rule 2).

  for (let attempt = 1; attempt <= MAX_VOTE_ATTEMPTS; attempt += 1) {
    try {
      const votedAt = await prisma.$transaction(
        async (tx) => {
          // FIRST statement in the transaction: take this election's turn before
          // reading anything. Every voter now appends to a tip that already
          // includes the previous vote, instead of racing for it.
          await lockElectionChain(tx, election.id);

          const prevHash = await readChainTip(tx, election.id);
          const hash = computeVoteHash(prevHash, election.id, candidateId);

          // Participation record: knows WHO voted, never for whom.
          //
          // votedAt is floored to the hour BEFORE it is written. A precise value
          // here would let an insider sort voters by time and align them 1:1
          // with the chain's ballot order. The column has no database default
          // any more, so this value must be supplied explicitly.
          const receipt = await tx.voteReceipt.create({
            data: {
              userId: voter.id,
              electionId: election.id,
              votedAt: floorToHour(),
            },
            select: { votedAt: true },
          });

          // The ballot: knows the CHOICE, never the chooser. No userId column
          // exists on this table and none may ever be added (design rule 1).
          await tx.vote.create({
            data: {
              electionId: election.id,
              candidateId,
              prevHash,
              hash,
            },
          });

          return receipt.votedAt;
        },
        {
          // ReadCommitted, NOT Serializable — and the advisory lock is exactly
          // why. Under Serializable (or RepeatableRead) the transaction's
          // snapshot is taken when its FIRST statement begins executing, which
          // is the lock acquisition itself. The transaction then blocks, and
          // once it finally gets its turn it reads the chain tip through a
          // snapshot taken BEFORE the previous voter committed — so it appends
          // to a stale tip and loses on the unique constraint. Measured: that
          // combination was ~6x slower than no lock at all.
          //
          // Under ReadCommitted each statement takes a fresh snapshot, so the
          // tip read after the wait sees the vote that just committed. The lock
          // provides the mutual exclusion; the isolation level just needs to not
          // hide the result. Correctness still rests on the unique constraints,
          // which are enforced regardless of isolation level.
          isolationLevel: "ReadCommitted",
          // Defaults (2s wait / 5s run) are tuned for uncontended CRUD. Voting
          // is the opposite: a burst of voters queues on a small connection
          // pool for a chain that must be appended one at a time. Waiting is
          // normal here and must not be mistaken for failure.
          maxWait: 20_000,
          timeout: 20_000,
        }
      );

      // B8 — the entire cost this hot path pays for the live dashboard: mark
      // the election dirty. One Set.add. No aggregate, no query, no await, no
      // io lookup, and it cannot throw. The dashboard's aggregate is recomputed
      // by a 5-second timer in the socket layer, on the TIMER's schedule and
      // never on the voter's — 500 votes in 5s cost one aggregate query, not
      // 500. Computing the tally here instead would put two full-table
      // aggregates on the critical path of every ballot, undoing exactly the
      // work B6 did to make voting fast under contention.
      //
      // Fire-and-forget, and that is a hard rule: a socket failure must never
      // slow, fail or roll back a vote. The vote is already committed by the
      // time this line runs; a dashboard that misses a tick catches up on the
      // next one.
      notifyVote(election.id);

      writeAudit({
        actorUserId: voter.id,
        action: AUDIT_ACTIONS.VOTE_CAST,
        entityType: "Election",
        // Entity is the ELECTION, never the Vote: an audit row pointing at a
        // ballot would rejoin the two tables the design keeps apart.
        entityId: election.id,
        // Hour-floored, matching the receipt. The audit table's createdAt is
        // otherwise precise, but a precise VOTE_CAST row would rebuild the very
        // ordering the receipt coarsening just destroyed.
        createdAt: votedAt,
        meta: {
          ...requestContext(req),
          electionId: election.id,
          participation: true,
          // NO candidateId, NO vote id, NO prevHash, NO hash, and no finer-than
          // -hour time signal. Ever.
        },
      });

      return res.status(200).json({
        recorded: true,
        electionId: election.id,
        votedAt,
      });
    } catch (error) {
      // Definitive: the student already has a receipt. Never retry — retrying
      // would just fail again, and the answer is already known.
      if (isReceiptCollision(error)) {
        return conflict(res, "You have already voted in this election", "ALREADY_VOTED");
      }

      // Recoverable: someone else appended to the chain between our read and
      // our write. Re-read the tip and try again.
      if (
        isChainRace(error) ||
        isSerializationFailure(error) ||
        isTransactionStartTimeout(error)
      ) {
        // Contention telemetry. Election id, attempt number and the kind of
        // contention only — never the voter and never the choice, so this can
        // never leak a ballot.
        const kind = isTransactionStartTimeout(error)
          ? "tx-start-timeout"
          : isChainRace(error)
            ? "chain-race"
            : "serialization";

        console.warn(
          `[vote] contention (${kind}) on election ${election.id}: attempt ${attempt} lost, retrying`
        );

        if (attempt === MAX_VOTE_ATTEMPTS) {
          break;
        }

        await backoff(attempt);
        continue;
      }

      throw error;
    }
  }

  // Every attempt lost the race. Nothing was written — the transaction is
  // all-or-nothing, so neither a receipt nor a ballot exists, and the chain is
  // intact. The voter can simply try again.
  console.error(
    `[vote] retries exhausted on election ${election.id} after ${MAX_VOTE_ATTEMPTS} attempts`
  );

  return res.status(503).json({
    error: {
      code: "VOTE_RETRY_EXHAUSTED",
      message: "The system is busy recording votes. Please try again in a moment.",
    },
  });
}
