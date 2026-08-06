
"use client";

import { ClipboardList, LayoutDashboard, LogOut, ShieldCheck, Vote } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/context/auth-context";
import { initialsOf } from "@/utils/initials";

/**
 * The oversight chrome — the whole of it.
 *
 * WHY THIS EXISTS INSTEAD OF <AdminShell>. /audit is the ONE screen an AUDITOR
 * can reach (docs/API-Map.md B9: "read-only oversight sees the trail and
 * nothing else"), and it is shared with ADMIN. It therefore cannot live under
 * app/adminstration/, whose layout wraps everything in
 * <RequireRole roles={["ADMIN"]}> and would bounce an auditor to
 * /not-authorized on their own home page. AdminShell is also unusable here for
 * a second reason: its sidebar IS the admin nav, so rendering it would show an
 * auditor six links to screens the API will refuse them.
 *
 * A one-item sidebar would be absurd, so the chrome is a single top bar: brand,
 * the one nav item, who you are signed in as, and a way out. That is every
 * affordance an auditor needs and nothing else.
 *
 * THE ONE EXCEPTION, and it is role-gated. An ADMIN arrives here from the
 * commission sidebar and would otherwise be stranded with no way back except
 * the browser's back button, so a "Administration" link is rendered for
 * `role === "ADMIN"` only. It is not hidden from auditors with CSS — it is
 * never rendered for them, so there is nothing to reveal with a devtools
 * inspector, and it points at a route that is itself ADMIN-guarded and would
 * refuse them twice over.
 */

export default function AuditShell({ children }) {
    const { user, logout } = useAuth();

    const isAdmin = user?.role === "ADMIN";

    return (
        <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-50 border-b border-white/10 bg-indigo-950 text-white">
                <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 min-[720px]:px-6">
                    <Link href="/audit" className="flex items-center gap-[11px] text-white">
                        <span className="bg-brand-gradient grid size-[34px] flex-none place-items-center rounded-[10px] shadow-glow">
                            <Vote size={19} aria-hidden="true" />
                        </span>
                        <span>
                            <span className="font-display block text-[15px] leading-none font-bold">
                                PSU Vote
                            </span>
                            <span className="mt-1 block text-[11px] text-indigo-300/70">Oversight</span>
                        </span>
                    </Link>

         
                    <nav aria-label="Oversight" className="order-3 flex w-full gap-2 min-[720px]:order-none min-[720px]:w-auto">

                        {isAdmin && (
                            <Link
                                href="/adminstration"
                                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13.5px] font-semibold text-indigo-200/75 transition hover:bg-white/8 hover:text-white"
                            >
                                <LayoutDashboard size={17} aria-hidden="true" />
                                Administration
                            </Link>
                        )}
                    </nav>

                    <div className="ml-auto flex items-center gap-2.5">
                        <div className="flex items-center gap-2.5 rounded-md bg-white/5 px-2.5 py-1.5">
                            <span className="bg-brand-gradient font-display grid size-8 flex-none place-items-center rounded-[9px] text-xs font-bold text-white">
                                {initialsOf(user?.name)}
                            </span>

                            <div className="hidden min-w-0 min-[560px]:block">
                                <div className="max-w-[170px] truncate text-[12.5px] leading-tight font-semibold text-white">
                                    {user?.name || "Oversight"}
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-indigo-300/70">
                                    {roleLabel(user?.role)}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={logout}
                            title="Sign out"
                            aria-label="Sign out"
                            className="grid size-9 flex-none cursor-pointer place-items-center rounded-[10px] border border-white/15 bg-white/10 text-indigo-100 transition hover:bg-white/20 hover:text-white"
                        >
                            <LogOut size={17} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </header>

            {/*
        No padding here, matching AdminShell: the screen inside supplies its own
        <PageHeader> (full-bleed, with its own rule beneath it) and then pads its
        body. Padding the shell instead would inset the header and break that.
      */}
            <main className="mx-auto w-full max-w-[1280px] flex-1">{children}</main>
        </div>
    );
}

function roleLabel(role) {
    if (role === "AUDITOR") return "Auditor";
    if (role === "ADMIN") return "Commission";

    return "Signed in";
}
