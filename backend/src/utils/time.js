// ---------------------------------------------------------------------------
// BALLOT-SECRECY TIME COARSENING
//
// The hash chain imposes a strict total order on ballots (design rule 4). That
// order is fine on its own — Vote carries no timestamp and no voter. The danger
// is a PRECISE per-voter timestamp stored ANYWHERE else: sort voters by that
// timestamp, walk the chain from GENESIS, and the k-th voter aligns 1:1 with the
// k-th ballot. A full-DB insider would then know how everyone voted.
//
// So every per-vote timestamp is floored to the hour AT WRITE TIME. Coarsening
// at display time would be useless — the precise value would still sit in the
// database, which is exactly where the attacker is.
//
// Resolution is ONE HOUR, chosen over one day so B8 can still plot a turnout
// curve. The accepted residual: ordering still survives ACROSS hours, so the
// anonymity set is "everyone who voted in the same hour" rather than the whole
// electorate. Document that limitation; do not silently assume it away.
//
// Truncation is in UTC. Prisma stores DateTime as TIMESTAMP(3) without a zone
// and JS Date is epoch-based, so UTC is the only consistent choice — matching
// Postgres date_trunc('hour', ...) on the same stored values.
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 3_600_000;

export function floorToHour(date = new Date()) {
  return new Date(Math.floor(date.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);
}
