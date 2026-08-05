import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// THE VOTE HASH CHAIN (design rule 4)
//
// Both the writer (POST /vote) and the verifier (GET /integrity) import the hash
// function from HERE. If the two ever computed it separately they could drift,
// and a drifted verifier would report a healthy election as tampered — or worse,
// a tampered one as healthy.
//
// Nothing in this file touches VoteReceipt or User. A chain is a sequence of
// choices; who made them is deliberately not knowable from it.
// ---------------------------------------------------------------------------

// First link of every election's chain. A sentinel rather than NULL because
// Postgres treats NULLs as distinct, which would let @@unique([electionId,
// prevHash]) admit a second genesis row and fork the chain at its root.
export const GENESIS_HASH = "GENESIS";

export function computeVoteHash(prevHash, electionId, candidateId) {
  return crypto
    .createHash("sha256")
    .update(`${prevHash}${electionId}${candidateId}`)
    .digest("hex");
}

// Walks the chain from GENESIS and reports every way it can be broken:
// a rewritten ballot (hash mismatch), a fork, an orphan, or a gap.
//
// receiptsCount is compared against the number of votes as a cross-check. The
// vote and its receipt are written in one transaction, so the counts must match;
// a divergence means one of the pair was created or removed out of band. Both
// sides are plain COUNTs — no row is ever correlated with another.
export function verifyVoteChain({ electionId, votes, receiptsCount }) {
  const problems = [];
  const bySuccessor = new Map();

  for (const vote of votes) {
    if (bySuccessor.has(vote.prevHash)) {
      problems.push({
        kind: "FORK",
        detail: `Two votes share prevHash ${vote.prevHash.slice(0, 16)}… — the chain branches here`,
        voteId: vote.id,
      });
      continue;
    }

    bySuccessor.set(vote.prevHash, vote);
  }

  const genesisLinks = votes.filter((vote) => vote.prevHash === GENESIS_HASH);

  if (votes.length > 0 && genesisLinks.length !== 1) {
    problems.push({
      kind: "GENESIS",
      detail: `Expected exactly one GENESIS link, found ${genesisLinks.length}`,
    });
  }

  const knownHashes = new Set(votes.map((vote) => vote.hash));

  for (const vote of votes) {
    if (vote.prevHash !== GENESIS_HASH && !knownHashes.has(vote.prevHash)) {
      problems.push({
        kind: "ORPHAN",
        detail: `Vote points at prevHash ${vote.prevHash.slice(0, 16)}…, which is no vote in this election`,
        voteId: vote.id,
      });
    }
  }

  const walk = [];
  const visited = new Set();
  let cursor = GENESIS_HASH;

  while (bySuccessor.has(cursor)) {
    const vote = bySuccessor.get(cursor);

    if (visited.has(vote.id)) {
      problems.push({ kind: "CYCLE", detail: `Chain loops back to vote ${vote.id}`, voteId: vote.id });
      break;
    }

    visited.add(vote.id);
    walk.push(vote);

    const expected = computeVoteHash(vote.prevHash, electionId, vote.candidateId);

    if (expected !== vote.hash) {
      problems.push({
        kind: "HASH_MISMATCH",
        position: walk.length,
        voteId: vote.id,
        detail: `Ballot at chain position ${walk.length} does not match its hash: stored ${vote.hash.slice(0, 16)}… but its contents recompute to ${expected.slice(0, 16)}…`,
      });
    }

    cursor = vote.hash;
  }

  if (walk.length !== votes.length) {
    problems.push({
      kind: "BREAK",
      position: walk.length,
      detail: `Chain walk reached ${walk.length} of ${votes.length} votes — the chain is broken after position ${walk.length}, or votes are unreachable from GENESIS`,
    });
  }

  if (receiptsCount !== undefined && receiptsCount !== votes.length) {
    problems.push({
      kind: "COUNT_DIVERGENCE",
      detail: `${votes.length} ballots but ${receiptsCount} participation receipts — every vote is written with its receipt in one transaction, so these must be equal`,
    });
  }

  return {
    valid: problems.length === 0,
    votesChecked: walk.length,
    votesCount: votes.length,
    ...(receiptsCount !== undefined ? { receiptsCount } : {}),
    problems,
  };
}
