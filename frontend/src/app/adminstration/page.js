import { Plus, Upload, Users } from "lucide-react";
import Link from "next/link";

import PageHeader from "@/components/adminstration/page-header";

/**
 * The commission's landing screen (roleHome("ADMIN")).
 *
 * The guard and the chrome come from app/adminstration/layout.js, so this is a
 * thin server component. The live turnout dashboard belongs to F7; until then
 * this is the way in to the module that exists.
 */

export const metadata = {
  title: "Dashboard — PSU Online Voting System",
};

const SHORTCUTS = [
  {
    href: "/adminstration/students",
    icon: Users,
    title: "Students",
    description: "Search the voter roll, edit a record, deactivate an account.",
  },
  {
    href: "/adminstration/students/new",
    icon: Plus,
    title: "Add a student",
    description: "Create one account — email, student ID, name and faculty.",
  },
  {
    href: "/adminstration/students/import",
    icon: Upload,
    title: "Bulk upload",
    description: "Import a roster from Excel, with per-row validation feedback.",
  },
];

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" subtitle="PSU Election Commission" />

      <div className="px-4 py-6 min-[920px]:px-7">
        <h2 className="text-ink m-0 mb-3 text-sm font-bold">Student management</h2>

        <div className="grid gap-3.5 min-[720px]:grid-cols-3">
          {SHORTCUTS.map((shortcut) => (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="border-line bg-surface rounded-lg border p-5 shadow-xs transition hover:border-indigo-300 hover:bg-indigo-50/50"
            >
              <span className="mb-3 grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <shortcut.icon size={21} aria-hidden="true" />
              </span>

              <span className="font-display text-ink block text-[15px] font-bold">
                {shortcut.title}
              </span>
              <span className="text-muted mt-1 block text-[13px] leading-[1.5]">
                {shortcut.description}
              </span>
            </Link>
          ))}
        </div>

        <p className="text-muted mt-6 text-[13px]">
          Faculties, elections, candidates, results and the audit trail arrive with the later
          modules — their screens are already in the navigation.
        </p>
      </div>
    </>
  );
}
