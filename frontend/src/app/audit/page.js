import AuditLogPage from "@/components/audit/audit-log-page";

/**
 * The filterable activity trail (F8) — the AUDITOR's home, and the Audit log
 * item in the commission's sidebar.
 *
 * No guard and no chrome here: app/audit/layout.js already gates this on
 * ADMIN + AUDITOR and wraps it in the oversight shell, so a screen added to
 * this subtree later cannot be shipped without them.
 */

export default function Page() {
  return <AuditLogPage />;
}
