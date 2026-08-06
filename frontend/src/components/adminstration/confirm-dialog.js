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
 *
 * IT IS A REAL MODAL, so it behaves like one for a keyboard. `aria-modal` is a
 * promise to assistive technology that the rest of the page is inert, and
 * without a focus trap that promise is false: Tab used to walk straight out of
 * the dialog and into the page behind it, where a user could keep tabbing —
 * still hearing "dialog" — through the very list the pending action is about to
 * change. Focus is also handed back to whatever opened the dialog when it
 * closes, so someone who cancels a deactivation lands back on that student's
 * row rather than at the top of the document.
 *
 * This guards every consequential admin action in the app — deactivating a
 * student, opening, closing or reopening voting, publishing a result — so it is
 * the one component where "keyboard-only" has to mean genuinely usable.
 */

/**
 * Tab-reachable elements, in DOM order. `:not([disabled])` matters more here
 * than usual: both buttons disable while the request is in flight, and a trap
 * that assumed they were always focusable would send focus to a dead element.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(FOCUSABLE));
}

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
  // Starting something (opening voting): consequential but not destructive, and
  // green in the prototype's own lifecycle panel.
  success: {
    iconWrap: "bg-success-50 text-success-600",
    confirm:
      "bg-success-gradient text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,.5)] hover:brightness-105",
  },
  // Irreversible but not destructive — marking a result final. Red would read
  // as "this deletes something", which is exactly the wrong idea to give.
  warning: {
    iconWrap: "bg-warning-50 text-warning-700",
    confirm:
      "bg-warning-500 text-white shadow-[0_10px_28px_-8px_rgba(245,158,11,.5)] hover:brightness-105",
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
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  /**
   * Entry and exit focus. Keyed on `open` ALONE: this effect's cleanup is what
   * restores focus, and a dependency that changes mid-dialog — `isPending` flips
   * the moment the request starts — would tear it down and hand focus back to
   * the trigger while the dialog was still on screen.
   */
  useEffect(() => {
    if (!open) return undefined;

    // Remember who opened us before moving focus away from them.
    triggerRef.current = document.activeElement;

    // Focus the action, not the page behind it — a keyboard user should not
    // have to hunt for the dialog that just appeared.
    confirmRef.current?.focus();

    return () => {
      const trigger = triggerRef.current;

      triggerRef.current = null;

      // `isConnected` because the trigger may not have survived the action —
      // the row holding the button can be gone by the time the dialog closes.
      // Focusing a detached node silently drops focus to <body>, which is the
      // outcome this is here to avoid, so it is better to leave it alone.
      if (trigger?.isConnected && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (!isPending) onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = focusableWithin(panelRef.current);

      // Nothing to move to — both buttons are disabled mid-request. Swallow the
      // key rather than let it escape into the page the dialog is covering.
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Focus got out — most often because the element it was on disabled
      // itself during the request. Pull it back in at the correct end.
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
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
        ref={panelRef}
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
