import UsersPage from "@/components/adminstration/users-page";

/**
 * Route parent for access management — the ADMIN and AUDITOR accounts (B3b).
 *
 * Thin by design, for the same two reasons as every other admin route parent:
 *
 * 1. IT CANNOT FETCH. The access token lives in browser memory only (F0), so a
 *    server component has no credential to call GET /users with. The list is
 *    read client-side through the axios instance, which is also what makes the
 *    single-flight refresh and the 401 retry apply to it.
 *
 * 2. IT DOES NOT GUARD. app/adminstration/layout.js wraps this whole subtree in
 *    <RequireRole roles={["ADMIN"]}>, so an AUDITOR or STUDENT who follows a
 *    link or types the URL is redirected to /not-authorized before any of this
 *    renders. A second guard here would be a second thing to forget.
 *
 * Neither client-side check is the security boundary: every /api/users route is
 * requireAuth + requireRole("ADMIN") server-side
 * (backend/src/routes/user-routes.js), and requireAuth re-reads the account on
 * every request so a deactivated admin is refused immediately. This only decides
 * what the browser paints.
 */

export const metadata = {
  title: "Access management — PSU Online Voting System",
};

export default function Page() {
  return <UsersPage />;
}
