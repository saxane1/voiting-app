import { ELECTION_STATUS, electionStatusAdminLabel } from "@/utils/election-labels";

/**
 * The lifecycle status, as the server reports it.
 *
 * OPEN is the only one that pulses: it is the only status where something is
 * happening right now — students are casting ballots — and it is the one an
 * admin scanning the list must never misread.
 */

const TONE = {
  [ELECTION_STATUS.DRAFT]: "bg-slate-100 text-slate-600",
  [ELECTION_STATUS.SCHEDULED]: "bg-indigo-50 text-indigo-700",
  [ELECTION_STATUS.OPEN]: "bg-success-50 text-success-700",
  [ELECTION_STATUS.CLOSED]: "bg-warning-50 text-warning-700",
  [ELECTION_STATUS.PUBLISHED]: "bg-indigo-100 text-indigo-800",
};

export default function ElectionStatusBadge({ status, size = "sm" }) {
  const isOpen = status === ELECTION_STATUS.OPEN;

  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1.5 font-bold whitespace-nowrap ${
        size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-1 text-[11.5px]"
      } ${TONE[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      <span
        className={`size-1.5 rounded-full bg-current ${isOpen ? "motion-safe:animate-pulse-dot" : ""}`}
        aria-hidden="true"
      />
      {electionStatusAdminLabel(status)}
    </span>
  );
}
