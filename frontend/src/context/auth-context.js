"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { clearAccessToken, setAccessToken } from "@/utils/auth-token";
import api, { refreshAccessToken, setSessionExpiredHandler } from "@/utils/axios";

/**
 * Session state for the whole app.
 *
 * `status` is the only thing guards should branch on:
 *   'loading'         — bootstrap in flight; we do not yet know either way.
 *   'authenticated'   — `user` is populated.
 *   'unauthenticated' — no session; `user` is null.
 *
 * 'loading' exists because the access token is memory-only: after any reload
 * there is genuinely a moment where a logged-in user looks logged out, and
 * redirecting during that moment would kick real users to /login on refresh.
 */

const AuthContext = createContext(null);

const AUTH_STATUS = {
  LOADING: "loading",
  AUTHENTICATED: "authenticated",
  UNAUTHENTICATED: "unauthenticated",
};

export function AuthProvider({ children }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(AUTH_STATUS.LOADING);

  // Bootstrap must run once per mount. React StrictMode invokes effects twice
  // in development; refs survive that, so this keeps the cold load at exactly
  // one POST /auth/refresh.
  const hasBootstrapped = useRef(false);

  const endSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus(AUTH_STATUS.UNAUTHENTICATED);

    // Drop every cached query — otherwise the next person to log in on this
    // machine sees the previous user's data flash before the refetch lands.
    queryClient.clear();
  }, [queryClient]);

  /** Called by F1 once POST /auth/verify-otp returns { user, accessToken }. */
  const login = useCallback(({ user: nextUser, accessToken }) => {
    setAccessToken(accessToken);
    setUser(nextUser || null);
    setStatus(nextUser ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.UNAUTHENTICATED);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revokes the refresh token server-side and clears the cookie. A failure
      // here (expired access token, backend down) must not strand the user in a
      // half-logged-in UI, so the local teardown happens either way.
      await api.post("/auth/logout");
    } catch {
      // Intentionally ignored — see above.
    }

    endSession();
    router.replace("/login");
  }, [endSession, router]);

  // Registered before the bootstrap effect below so a 401 raised during
  // bootstrap already has somewhere to land.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      endSession();
      router.replace("/login");
    });

    return () => setSessionExpiredHandler(null);
  }, [endSession, router]);

  useEffect(() => {
    if (hasBootstrapped.current) return undefined;
    hasBootstrapped.current = true;

    let cancelled = false;

    async function bootstrapSession() {
      try {
        // The refresh cookie is the only credential that survives a reload.
        // A 401 here is the NORMAL logged-out path, not an error condition.
        await refreshAccessToken();

        const { data } = await api.get("/auth/me");

        if (cancelled) return;

        setUser(data.user);
        setStatus(AUTH_STATUS.AUTHENTICATED);
      } catch {
        if (cancelled) return;

        clearAccessToken();
        setUser(null);
        setStatus(AUTH_STATUS.UNAUTHENTICATED);
      }
    }

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      role: user?.role || null,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      isLoading: status === AUTH_STATUS.LOADING,
      login,
      logout,
    }),
    [user, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider> (see src/app/providers.js)");
  }

  return context;
}

export { AUTH_STATUS };
