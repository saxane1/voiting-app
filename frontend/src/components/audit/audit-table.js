"use client";

import { Fragment, useState } from "react";

import { ChevronDown } from "lucide-react";

import {
  ActionBadge,
  ActorIdentity,
  EntityRef,
  EntryTimestamp,
  MetadataBody,
  metadataCount,
} from "./audit-entry";

/**
 * The wide view: a real <table>, because this is tabular data and an auditor
 * reads down a column. Newest first — the order the API returns
 * (createdAt DESC, id DESC) is kept exactly as received, never re-sorted here.
 *
 * `id` is the tiebreaker server-side, and for VOTE_CAST rows that share an
 * hour-floored createdAt it is a random uuid. So rows within one hour appear in
 * an arbitrary order, not the order the ballots were cast — which is the point.
 * Nothing on this screen may imply otherwise, so there is no sequence number and
 * no "1st, 2nd, 3rd" column.
 *
 * Recorded detail expands into a SECOND ROW spanning the full table width
 * rather than inside its own cell. A cell is only as wide as its column, and a
 * user-agent string in a 200px column wraps to roughly one character per line —
 * technically correct and completely unreadable.
 */

const COLUMNS = [
  { key: "when", label: "When", width: "w-[190px]" },
  { key: "action", label: "Action", width: "w-[230px]" },
  { key: "actor", label: "Actor", width: "w-[250px]" },
  { key: "entity", label: "Entity", width: "w-[240px]" },
  { key: "detail", label: "Recorded detail", width: "w-[150px]" },
];

export default function AuditTable({ entries, onFilterByActor, onFilterByEntity }) {
  // Which rows are expanded. A Set keyed by audit-row id, so paging to a new
  // result set simply matches nothing and everything collapses.
  const [expanded, setExpanded] = useState(() => new Set());

  function toggle(id) {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Audit log entries, newest first. Ballot entries are timestamped to the hour so that a vote
        cannot be traced back to a voter.
      </caption>

      <thead>
        <tr className="border-line border-b bg-slate-50">
          {COLUMNS.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`text-muted px-4 py-3 text-[11.5px] font-semibold tracking-[0.04em] uppercase ${column.width}`}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {entries.map((entry) => {
          const count = metadataCount(entry.metadata);
          const isOpen = expanded.has(entry.id);

          return (
            // A keyed Fragment: the expanded panel is a sibling <tr>, and any
            // real wrapper element here would break the table's structure.
            <Fragment key={entry.id}>
              <tr
                className={`border-line border-b hover:bg-slate-50/70 ${isOpen ? "bg-slate-50/70" : ""}`}
              >
                <td className="px-4 py-3 align-top">
                  <EntryTimestamp action={entry.action} createdAt={entry.createdAt} />
                </td>

                <td className="px-4 py-3 align-top">
                  <ActionBadge action={entry.action} />
                </td>

                <td className="px-4 py-3 align-top">
                  <ActorIdentity actor={entry.actor} onFilterByActor={onFilterByActor} />
                </td>

                <td className="px-4 py-3 align-top">
                  <EntityRef
                    entityType={entry.entityType}
                    entityId={entry.entityId}
                    onFilterByEntity={onFilterByEntity}
                  />
                </td>

                <td className="px-4 py-3 align-top">
                  {count === 0 ? (
                    <span className="text-muted text-[12px]">None recorded</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(entry.id)}
                      aria-expanded={isOpen}
                      className="text-muted hover:text-ink inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold transition"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                      {isOpen ? "Hide" : "Show"} detail
                      <span className="text-slate-400">({count})</span>
                    </button>
                  )}
                </td>
              </tr>

              {isOpen && (
                <tr className="border-line border-b bg-slate-50/70">
                  <td colSpan={COLUMNS.length} className="px-4 pt-0 pb-3">
                    <MetadataBody metadata={entry.metadata} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
