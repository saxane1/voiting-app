"use client";

import Link from "next/link";

import { AUTH_STATUS, useAuth } from "@/context/auth-context";
import { UNKNOWN_ROLE_HOME, roleHome } from "@/utils/role-home";

/**
 * Where <RequireRole> sends a signed-in user whose role does not cover the
 * route — distinct from /login, which is for users with no session at all.
 *
 * THE WAY OUT HAS TO KNOW WHO THEY ARE. This link used to point at "/", which
 * was a placeholder page and is now a redirector; either way it is not an
 * answer. The person standing here is signed in, so they have a home — it is
 * just not the page they asked for. `roleHome` is the same map F1's login
 * redirect and the guards use, so this cannot drift away from where the rest of
 * the app thinks they belong.
 *
 * Two edge cases the fallback covers, both landing on /login:
 *   - an unrecognised role, whose `roleHome` is /not-authorized itself. A link
 *     back to this very page is worse than no link.
 *   - no session at all — someone who typed the URL, or whose session expired
 *     while the page was open.
 */

export default function NotAuthorizedPage() {
  const { status, user } = useAuth();

  const home = status === AUTH_STATUS.AUTHENTICATED ? roleHome(user?.role) : UNKNOWN_ROLE_HOME;
  const canGoHome = home !== UNKNOWN_ROLE_HOME;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-h2 font-bold text-ink">Not authorized</h1>
      <p className="max-w-md text-sm text-muted">
        Your account does not have access to this page. If you believe this is a mistake, contact
        the election commission.
      </p>

      {/* Held back until the bootstrap refresh answers: a link whose target
          depends on the session must not be offered before the session is
          known, or it sends people to the wrong place on a slow connection. */}
      {status !== AUTH_STATUS.LOADING && (
        <Link
          href={canGoHome ? home : "/login"}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {canGoHome ? "Back to your dashboard" : "Go to sign in"}
        </Link>
      )}
    </main>
  );
}
