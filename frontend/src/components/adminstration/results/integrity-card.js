"use client";

import { CircleAlert, LoaderCircle, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";

import { apiErrorMessage } from "@/utils/api-error";

/**
 * The tamper check: verify the Vote hash chain.
 *
 * WHAT IT PROVES, in one line for the admin and in more detail here: every
 * ballot stores `hash = SHA256(prevHash + electionId + candidateId)`, chained
 * from a GENESIS sentinel, so editing, inserting, deleting or reordering any
 * ballot breaks the chain from that point on and is detectable — without ever
 * revealing who cast anything.
 *
 * The endpoint recomputes each link and cross-checks the ballot count against
 * the participation-receipt count. Those two numbers are compared as two
 * integers and in no other way; the tables are never joined (Project-Context
 * §8), so a divergence tells you something was written out of band without
 * telling you anything about a voter.
 *
 * DISPLAY-ONLY. GET /elections/:id/integrity verifies and returns; it mutates
 * no ballot. (It does append an INTEGRITY_CHECKED entry to the audit log — a
 * record that the check ran, which is the point of an audit trail.)
 *
 * ZERO VOTES IS NOT "INTACT". An election with no ballots — including one that
 * was never opened — returns `valid: true` with `votesCount: 0`, because an
 * empty chain has nothing to break. Reporting that as "verified" would be an
 * overclaim, so it gets its own wording.
 *
 * NOTE ON `problems[].voteId`: the API includes the id of the offending Vote
 * row. It is a random UUID with no link to any voter and it is NOT rendered
 * here — the chain position and the explanation locate the break perfectly well
 * for an admin, and this screen holds to "aggregate only" rather than putting a
 * per-ballot identifier on a projector.
 */

export default function IntegrityCard({ report, error, isPending, hasRun, onVerify }) {
  return (
    <section className="border-line bg-surface rounded-lg border p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
          <ShieldCheck size={18} aria-hidden="true" />
        </span>
        <h2 className="text-ink m-0 text-[15px] font-bold">Ballot integrity</h2>
      </div>

      <p className="text-muted m-0 mb-4 text-xs leading-[1.55]">
        Each ballot is hash-chained to the one before it, so any ballot that was altered, inserted,
        removed or reordered breaks the chain and shows up here — without revealing who voted for
        whom.
      </p>

      <button
        type="button"
        onClick={onVerify}
        disabled={isPending}
        className="border-line bg-surface mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <ShieldQuestion size={16} aria-hidden="true" />
        )}
        {isPending ? "Verifying…" : hasRun ? "Verify again" : "Verify hash chain"}
      </button>

      {error && (
        <p
          role="alert"
          className="border-error-500/30 bg-error-50 text-error-700 m-0 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-xs font-medium"
        >
          <CircleAlert size={15} className="mt-px shrink-0" aria-hidden="true" />
          {apiErrorMessage(error, "The integrity check could not be run.")}
        </p>
      )}

      {report && !error && <Report report={report} />}
    </section>
  );
}

function Report({ report }) {
  const { valid, votesChecked, votesCount, receiptsCount, problems = [] } = report;
  const isEmpty = votesCount === 0;

  const tone = isEmpty
    ? { wrap: "border-line bg-slate-50", icon: "text-slate-500", Icon: ShieldQuestion }
    : valid
      ? {
          wrap: "border-success-500/25 bg-success-50",
          icon: "text-success-600",
          Icon: ShieldCheck,
        }
      : { wrap: "border-error-500/30 bg-error-50", icon: "text-error-600", Icon: ShieldX };

  const Icon = tone.Icon;

  return (
    <div role="status" className={`rounded-[10px] border p-3.5 ${tone.wrap}`}>
      <div className="flex items-start gap-2.5">
        <Icon size={19} className={`mt-px shrink-0 ${tone.icon}`} aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 text-[13.5px] font-bold">
            {isEmpty
              ? "No ballots to verify"
              : valid
                ? "Chain intact — no tampering detected"
                : `Chain broken — ${problems.length} ${problems.length === 1 ? "problem" : "problems"} found`}
          </p>

          <p className="text-muted m-0 mt-1 text-[12px] leading-[1.5]">
            {isEmpty ? (
              "This election has no votes yet, so there is no chain to check. An empty chain cannot be broken — this is not a clean bill of health for a ballot box that has been used."
            ) : (
              <>
                {votesChecked.toLocaleString()} of {votesCount.toLocaleString()} ballots walked from
                GENESIS
                {typeof receiptsCount === "number" && (
                  <> · {receiptsCount.toLocaleString()} participation receipts</>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {problems.map((problem, index) => (
            <li
              key={`${problem.kind}-${problem.position ?? index}`}
              className="border-error-500/20 rounded-md border bg-white/70 p-2.5"
            >
              <p className="text-error-700 m-0 flex items-center gap-1.5 text-[11.5px] font-bold tracking-[.03em]">
                {problem.kind}
                {typeof problem.position === "number" && (
                  <span className="text-muted font-semibold">at position {problem.position}</span>
                )}
              </p>
              <p className="text-muted m-0 mt-1 text-[12px] leading-[1.5]">{problem.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
