"use client";

import { useRef } from "react";

import { OTP_LENGTH, sanitizeOtp } from "@/utils/otp";

/**
 * Segmented one-time-code field, styled after the prototype's auth screen.
 *
 * The cell count comes from `length` (default OTP_LENGTH) rather than a literal
 * six, so the code length is one config change and not a rewrite of this file.
 *
 * Phone-first details that matter more than they look:
 *   inputMode="numeric"          — numeric keypad instead of the full keyboard.
 *   autoComplete="one-time-code" — lets the OS offer the code it just saw.
 *   an explicit paste handler    — maxLength=1 truncates a pasted code to its
 *                                  first digit, so paste has to be intercepted
 *                                  and spread across the cells by hand.
 */

export default function OtpInput({
  value,
  onChange,
  length = OTP_LENGTH,
  hasError = false,
  disabled = false,
  autoFocus = false,
}) {
  const inputsRef = useRef([]);

  function focusCell(index) {
    const target = inputsRef.current[Math.max(0, Math.min(length - 1, index))];

    target?.focus();
    target?.select();
  }

  function commit(nextValue, nextFocusIndex) {
    onChange(nextValue.slice(0, length));
    focusCell(nextFocusIndex);
  }

  function handleChange(index, rawValue) {
    const digits = sanitizeOtp(rawValue, length - index);

    // Cell cleared by typing over it with a non-digit.
    if (!digits) {
      commit(value.slice(0, index) + value.slice(index + 1), index);
      return;
    }

    commit(value.slice(0, index) + digits + value.slice(index + digits.length), index + digits.length);
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace") {
      event.preventDefault();

      if (value[index]) {
        commit(value.slice(0, index) + value.slice(index + 1), index);
      } else {
        commit(value.slice(0, index - 1) + value.slice(index), index - 1);
      }

      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(index + 1);
    }
  }

  function handlePaste(index, event) {
    event.preventDefault();

    const pasted = sanitizeOtp(event.clipboardData.getData("text"), length - index);

    if (!pasted) return;

    commit(value.slice(0, index) + pasted, index + pasted.length);
  }

  return (
    <div className="mb-3.5 flex gap-[9px]" role="group" aria-label={`${length}-digit login code`}>
      {Array.from({ length }, (_, index) => {
        const digit = value[index] ?? "";

        return (
          <input
            key={index}
            ref={(node) => {
              inputsRef.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            // Focusing on mount is right here: the whole step exists to collect
            // this one field, and it saves a tap on a phone.
            autoFocus={autoFocus && index === 0}
            maxLength={1}
            disabled={disabled}
            value={digit}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={hasError || undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            className={`font-display text-ink aspect-square w-full rounded-xl border-[1.5px] text-center text-2xl font-bold transition outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:opacity-45 ${
              hasError
                ? "border-error-500 bg-error-50"
                : digit
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-slate-200 bg-slate-50"
            }`}
          />
        );
      })}
    </div>
  );
}
