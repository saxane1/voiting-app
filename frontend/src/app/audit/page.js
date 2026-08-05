import RequireRole from "@/components/auth/require-role";

/**
 * AUDITOR role home — placeholder so a successful login never lands on a 404.
 * F8 replaces this with the audit log viewer. ADMIN is allowed too: GET /audit
 * is ADMIN + AUDITOR (docs/API-Map.md B9).
 */

export const metadata = {
  title: "Audit log — PSU Online Voting System",
};

export default function Page() {
  return (
    <RequireRole roles={["AUDITOR", "ADMIN"]}>
      <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center gap-3 px-6">
        <h1 className="font-display text-ink text-h1 font-bold">Audit log</h1>
        <p className="text-muted text-sm">
          You&apos;re signed in. The filterable activity trail lands here in module F8.
        </p>
      </main>
    </RequireRole>
  );
}
