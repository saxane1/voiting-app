import { ClipboardList, Plus, Upload, Vote } from "lucide-react";
import Link from "next/link";

/**
 * The four things a commission member starts most often, as links.
 *
 * Every href below is a route that exists in app/ today — there are no
 * placeholder buttons on this card. A dead action on the landing page of an
 * election system is worse than a missing one: it is discovered on election day.
 *
 * "View audit log" leaves the admin shell on purpose. /audit is shared with the
 * AUDITOR role, whose users are not admins and must not be routed through an
 * ADMIN-guarded layout — the same reason ADMIN_NAV points there rather than at a
 * route under /adminstration.
 */

const ACTIONS = [
  {
    href: "/adminstration/students/new",
    icon: Plus,
    label: "Add a student",
  },
  {
    href: "/adminstration/students/import",
    icon: Upload,
    label: "Bulk upload (Excel)",
  },
  {
    href: "/adminstration/elections/new",
    icon: Vote,
    label: "New election",
  },
  {
    href: "/audit",
    icon: ClipboardList,
    label: "View audit log",
  },
];

export default function QuickActionsCard() {
  return (
    <section className="border-line bg-surface rounded-lg border p-[18px] shadow-xs">
      <h2 className="text-ink m-0 mb-3 text-[13px] font-bold">Quick actions</h2>

      <div className="flex flex-col gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="border-line flex items-center gap-2.5 rounded-[10px] border bg-slate-50 px-2.5 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
          >
            <action.icon size={16} className="flex-none" aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
