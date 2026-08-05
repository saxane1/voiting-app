import RequireRole from "@/components/auth/require-role";
import StudentShell from "@/components/vote/student-shell";

/**
 * Guards and frames the whole student area in one place, so no individual voter
 * route can be added later without the STUDENT gate.
 *
 * ADMIN and AUDITOR are refused here as well as by the API — /api/me is
 * STUDENT-only on the backend too (administrators are not voters).
 */

export const metadata = {
  title: "Vote — PSU Online Voting System",
};

export default function VoteLayout({ children }) {
  return (
    <RequireRole roles={["STUDENT"]}>
      <StudentShell>{children}</StudentShell>
    </RequireRole>
  );
}
