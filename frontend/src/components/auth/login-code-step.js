"use client";

import { ArrowLeft, ArrowRight, Info, Lock, Mail } from "lucide-react";

import { OTP_LENGTH } from "@/utils/otp";

import AuthNotice from "./auth-notice";
import AuthSubmitButton from "./auth-submit-button";
import OtpInput from "./otp-input";

/**
 * Step B — enter the emailed code.
 *
 * This is also where a student uses an admin-issued fallback code
 * (POST /auth/admin/issue-otp, module F3): it verifies through the same
 * endpoint, so it needs no separate screen.
 */

export default function LoginCodeStep({
  email,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  onChangeEmail,
  isSubmitting,
  isResending,
  cooldownSeconds,
  notice,
}) {
  const canResend = cooldownSeconds <= 0 && !isResending && !isSubmitting;
  const hasError = notice?.tone === "error";

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <button
        type="button"
        onClick={onChangeEmail}
        disabled={isSubmitting}
        className="text-muted hover:text-ink mb-[22px] inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold transition disabled:opacity-60"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Change email
      </button>

      <div className="animate-pop mb-[22px] grid size-[52px] place-items-center rounded-[15px] bg-indigo-50 text-indigo-600 shadow-[inset_0_0_0_1px_var(--color-indigo-100)]">
        <Lock size={26} aria-hidden="true" />
      </div>

      <h1 className="font-display text-ink m-0 mb-2 text-[26px] font-bold tracking-[-0.02em]">
        Enter your code
      </h1>
      <p className="text-muted m-0 mb-2 text-[14.5px] leading-[1.55]">
        We sent a {OTP_LENGTH}-digit code to
      </p>

      <div className="mb-6 inline-flex max-w-full items-center gap-[7px] rounded-pill bg-indigo-50 px-3 py-1.5 text-[13.5px] font-semibold text-indigo-700">
        <Mail size={14} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{email}</span>
      </div>

      <OtpInput
        value={code}
        onChange={onCodeChange}
        hasError={hasError}
        disabled={isSubmitting}
        autoFocus
      />

      {notice && <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice>}

      <AuthSubmitButton
        icon={ArrowRight}
        isLoading={isSubmitting}
        disabled={code.length !== OTP_LENGTH}
      >
        Verify &amp; continue
      </AuthSubmitButton>

      <div className="mt-[18px] flex items-center justify-between gap-3">
        <div className="text-muted flex items-center gap-[7px] text-[12.5px]">
          <Info size={15} className="shrink-0" aria-hidden="true" />
          Check spam if it&apos;s not there
        </div>

        <button
          type="button"
          onClick={onResend}
          disabled={!canResend}
          className={`shrink-0 text-[12.5px] font-bold transition ${
            canResend
              ? "cursor-pointer text-indigo-600 hover:text-indigo-700"
              : "cursor-default text-slate-400"
          }`}
        >
          {resendLabel({ cooldownSeconds, isResending })}
        </button>
      </div>
    </form>
  );
}

function resendLabel({ cooldownSeconds, isResending }) {
  if (isResending) return "Sending…";
  if (cooldownSeconds > 0) return `Resend in ${cooldownSeconds}s`;

  return "Resend code";
}
