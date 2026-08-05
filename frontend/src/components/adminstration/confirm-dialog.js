"use client";

import { useEffect, useRef } from "react";

import { LoaderCircle } from "lucide-react";

/**
 * The prototype's confirm modal, for actions that change a student's standing.
 *
 * State-changing admin actions are never one click: the dialog restates what is
 * about to happen and what it does to the person, because "deactivate" on a
 * voter roll means "this student cannot sign in or vote" — worth a sentence
 * before it happens.
 *
 * Escape and a backdrop click both cancel, but only while idle: closing the
 * dialog mid-request would hide the outcome of a call that is still in flight.
 */

const TONE = {
  danger: {
    iconWrap: "bg-error-50 text-error-600",
    confirm:
      "bg-error-600 text-white shadow-[0_10px_28px_-8px_rgba(225,29,72,.5)] hover:brightness-105",
  },
  primary: {
    iconWrap: "bg-indigo-50 text-indigo-600",
    confirm: "bg-primary-gradient text-white shadow-glow hover:brightness-105",
  },
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  icon: Icon,
  isPending = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Focus the action, not the page behind it — a keyboard user should not
    // have to hunt for the dialog that just appeared.
    confirmRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape" && !isPending) onCancel();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  const styles = TONE[tone] ?? TONE.danger;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !isPending && onCancel()}
      className="animate-fade-in fixed inset-0 z-[10000] grid place-items-center bg-[#141232]/45 p-5 backdrop-blur-[3px]"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-surface animate-pop w-[min(440px,100%)] rounded-xl p-6 shadow-lg"
      >
        <div className="flex items-start gap-[15px]">
          {Icon && (
            <span className={`grid size-11 flex-none place-items-center rounded-xl ${styles.iconWrap}`}>
              <Icon size={22} aria-hidden="true" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-display text-ink m-0 mb-1.5 text-[18px] font-bold tracking-[-0.01em]"
            >
              {title}
            </h2>
            <div className="text-muted m-0 text-[13.5px] leading-[1.55]">{description}</div>
          </div>
        </div>

        <div className="mt-[22px] flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="cursor-pointer rounded-[10px] border border-slate-200 bg-white px-[18px] py-2.5 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-[18px] py-2.5 text-[13.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${styles.confirm}`}
          >
            {isPending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
            {isPending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
