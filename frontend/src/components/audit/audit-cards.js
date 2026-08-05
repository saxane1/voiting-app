"use client";

import {
  ActionBadge,
  ActorIdentity,
  EntityRef,
  EntryTimestamp,
  MetadataDisclosure,
} from "./audit-entry";

/**
 * The narrow view. A five-column table on a phone is a horizontal-scroll trap,
 * so below the breakpoint each entry becomes a card carrying exactly the same
 * five facts, stacked in reading order: when, what, who, on what, and the
 * recorded detail.
 *
 * Same list, same order, same components as the table — only the arrangement
 * differs, so there is no second implementation to keep in step.
 */

export default function AuditCards({ entries, onFilterByActor, onFilterByEntity }) {
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="border-line bg-surface rounded-lg border p-3.5 shadow-xs"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <ActionBadge action={entry.action} />
            <EntryTimestamp action={entry.action} createdAt={entry.createdAt} />
          </div>

          <div className="border-line mt-3 border-t pt-3">
            <ActorIdentity actor={entry.actor} onFilterByActor={onFilterByActor} />
          </div>

          {(entry.entityType || entry.entityId) && (
            <div className="mt-2.5">
              <span className="text-muted mb-1 block text-[10.5px] font-semibold tracking-[0.04em] uppercase">
                Entity
              </span>
              <EntityRef
                entityType={entry.entityType}
                entityId={entry.entityId}
                onFilterByEntity={onFilterByEntity}
              />
            </div>
          )}

          <div className="border-line mt-3 border-t pt-2.5">
            <MetadataDisclosure metadata={entry.metadata} />
          </div>
        </li>
      ))}
    </ul>
  );
}
