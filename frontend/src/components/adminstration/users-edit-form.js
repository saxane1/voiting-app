"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { queryKeys } from "@/utils/query-keys";
import { ROLE_LABELS, updateUser } from "@/utils/users-api";

import { Field, inputClass, validateIdentity } from "./users-form";

/**
 * Edit an elevated account's IDENTITY — name and email, and nothing else.
 *
 * There is no role select and no status control here, mirroring the server:
 * PATCH /api/users/:id refuses role, isRoot and isActive outright
 * (400 FIELD_NOT_EDITABLE) rather than ignoring them. Activation lives on the
 * row's own Deactivate/Reactivate button, which is where the root, self and
 * last-admin guards apply.
 *
 * THE ROOT ACCOUNT IS EDITABLE HERE, deliberately. "Root" means it can never be
 * deactivated, not that it is frozen — and since the email is the only way to
 * sign in as it, being unable to correct a typo in that address would be the
 * more dangerous rule.
 *
 * Changing the email sends a notification to the NEW address. If that send
 * fails the edit still stands, and the failure is handed up as a non-blocking
 * notice — same contract as creation (B3b §6).
 */

export default function UsersEditForm({ user, onCancel, onSaved }) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState({ name: user.name, email: user.email });
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (payload) => updateUser(user.id, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });

      if (result.changed === false) {
        toast.success("No changes to save");
      } else {
        toast.success(`${result.user.name} updated`);
      }

      // `notification` is present only when an email change triggered a send, so
      // a name-only edit can never raise a mail warning about nothing.
      onSaved?.(result);
    },
    onError: (error) => {
      const code = apiErrorCode(error);

      if (code === "EMAIL_ALREADY_EXISTS") {
        setErrors({ email: apiErrorMessage(error, "That email is already in use") });
        return;
      }

      const details = error?.response?.data?.error?.details;

      if (code === "VALIDATION_ERROR" && Array.isArray(details)) {
        const mapped = {};

        for (const issue of details) {
          if (issue.path) mapped[issue.path] = issue.message;
        }

        setErrors(mapped);
        return;
      }

      toast.error(apiErrorMessage(error, "The account could not be updated. Please try again."));
    },
  });

  function change(field) {
    return (event) => {
      const { value } = event.target;

      setValues((current) => ({ ...current, [field]: value }));

      setErrors((current) => {
        if (!current[field]) return current;

        const next = { ...current };
        delete next[field];

        return next;
      });
    };
  }

  function submit(event) {
    event.preventDefault();

    const found = validateIdentity(values);

    setErrors(found);

    if (Object.keys(found).length > 0) return;

    const name = values.name.trim();
    const email = values.email.trim().toLowerCase();

    // Send only what actually moved. The server treats an unchanged address as
    // no change anyway, but not sending it keeps the request honest about intent
    // and avoids a pointless uniqueness lookup.
    const payload = {
      ...(name !== user.name ? { name } : {}),
      ...(email !== user.email ? { email } : {}),
    };

    if (Object.keys(payload).length === 0) {
      toast.success("No changes to save");
      onCancel?.();
      return;
    }

    mutation.mutate(payload);
  }

  const disabled = mutation.isPending;
  const emailWillChange = values.email.trim().toLowerCase() !== user.email;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-line bg-surface mb-5 rounded-lg border p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Pencil size={18} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="font-display text-ink m-0 text-[15px] font-bold">
            Edit {ROLE_LABELS[user.role]?.toLowerCase() ?? "account"}
          </h2>
          <p className="text-muted m-0 mt-0.5 text-[12.5px]">
            Name and email only. Role and status are changed elsewhere.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 min-[560px]:grid-cols-2">
        <Field label="Full name" htmlFor="edit-user-name" error={errors.name}>
          <input
            id="edit-user-name"
            name="name"
            type="text"
            autoComplete="off"
            disabled={disabled}
            value={values.name}
            onChange={change("name")}
            aria-invalid={Boolean(errors.name)}
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="Email" htmlFor="edit-user-email" error={errors.email}>
          <input
            id="edit-user-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            value={values.email}
            onChange={change("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={emailWillChange ? "edit-user-email-hint" : undefined}
            className={inputClass(errors.email)}
          />
        </Field>
      </div>

      {emailWillChange && (
        <p
          id="edit-user-email-hint"
          className="text-muted mb-5 flex items-start gap-1.5 text-xs leading-[1.5]"
        >
          <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
          This is their login identity — after saving they sign in with the new address, and it is
          notified by email.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="cursor-pointer rounded-[10px] border border-slate-200 bg-white px-[18px] py-2.5 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={disabled}
          className="bg-primary-gradient shadow-glow inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-[18px] py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {disabled && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          {disabled ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
