
"use client";

import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  Filter,
  Info,
  RotateCcw,
  Search,
  User,
  X,
  Database,
  Tag,
} from "lucide-react";

import { AUDIT_ACTION_GROUPS, AUDIT_ENTITY_TYPES, actionLabel } from "@/utils/audit-labels";
import { AUDIT_PAGE_SIZES } from "@/utils/audit-api";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const LABEL_CLASS = "mb-1 block text-[11px] font-medium tracking-wide text-slate-500 uppercase";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Count active filters (excluding default limit)
  const activeFilterCount = [action, actorUserId, entityType, entityId, from, to].filter(Boolean).length;

  return (
    <div className="mb-4 rounded-xl border border-slate-200/80 bg-white shadow-xs transition-all">
      {/* Top Bar: Primary Controls & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3">
        {/* Quick Search / Primary Filters Group */}
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
          {/* Quick Filter: Action */}
          <div className="relative min-w-[160px] flex-1 sm:max-w-[220px]">
            <select
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              className={`${INPUT_CLASS} appearance-none pr-8 cursor-pointer font-medium text-slate-700`}
            >
              <option value="">All Actions</option>
              {AUDIT_ACTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.actions.map((val) => (
                    <option key={val} value={val}>
                      {actionLabel(val)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Quick Filter: Entity Type */}
          <div className="relative min-w-[140px] flex-1 sm:max-w-[180px]">
            <select
              value={entityType}
              onChange={(e) => onEntityTypeChange(e.target.value)}
              className={`${INPUT_CLASS} appearance-none pr-8 cursor-pointer font-medium text-slate-700`}
            >
              <option value="">All Entities</option>
              {AUDIT_ENTITY_TYPES.map((val) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Toggle Advanced Filters */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition cursor-pointer ${
              isExpanded || activeFilterCount > 0
                ? "border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-50"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Filter size={14} className={activeFilterCount > 0 ? "text-indigo-600" : "text-slate-400"} />
            <span>More Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
          </button>

          {/* Clear All Button */}
          {hasFilters && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          )}
        </div>

        {/* Page Limit Dropdown */}
        <div className="flex items-center gap-2 border-l border-slate-100 pl-3">
          <span className="text-[12px] font-medium text-slate-400 hidden sm:inline">Per page:</span>
          <div className="relative">
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="appearance-none rounded-md border border-slate-200 bg-slate-50/50 py-1 pl-2.5 pr-7 text-[12.5px] font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-500 cursor-pointer"
            >
              {AUDIT_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Active Filter Chips Bar (Visible when filters applied) */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/40 px-3 py-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Active:</span>

          {action && (
            <FilterChip
              label={`Action: ${actionLabel(action)}`}
              onRemove={() => onActionChange("")}
            />
          )}

          {entityType && (
            <FilterChip
              label={`Type: ${entityType}`}
              onRemove={() => onEntityTypeChange("")}
            />
          )}

          {entityId && (
            <FilterChip
              label={`Entity ID: ${entityId}`}
              onRemove={() => onEntityIdChange("")}
            />
          )}

          {actorUserId && (
            <FilterChip
              label={`Actor: ${actorUserId}`}
              onRemove={() => onActorUserIdChange("")}
            />
          )}

          {(from || to) && (
            <FilterChip
              label={`Date: ${from || "Beginning"} → ${to || "Today"}`}
              onRemove={() => {
                onFromChange("");
                onToChange("");
              }}
            />
          )}
        </div>
      )}

      {/* Expandable Advanced Filters Drawer */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/30 p-4 transition-all">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Actor User ID Input */}
            <div>
              <label htmlFor="audit-actor" className={LABEL_CLASS}>
                Actor User ID
              </label>
              <div className="relative">
                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="audit-actor"
                  type="text"
                  value={actorUserId}
                  onChange={(e) => onActorUserIdChange(e.target.value)}
                  placeholder="Filter by Actor UUID…"
                  className={`${INPUT_CLASS} pl-8 font-mono text-[12px]`}
                />
              </div>
            </div>

            {/* Entity ID Input + Tooltip */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="audit-entity-id" className={LABEL_CLASS}>
                  Entity ID
                </label>
                <div className="relative mb-1">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    className="text-slate-400 hover:text-slate-600 transition"
                  >
                    <Info size={13} />
                  </button>

                  {/* Contextual Tooltip */}
                  {showTooltip && (
                    <div className="absolute right-0 bottom-full mb-1.5 w-64 rounded-lg bg-slate-900 p-2.5 text-[11px] leading-snug text-slate-200 shadow-xl z-20">
                      Entity ID requires picking an Entity Type first (index requirement).
                    </div>
                  )}
                </div>
              </div>
              <div className="relative">
                <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="audit-entity-id"
                  type="text"
                  value={entityId}
                  disabled={!entityType}
                  onChange={(e) => onEntityIdChange(e.target.value)}
                  placeholder={entityType ? `${entityType} ID…` : "Select entity type first"}
                  className={`${INPUT_CLASS} pl-8 font-mono text-[12px]`}
                />
              </div>
            </div>

            {/* Date From */}
            <div>
              <label htmlFor="audit-from" className={LABEL_CLASS}>
                From Date
              </label>
              <div className="relative">
                <input
                  id="audit-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => onFromChange(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {/* Date To */}
            <div>
              <label htmlFor="audit-to" className={LABEL_CLASS}>
                To Date
              </label>
              <div className="relative">
                <input
                  id="audit-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => onToChange(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dismissible Active Filter Badge
 */
function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-slate-700 shadow-2xs">
      <span className="max-w-[180px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
      >
        <X size={12} />
      </button>
    </span>
  );
}