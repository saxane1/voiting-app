"use client";

import { Inbox, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";

import { apiErrorMessage, isNetworkError } from "@/utils/api-error";

/**
 * Loading / error / empty states shared by the voter screens.
 *
 * A weak connection is the norm, not the exception, so a failed fetch always
 * offers an explicit retry rather than leaving a dead screen.
 */

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <LoaderCircle size={30} className="animate-spin text-indigo-600" aria-hidden="true" />
    </div>
  );
}

export function ErrorState({ error, onRetry, isRetrying = false }) {
  const offline = isNetworkError(error);

  return (
    <div className="animate-fade-up py-8 text-center" role="alert">
      <div className="mx-auto mb-4 grid size-[64px] place-items-center rounded-[20px] bg-error-50 text-error-600">
        <TriangleAlert size={30} aria-hidden="true" />
      </div>

      <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">
        {offline ? "You appear to be offline" : "Something went wrong"}
      </h2>

      <p className="text-muted mx-auto mb-5 max-w-[300px] text-[13.5px] leading-[1.5]">
        {offline
          ? "We couldn't reach the voting service. Check your connection and try again."
          : apiErrorMessage(error, "We couldn't load this right now. Please try again.")}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-[22px] py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isRetrying ? "animate-spin" : ""} aria-hidden="true" />
          {isRetrying ? "Retrying…" : "Try again"}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="animate-fade-up py-10 text-center">
      <div className="mx-auto mb-4 grid size-[64px] place-items-center rounded-[20px] bg-slate-100 text-slate-400">
        <Inbox size={30} aria-hidden="true" />
      </div>

      <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">{title}</h2>
      <p className="text-muted mx-auto max-w-[300px] text-[13.5px] leading-[1.5]">{children}</p>
    </div>
  );
}
