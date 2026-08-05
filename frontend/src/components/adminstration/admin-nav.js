"use client";

import {
  Building2,
  ChartColumn,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The commission's navigation, defined once and rendered by <AdminShell> in
 * both the desktop sidebar and the mobile drawer.
 *
 * Adding a module (F4–F8) means adding a row here and a page under
 * app/adminstration/ — nothing else. The `exact` flag exists because
 * "/adminstration" is a prefix of every other entry, so the dashboard would
 * otherwise light up on every screen.
 *
 * NOTE on Audit log: it points at the top-level /audit route rather than one
 * under /adminstration, because that page is shared with the AUDITOR role,
 * whose users are not admins and must not be sent through an ADMIN-guarded
 * layout. It is the one nav item that leaves this shell.
 */

export const ADMIN_NAV = [
  { href: "/adminstration", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/adminstration/students", label: "Students", icon: Users },
  { href: "/adminstration/faculties", label: "Faculties", icon: Building2 },
  { href: "/adminstration/elections", label: "Elections", icon: Vote },
  { href: "/adminstration/candidates", label: "Candidates", icon: GraduationCap },
  { href: "/adminstration/results", label: "Results", icon: ChartColumn },
  { href: "/audit", label: "Audit log", icon: ClipboardList },
];

export function isNavItemActive(item, pathname) {
  if (!pathname) return false;

  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function AdminNav({ onNavigate }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-3" aria-label="Administration">
      {ADMIN_NAV.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-[11px] rounded-md px-3 py-2.5 text-[13.5px] font-semibold transition ${
              active
                ? "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]"
                : "text-indigo-200/75 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Icon size={18} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
