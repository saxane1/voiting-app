/**
 * Where each role lands after a successful login.
 *
 * Centralised so F1's redirect, the route guards and F2+ navigation all agree.
 * Changing a role's landing page means changing exactly this map.
 */

export const ROLE_HOME = {
  // Existing route folder — the administration area is the commission's landing.
  ADMIN: "/adminstration",
  // F2 replaces this placeholder with the real voter dashboard.
  STUDENT: "/vote",
  // F8 replaces this placeholder with the audit log viewer (the AUDITOR role's
  // only endpoint — see docs/API-Map.md B9).
  AUDITOR: "/audit",
};

/**
 * An authenticated user whose role we do not recognise has no home to go to.
 * /not-authorized rather than /login: they ARE signed in, so sending them to
 * the login screen would bounce them straight back here.
 */
export const UNKNOWN_ROLE_HOME = "/not-authorized";

export function roleHome(role) {
  if (!role) return UNKNOWN_ROLE_HOME;

  return ROLE_HOME[String(role).toUpperCase()] || UNKNOWN_ROLE_HOME;
}
