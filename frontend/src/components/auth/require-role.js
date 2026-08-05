"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { AUTH_STATUS, useAuth } from "@/context/auth-context";

/**
 * Client-side route guard.
 *
 * Guards are deliberately CLIENT-side. The refresh cookie is httpOnly and set
 * by the backend on a different origin, so Next's proxy/middleware layer cannot
 * read it and has nothing to authorize against. The server-side authority is
 * the API itself — every protected endpoint checks the Bearer token — and this
 * component only decides what the browser renders while that is true.
 *
 * Usage:
 *   <RequireRole roles={["ADMIN"]}>...</RequireRole>   // one role
 *   <RequireRole>...</RequireRole>                     // any signed-in user
 */

const LOGIN_PATH = "/login";
const NOT_AUTHORIZED_PATH = "/not-authorized";

function RouteSpinner() {
  return (
    <div
      className="flex min-h-[60vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Checking your session</span>
      <span className="size-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
    </div>
  );
}

export default function RequireRole({ roles, children, fallback }) {
  const router = useRouter();
  const { status, user } = useAuth();

  const allowed = normalizeRoles(roles);
  const isAllowedRole = allowed.length === 0 || allowed.includes(user?.role);
  const isAuthenticated = status === AUTH_STATUS.AUTHENTICATED;

  useEffect(() => {
    if (status === AUTH_STATUS.LOADING) return;

    if (status === AUTH_STATUS.UNAUTHENTICATED) {
      router.replace(LOGIN_PATH);
      return;
    }

    if (!isAllowedRole) {
      router.replace(NOT_AUTHORIZED_PATH);
    }
  }, [status, isAllowedRole, router]);

  // Render the placeholder — never the children — until the redirect commits.
  // `router.replace` is asynchronous, so returning children here would paint
  // admin-only UI to a student for a frame.
  if (status === AUTH_STATUS.LOADING || !isAuthenticated || !isAllowedRole) {
    return fallback === undefined ? <RouteSpinner /> : fallback;
  }

  return children;
}

function normalizeRoles(roles) {
  if (!roles) return [];

  const list = Array.isArray(roles) ? roles : [roles];

  return list.filter(Boolean).map((role) => String(role).toUpperCase());
}
