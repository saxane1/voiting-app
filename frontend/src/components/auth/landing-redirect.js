"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { AUTH_STATUS, useAuth } from "@/context/auth-context";
import { roleHome } from "@/utils/role-home";

/**
 * What "/" resolves to.
 *
 * The site root has no content of its own — it is a doorway. Where it leads
 * depends on who is knocking, and that is only knowable in the browser: the
 * access token lives in memory and the refresh cookie is httpOnly and set by the
 * API on a different origin, so a server component at "/" cannot tell a signed-in
 * admin from an anonymous visitor. Hence a client component.
 *
 *   signed in    -> roleHome(role)   the same map F1's login redirect uses
 *   signed out   -> /login
 *   still asking -> a spinner, never a guess
 *
 * The LOADING branch matters more than it looks. The bootstrap refresh takes a
 * round trip on every cold load, and during it a genuinely signed-in admin is
 * indistinguishable from a visitor. Redirecting on that frame would bounce real
 * users to the login screen every time they refreshed the tab.
 *
 * `replace`, not `push`: "/" is a doorway, and it should not sit in the history
 * stack waiting to send Back through the same redirect again.
 */

export default function LandingRedirect() {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === AUTH_STATUS.LOADING) return;

    router.replace(
      status === AUTH_STATUS.AUTHENTICATED ? roleHome(user?.role) : "/login"
    );
  }, [status, user, router]);

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Checking your session</span>
      <span className="size-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
    </div>
  );
}
