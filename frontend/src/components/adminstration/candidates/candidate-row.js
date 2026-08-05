"use client";

import { FileText, ImageOff, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";

import CandidateAvatar from "@/components/vote/candidate-avatar";

/**
 * One candidate on the roster.
 *
 * THE MANIFESTO IS RENDERED AS TEXT. It is free text typed by an admin, so it
 * is placed as a JSX child — React escapes it — and never through
 * dangerouslySetInnerHTML. `whitespace-pre-wrap` keeps the admin's line breaks
 * without letting any markup through; a manifesto containing "<script>" shows
 * those characters and does nothing else.
 *
 * The photo goes through <CandidateAvatar> (F2): plain <img>, initials on
 * failure. Whether a manifesto and photo are present is called out explicitly,
 * because "no manifesto" is a thing an admin needs to see down a list without
 * opening every row.
 */

export default function CandidateRow({ candidate, canManage, onEdit, onRemove, isBusy = false }) {
  const name = candidate.user?.name ?? "Unknown student";
  const hasManifesto = Boolean(candidate.manifesto?.trim());
  const hasPhoto = Boolean(candidate.photoUrl);

  return (
    <li className="border-line rounded-lg border p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30">
      <div className="flex items-start gap-3">
        <CandidateAvatar name={name} photoUrl={candidate.photoUrl} size={46} />

        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 truncate text-[13.5px] font-semibold">{name}</p>

          <p className="text-muted font-display m-0 mt-0.5 truncate text-xs">
            {candidate.user?.studentId ?? "—"}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Marker present={hasManifesto} icon={FileText} yes="Manifesto" no="No manifesto" />
            <Marker
              present={hasPhoto}
              icon={hasPhoto ? ImageIcon : ImageOff}
              yes="Photo"
              no="No photo"
            />
          </div>
        </div>

        {canManage && (
          <div className="flex flex-none gap-1.5">
            <RowButton
              onClick={onEdit}
              disabled={isBusy}
              label={`Edit ${name}'s manifesto and photo`}
              icon={Pencil}
            />
            <RowButton
              onClick={onRemove}
              disabled={isBusy}
              label={`Remove ${name} from the ballot`}
              icon={Trash2}
              danger
            />
          </div>
        )}
      </div>

      {hasManifesto && (
        <p className="text-muted m-0 mt-2.5 border-l-2 border-indigo-100 pl-3 text-[12.5px] leading-[1.55] whitespace-pre-wrap">
          {candidate.manifesto}
        </p>
      )}
    </li>
  );
}

function Marker({ present, icon: Icon, yes, no }) {
  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1 px-2 py-[3px] text-[11px] font-semibold ${
        present ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <Icon size={12} aria-hidden="true" />
      {present ? yes : no}
    </span>
  );
}

function RowButton({ onClick, disabled, label, icon: Icon, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`border-line grid size-8 cursor-pointer place-items-center rounded-lg border bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "hover:border-error-500/40 hover:bg-error-50 hover:text-error-600 text-slate-500"
          : "text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
