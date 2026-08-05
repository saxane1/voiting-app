import axios from "axios";

import { clearAccessToken, getAccessToken, setAccessToken } from "./auth-token.js";

/**
 * The single axios instance every authed request in this app goes through.
 *
 * Contract (docs/API-Map.md): base path /api, `Authorization: Bearer <token>`
 * for auth, and an httpOnly refresh cookie the browser sends on its own when
 * `withCredentials` is set. The backend runs on a different origin, so the
 * cookie only rides along because of `withCredentials` here plus
 * `cors({ credentials: true })` there.
 */

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const API_BASE_URL = `${API_ORIGIN}/api`;

const REFRESH_PATH = "/auth/refresh";
const LOGIN_PATH = "/login";

/**
 * Endpoints that must NEVER trigger a refresh-and-retry on a 401. `/auth/refresh`
 * is the obvious one — refreshing the refresh call is an infinite loop. The rest
 * are unauthenticated or session-ending by nature: a 401 from them is the real
 * answer, not a stale-token symptom.
 */
const NO_REFRESH_PATHS = new Set([
  REFRESH_PATH,
  "/auth/logout",
  "/auth/request-otp",
  "/auth/verify-otp",
]);

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/**
 * A bare client with NO interceptors, used only for the refresh call. Keeping
 * refresh off the main instance means the 401 handler below structurally cannot
 * re-enter itself, rather than merely being told not to.
 */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

/** The in-flight refresh, or null. This one variable IS the single-flight lock. */
let refreshPromise = null;

/** Set by AuthProvider so a hard 401 clears React state, not just the token. */
let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === "function" ? handler : null;
}

function normalizePath(url) {
  if (!url) return "";

  // config.url is normally already relative ("/auth/me"), but tolerate absolute.
  const withoutBase = url.startsWith(API_BASE_URL) ? url.slice(API_BASE_URL.length) : url;
  const path = withoutBase.split("?")[0];

  return path.startsWith("/") ? path : `/${path}`;
}

function forceLogout() {
  clearAccessToken();

  if (sessionExpiredHandler) {
    sessionExpiredHandler();
    return;
  }

  // No provider mounted (or it unmounted mid-flight) — fall back to a hard
  // navigation. Guarded so a 401 raised on the login screen can't loop.
  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH);
  }
}

/**
 * Exchange the httpOnly refresh cookie for a fresh access token.
 *
 * Single-flight: the first caller starts the request and every caller that
 * arrives while it is open awaits the SAME promise. Ten concurrent authed
 * requests all 401-ing at once therefore produce exactly one POST /auth/refresh
 * — which matters beyond tidiness, because the backend rotates the refresh
 * token on every use and treats a replayed one as reuse.
 */
export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post(REFRESH_PATH)
      .then((response) => {
        const token = response.data?.accessToken;

        if (!token) {
          throw new Error("Refresh succeeded but carried no access token");
        }

        setAccessToken(token);

        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;

    if (!config || status !== 401) {
      return Promise.reject(error);
    }

    // Retry at most once. A 401 on the retry means the brand-new token was
    // rejected too, so refreshing again would just spin.
    if (config.hasRetriedAfterRefresh || NO_REFRESH_PATHS.has(normalizePath(config.url))) {
      return Promise.reject(error);
    }

    config.hasRetriedAfterRefresh = true;

    try {
      await refreshAccessToken();
    } catch {
      forceLogout();

      // Reject with the ORIGINAL 401: that is what the caller asked about, and
      // the refresh failure is already handled by the logout above.
      return Promise.reject(error);
    }

    // Replay through the instance so the request interceptor attaches the token
    // that refreshAccessToken just stored.
    return api(config);
  }
);

export default api;
