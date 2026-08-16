"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import toast from "react-hot-toast";

import { apiErrorCode, apiErrorMessage } from "@/utils/api-error";
import { queryKeys } from "@/utils/query-keys";
import { createUser, ELEVATED_ROLES, ROLE_HINTS, ROLE_LABELS } from "@/utils/users-api";

/**
 * Create an ADMIN or AUDITOR account (B3b §4).
 *
 * THERE IS NO PASSWORD FIELD, AND THAT IS NOT AN OVERSIGHT. Authentication is
 * passwordless: the account is an email plus a role, and the holder signs in
 * through the ordinary OTP flow. Nothing is provisioned here that could leak.
 *
 * Validation is duplicated from the server, not replaced — `validate` below
 * mirrors the zod schema in adminstration-controllers.js so an empty name is
 * caught without a round trip, while the server stays the authority. Anything
 * only the server can know (that an email is already taken, by a student or by
 * another admin) comes back as a 409 and is placed on the same field.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY = { email: "", name: "", role: "ADMIN" };

/**
 * The two identity fields, shared with the edit form — which can change exactly
 * these and nothing else, so the create and edit screens cannot drift on what a
 * valid name or address is.
 */
export function validateIdentity(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = "name is required";
  } else if (values.name.trim().length > 150) {
    errors.name = "name must be 150 characters or fewer";
  }

  if (!values.email.trim()) {
    errors.email = "A valid email address is required";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "A valid email address is required";
  }

  return errors;
}

export function validate(values) {
  const errors = validateIdentity(values);

  // Role is create-only: the server refuses to change it on an existing account
  // (FIELD_NOT_EDITABLE), so the edit form does not offer it and does not
  // validate it.
  if (!ELEVATED_ROLES.includes(values.role)) {
    errors.role = 'role must be either "ADMIN" or "AUDITOR"';
  }

  return errors;
}

export default function UsersForm({ onCancel, onCreated }) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });

      const label = ROLE_LABELS[result.user.role] ?? result.user.role;

      toast.success(`${label} account created for ${result.user.name}`);

      // The account exists either way. Whether the notification actually went
      // out is a SEPARATE outcome, handed up so the page can show a standing
      // notice — a failed email is something the admin has to act on, not a
      // failed request. See B3b §6.
      onCreated?.(result);

      setValues(EMPTY);
      setErrors({});
    },
    onError: (error) => {
      const code = apiErrorCode(error);

      // Email uniqueness is global — it may collide with another admin OR with
      // a student, and the server refuses either way rather than promoting the
      // student. Both land on the email field, where the fix is.
      if (code === "EMAIL_ALREADY_EXISTS") {
        setErrors({ email: apiErrorMessage(error, "That email is already in use") });
        return;
      }

      // The server's field-level detail, mapped back onto the inputs.
      const details = error?.response?.data?.error?.details;

      if (code === "VALIDATION_ERROR" && Array.isArray(details)) {
        const mapped = {};

        for (const issue of details) {
          if (issue.path) mapped[issue.path] = issue.message;
        }

        setErrors(mapped);
        return;
      }

      toast.error(apiErrorMessage(error, "The account could not be created. Please try again."));
    },
  });

  function change(field) {
    return (event) => {
      const { value } = event.target;

      setValues((current) => ({ ...current, [field]: value }));

      // Clear only this field's error as it is edited: keeping the others means
      // a submit that failed on two fields does not look half-fixed.
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

    const found = validate(values);

    setErrors(found);

    if (Object.keys(found).length > 0) return;

    mutation.mutate({
      // Trimmed and lowercased exactly as the backend normalises before storing,
      // so what is shown in the table matches what was sent.
      email: values.email.trim().toLowerCase(),
      name: values.name.trim(),
      role: values.role,
    });
  }

  const disabled = mutation.isPending;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-line bg-surface mb-5 rounded-lg border p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <UserPlus size={20} aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="font-display text-ink m-0 text-[15px] font-bold">New elevated account</h2>
          <p className="text-muted m-0 mt-0.5 text-[12.5px]">
            No password is set. They sign in with this email and a one-time code.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 min-[560px]:grid-cols-2">
        <Field label="Full name" htmlFor="user-name" error={errors.name}>
          <input
            id="user-name"
            name="name"
            type="text"
            autoComplete="off"
            disabled={disabled}
            value={values.name}
            onChange={change("name")}
            placeholder="First Middle Last"
            aria-invalid={Boolean(errors.name)}
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="Email" htmlFor="user-email" error={errors.email}>
          <input
            id="user-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            value={values.email}
            onChange={change("email")}
            placeholder="name@psu.edu.so"
            aria-invalid={Boolean(errors.email)}
            className={inputClass(errors.email)}
          />
        </Field>
      </div>

      <div className="mb-5">
        <Field label="Role" htmlFor="user-role" error={errors.role}>
          <select
            id="user-role"
            name="role"
            disabled={disabled}
            value={values.role}
            onChange={change("role")}
            aria-invalid={Boolean(errors.role)}
            aria-describedby="user-role-hint"
            className={`${inputClass(errors.role)} cursor-pointer`}
          >
            {ELEVATED_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>

          <p
            id="user-role-hint"
            className="text-muted mt-1.5 flex items-start gap-1.5 text-xs leading-[1.5]"
          >
            <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
            {ROLE_HINTS[values.role]}
          </p>
        </Field>
      </div>

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
          {disabled ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}

/** Shared with users-edit-form.js so the two forms look like one screen. */
export function inputClass(hasError) {
  return `text-ink w-full rounded-[10px] border-[1.5px] px-3.5 py-3 text-sm outline-none transition disabled:opacity-60 ${
    hasError
      ? "border-error-500 bg-error-50/40 focus:ring-[3px] focus:ring-error-500/15"
      : "border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white focus:ring-[3px] focus:ring-indigo-100"
  }`;
}

export function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-[7px] block text-[13px] font-semibold text-slate-700">
        {label}
      </label>

      {children}

      {error && (
        <p
          role="alert"
          className="text-error-700 mt-1.5 flex items-start gap-1.5 text-xs font-medium"
        >
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
