"use client";

import { Info, X } from "lucide-react";

import { AUDIT_ACTION_GROUPS, AUDIT_ENTITY_TYPES, actionLabel } from "@/utils/audit-labels";
import { AUDIT_PAGE_SIZES } from "@/utils/audit-api";

/**
 * The controls, mapped 1:1 onto GET /audit's query params and onto its RULES —
 * the point being that a filter this screen offers is always a filter the API
 * will accept:
 *
 *   action       — EXACT match, no partial search (the [action, createdAt]
 *                  index needs it that way). A dropdown, therefore, not a text
 *                  box: a typo in a free-text field returns "no entries" rather
 *                  than an error, which reads as "nothing happened".
 *   actorUserId  — exact user id. Free text, because it is a uuid; in practice
 *                  it is filled by clicking the filter icon on a row's actor.
 *   entityType   — exact, case-sensitive, one of four values the backend writes.
 *   entityId     — only ever sent WITH entityType. See below.
 *   from / to    — a range on createdAt, widened to whole local days by the
 *                  caller before it is sent.
 *   limit        — a fixed list. The schema is .max(100) and zod's max rejects
 *                  rather than clamps, so an out-of-range page size is a 400,
 *                  not a quietly trimmed request. A control that cannot express
 *                  101 cannot send it.
 */

const INPUT_CLASS =
  "text-ink w-full rounded-[10px] border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const LABEL_CLASS = "text-muted mb-1.5 block text-[11.5px] font-semibold";

export default function AuditFilters({
  action,
  onActionChange,
  actorUserId,
  onActorUserIdChange,
  entityType,
  onEntityTypeChange,
  entityId,
  onEntityIdChange,
  from,
  onFromChange,
  to,
  onToChange,
  limit,
  onLimitChange,
  hasFilters,
  onClear,
}) {
  return (
    <div className="border-line bg-surface mb-4 rounded-lg border p-4 shadow-xs">
      <div className="grid gap-3 min-[620px]:grid-cols-2 min-[1080px]:grid-cols-4">
        <div className="min-[620px]:col-span-2 min-[1080px]:col-span-1">
          <label htmlFor="audit-action" className={LABEL_CLASS}>
            Action
          </label>

          <select
            id="audit-action"
            value={action}
            onChange={(event) => onActionChange(event.target.value)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="">All actions</option>

            {AUDIT_ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((value) => (
                  <option key={value} value={value}>
                    {actionLabel(value)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-entity-type" className={LABEL_CLASS}>
            Entity type
          </label>

          <select
            id="audit-entity-type"
            value={entityType}
            onChange={(event) => onEntityTypeChange(event.target.value)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="">Any entity</option>

            {AUDIT_ENTITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-entity-id" className={LABEL_CLASS}>
            Entity id
          </label>

          <input
            id="audit-entity-id"
            type="text"
            inputMode="text"
            value={entityId}
            disabled={!entityType}
            onChange={(event) => onEntityIdChange(event.target.value)}
            placeholder={entityType ? `${entityType} id…` : "Pick a type first"}
            aria-describedby="audit-entity-id-hint"
            className={`${INPUT_CLASS} font-mono text-[12px]`}
          />
        </div>

        <div>
          <label htmlFor="audit-actor" className={LABEL_CLASS}>
            Actor user id
          </label>

          <input
            id="audit-actor"
            type="text"
            value={actorUserId}
            onChange={(event) => onActorUserIdChange(event.target.value)}
            placeholder="Or use the filter icon on a row"
            className={`${INPUT_CLASS} font-mono text-[12px]`}
          />
        </div>

        <div>
          <label htmlFor="audit-from" className={LABEL_CLASS}>
            From
          </label>

          <input
            id="audit-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => onFromChange(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="audit-to" className={LABEL_CLASS}>
            To
          </label>

          <input
            id="audit-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => onToChange(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="audit-limit" className={LABEL_CLASS}>
            Entries per page
          </label>

          <select
            id="audit-limit"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            {AUDIT_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onClear}
            disabled={!hasFilters}
            className="border-line bg-surface inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
          >
            <X size={15} aria-hidden="true" />
            Clear filters
          </button>
        </div>
      </div>

      {/*
        The pair rule, explained where it bites rather than only in an error
        message. The backend refuses entityId on its own with a 400 — the
        [entityType, entityId] index is keyed on the type, and the same uuid
        could in principle be written under two different types.
      */}
      <p id="audit-entity-id-hint" className="text-muted mt-3 flex items-start gap-1.5 text-[11.5px] leading-[1.5]">
        <Info size={13} className="mt-px flex-none text-slate-400" aria-hidden="true" />
        <span>
          Entity id only works together with a type — an id on its own is rejected by the API, since
          the index it searches is keyed on the type first. Dates cover whole days in your local
          timezone.
        </span>
      </p>
    </div>
  );
}
