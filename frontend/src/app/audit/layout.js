import RequireRole from "@/components/auth/require-role";
import AuditShell from "@/components/audit/audit-shell";

/**
 * Guards and frames the oversight area, the same way app/adminstration/layout.js
 * does for the commission — but with a DIFFERENT role set, and that difference
 * is the whole reason this route sits at the top level instead of under
 * /adminstration.
 *
 * GET /audit is ADMIN + AUDITOR (backend/src/routes/audit-routes.js), and for
 * an AUDITOR it is the only endpoint in the system they can reach. Putting this
 * screen under the administration tree would inherit that layout's
 * <RequireRole roles={["ADMIN"]}> and redirect every auditor away from their own
 * home page — roleHome("AUDITOR") points here. So the guard is declared here,
 * once, for both roles.
 *
 * The reverse direction still holds and is unchanged: /adminstration/* remains
 * ADMIN-only, so an auditor who guesses a URL there is sent to /not-authorized.
 * Nothing in this subtree links them anywhere near it.
 *
 * As everywhere else in this app the client guard decides what the browser
 * paints, not who may read the data — the API enforces the same two roles
 * server-side on every request.
 */

export const metadata = {
  title: "Audit log — PSU Online Voting System",
};

export default function AuditLayout({ children }) {
  return (
    <RequireRole roles={["ADMIN", "AUDITOR"]}>
      <AuditShell>{children}</AuditShell>
    </RequireRole>
  );
}
