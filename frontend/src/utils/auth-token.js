/**
 * In-memory access-token store.
 *
 * The access token lives HERE and nowhere else — never localStorage, never
 * sessionStorage, never a JS-readable cookie. An XSS payload can read any of
 * those at leisure; a module-scoped variable dies with the tab, so a stolen
 * token cannot outlive the page. Durability is the refresh cookie's job: it is
 * httpOnly, set by the backend, and unreadable from JavaScript by design. That
 * split is why a full page reload starts with `null` here and has to bootstrap
 * through POST /auth/refresh (see context/auth-context.js).
 */

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}
