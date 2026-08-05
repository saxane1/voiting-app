"use client";

import { Clock, Cpu, Filter, Info, ShieldAlert } from "lucide-react";

import { formatHourBucket, formatPreciseTimestamp } from "@/utils/format-date";
import { ACTION_TONE, actionLabel, actionTone, isHourFloored, isKnownAction } from "@/utils/audit-labels";
import { readAuditMetadata } from "@/utils/audit-metadata";
import { initialsOf } from "@/utils/initials";

/**
 * The pieces one audit row is made of, shared by the wide table and the narrow
 * card list so the two views can never disagree about what a row says.
 */

const TONE_CLASS = {
  [ACTION_TONE.DANGER]: "border-error-500/25 bg-error-50 text-error-700",
  [ACTION_TONE.WARN]: "border-warning-500/30 bg-warning-50 text-warning-700",
  [ACTION_TONE.SUCCESS]: "border-success-500/25 bg-success-50 text-success-700",
  [ACTION_TONE.INFO]: "border-indigo-200 bg-indigo-50 text-indigo-700",
  [ACTION_TONE.NEUTRAL]: "border-slate-200 bg-slate-100 text-slate-600",
};

export function ActionBadge({ action }) {
  const tone = actionTone(action);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded-pill inline-flex items-center border px-2.5 py-1 text-[11.5px] font-semibold ${TONE_CLASS[tone]}`}
      >
        {actionLabel(action)}
      </span>

      {/*
        The backend accepts any string as an action so that rows written by an
        older build stay filterable. If one arrives that this build has no label
        for, say so rather than passing off a guessed label as a real one.
      */}
      {!isKnownAction(action) && (
        <span
          title={`Stored as ${action}`}
          className="rounded-pill inline-flex items-center gap-1 border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-500"
        >
          <Info size={11} aria-hidden="true" />
          unrecognised
        </span>
      )}
    </span>
  );
}

/**
 * When the row's time is a bucket rather than a moment, say so on the row.
 *
 * A VOTE_CAST timestamp always lands on the hour and an auditor who does not
 * know why will read it as a broken clock. The marker turns that from a bug
 * report into the design decision it is.
 */
export function EntryTimestamp({ action, createdAt }) {
  const floored = isHourFloored(action);

  return (
    <span className="inline-flex flex-col gap-1">
      <time dateTime={createdAt} className="text-ink text-[12.5px] font-semibold">
        {floored ? formatHourBucket(createdAt) : formatPreciseTimestamp(createdAt)}
      </time>

      {floored && (
        <span
          title="Ballot times are stored to the hour on purpose. A precise time could be lined up against the ballot chain to work out who voted for whom, so the exact minute is never recorded."
          className="rounded-pill inline-flex w-fit items-center gap-1 border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-600"
        >
          <Clock size={10} aria-hidden="true" />
          to the hour
        </span>
      )}
    </span>
  );
}

/**
 * Who acted. `actor` is never null — the controller substitutes a named
 * "System / anonymous" actor for rows with no resolvable user, so an
 * OTP_REQUESTED_UNKNOWN_EMAIL row reads as a real event rather than a blank
 * cell that looks like missing data.
 */
export function ActorIdentity({ actor, onFilterByActor }) {
  const isSystem = actor?.isSystem !== false;
  const name = actor?.name || "System / anonymous";

  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`font-display grid size-8 flex-none place-items-center rounded-[9px] text-[11px] font-bold ${
          isSystem
            ? "border border-slate-200 bg-slate-100 text-slate-500"
            : "bg-brand-gradient text-white"
        }`}
      >
        {isSystem ? <Cpu size={15} /> : initialsOf(name)}
      </span>

      <span className="min-w-0">
        <span className="text-ink block truncate text-[12.5px] font-semibold">{name}</span>

        <span className="text-muted block truncate text-[11px]">
          {isSystem ? "no signed-in user" : actor.email}
          {!isSystem && actor.role ? ` · ${actor.role.toLowerCase()}` : ""}
        </span>
      </span>

      {/*
        An actorUserId is a uuid nobody types from memory, so the row itself is
        the way to filter by a person. Only offered when there IS a user: a
        system row has no id to filter on.
      */}
      {!isSystem && actor.id && onFilterByActor && (
        <button
          type="button"
          onClick={() => onFilterByActor(actor.id)}
          title={`Show only entries by ${name}`}
          aria-label={`Show only entries by ${name}`}
          className="ml-auto grid size-7 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
        >
          <Filter size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** What was acted upon. Both columns are nullable — plenty of rows have neither. */
export function EntityRef({ entityType, entityId, onFilterByEntity }) {
  if (!entityType && !entityId) {
    return <span className="text-muted text-[12px]">—</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0">
        <span className="text-ink block text-[12.5px] font-semibold">{entityType || "—"}</span>

        {entityId && (
          <span
            title={entityId}
            className="text-muted block truncate font-mono text-[11px]"
          >
            {entityId}
          </span>
        )}
      </span>

      {entityType && entityId && onFilterByEntity && (
        <button
          type="button"
          onClick={() => onFilterByEntity(entityType, entityId)}
          title={`Show only entries about this ${entityType.toLowerCase()}`}
          aria-label={`Show only entries about this ${entityType.toLowerCase()}`}
          className="ml-auto grid size-7 flex-none cursor-pointer place-items-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
        >
          <Filter size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** How much recorded context a row has, for the toggle that reveals it. */
export function metadataCount(metadata) {
  const { entries, withheld } = readAuditMetadata(metadata);

  return entries.length + withheld.length;
}

/**
 * The collapsed-by-default disclosure used by the CARD view, where the panel
 * gets the full width of the card. The table cannot use this: a table cell is
 * only as wide as its column, and a user-agent string rendered in a 130px
 * column wraps to one character per line. The table therefore drives its own
 * toggle and puts <MetadataBody> in a full-width row of its own.
 */
export function MetadataDisclosure({ metadata }) {
  const count = metadataCount(metadata);

  if (count === 0) {
    return <span className="text-muted text-[12px]">No further detail recorded.</span>;
  }

  return (
    <details className="group">
      <summary className="text-muted hover:text-ink inline-flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold transition">
        <span className="group-open:hidden">Show detail</span>
        <span className="hidden group-open:inline">Hide detail</span>
        <span className="text-slate-400">({count})</span>
      </summary>

      <MetadataBody metadata={metadata} />
    </details>
  );
}

/**
 * The recorded context, exactly as stored — minus anything the secrecy screen
 * in utils/audit-metadata.js refuses to render, which on a healthy backend is
 * nothing at all.
 *
 * Collapsed by default wherever it is used: `{ ip, userAgent }` on several
 * hundred rows is noise until the one row you care about, and then it is the
 * whole point.
 */
export function MetadataBody({ metadata }) {
  const { entries, withheld } = readAuditMetadata(metadata);

  return (
    <>
      {withheld.length > 0 && (
        <p
          role="alert"
          className="border-error-500/25 bg-error-50 text-error-700 mt-2 flex items-start gap-2 rounded-md border p-2.5 text-[11.5px] leading-[1.5]"
        >
          <ShieldAlert size={14} className="mt-px flex-none" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Withheld:</strong> this row carried{" "}
            <code className="font-mono">{withheld.join(", ")}</code>, which could link a voter to a
            choice. The value was not rendered. Report this — an audit row should never contain it.
          </span>
        </p>
      )}

      {entries.length > 0 && (
        <dl className="mt-2 grid gap-1.5 rounded-md bg-slate-50 p-2.5">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="grid gap-0.5 min-[520px]:grid-cols-[140px_minmax(0,1fr)] min-[520px]:gap-3"
            >
              <dt className="text-muted text-[11.5px] font-semibold">{entry.label}</dt>
              {/* A user-agent string has no useful break points; break it anywhere
                  rather than letting it push the panel sideways. */}
              <dd className="text-ink m-0 min-w-0 text-[11.5px] [overflow-wrap:anywhere]">
                {entry.isBlock ? (
                  <pre className="m-0 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap">
                    {entry.value}
                  </pre>
                ) : (
                  entry.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
