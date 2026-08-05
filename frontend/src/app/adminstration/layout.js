import RequireRole from "@/components/auth/require-role";
import AdminShell from "@/components/adminstration/admin-shell";

/**
 * Guards and frames the whole administration area in one place.
 *
 * Every route under app/adminstration/ inherits this, so a screen added by a
 * later module (F4–F8) cannot be shipped without the ADMIN gate — there is no
 * per-page guard to forget. <RequireRole> renders a spinner rather than the
 * children until the session resolves, so a STUDENT or AUDITOR who follows a
 * link here is redirected without ever seeing admin content.
 *
 * The client guard is a UX decision, not the security boundary: every
 * /api/students endpoint is requireAuth + requireRole("ADMIN") server-side
 * (backend/src/routes/student-routes.js). This only decides what the browser
 * paints.
 */

export const metadata = {
  title: "Administration — PSU Online Voting System",
};

export default function AdminstrationLayout({ children }) {
  return (
    <RequireRole roles={["ADMIN"]}>
      <AdminShell>{children}</AdminShell>
    </RequireRole>
  );
}
