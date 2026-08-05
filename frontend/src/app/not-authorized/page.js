import Link from "next/link";

/**
 * Where <RequireRole> sends a signed-in user whose role does not cover the
 * route — distinct from /login, which is for users with no session at all.
 */

export const metadata = {
  title: "Not authorized — PSU Online Voting System",
};

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-h2 font-bold text-ink">Not authorized</h1>
      <p className="max-w-md text-sm text-muted">
        Your account does not have access to this page. If you believe this is a mistake, contact
        the election commission.
      </p>
      <Link href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
        Back to the dashboard
      </Link>
    </main>
  );
}
