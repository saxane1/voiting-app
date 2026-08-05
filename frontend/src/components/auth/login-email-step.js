"use client";

import { ArrowRight, Lock, Mail } from "lucide-react";

import AuthNotice from "./auth-notice";
import AuthSubmitButton from "./auth-submit-button";

/**
 * Step A — collect the university email and ask the backend to send a code.
 *
 * The copy is deliberately enumeration-neutral: the backend answers every
 * request-otp with the same 200 whether or not the address is registered, and
 * this screen must not undo that by saying anything more specific.
 */

export default function LoginEmailStep({ email, onEmailChange, onSubmit, isSubmitting, notice }) {
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-[22px] grid size-[52px] place-items-center rounded-[15px] bg-indigo-50 text-indigo-600 shadow-[inset_0_0_0_1px_var(--color-indigo-100)]">
        <Mail size={26} aria-hidden="true" />
      </div>

      <h1 className="font-display text-ink m-0 mb-2 text-[26px] font-bold tracking-[-0.02em]">
        Sign in to vote
      </h1>
      <p className="text-muted m-0 mb-[26px] text-[14.5px] leading-[1.55]">
        Enter your university email. We&apos;ll send a one-time code — no password needed.
      </p>

      <label htmlFor="login-email" className="mb-[7px] block text-[13px] font-semibold text-slate-700">
        University email
      </label>

      <div className="relative mb-[18px]">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400">
          <Mail size={18} aria-hidden="true" />
        </span>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isSubmitting}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="yourname@psu.edu.so"
          className="text-ink w-full rounded-md border-[1.5px] border-slate-200 bg-slate-50 py-3.5 pr-3.5 pl-[42px] text-[15px] transition outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {notice && <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice>}

      <AuthSubmitButton icon={ArrowRight} isLoading={isSubmitting} disabled={!email.trim()}>
        Send one-time code
      </AuthSubmitButton>

      <div className="text-muted mt-5 flex items-center justify-center gap-2 text-xs">
        <Lock size={14} aria-hidden="true" />
        Secured by PSU Election Commission
      </div>
    </form>
  );
}
