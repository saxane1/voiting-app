"use client";

import { LogOut, Vote } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/context/auth-context";

/**
 * The student portal chrome from design/PSU Vote.dc.html: a phone-width column
 * centred on larger screens, with a sticky translucent header.
 *
 * 520px is the prototype's own frame width. Every student is on a phone, so the
 * phone layout is the real one and the desktop view is just that column centred
 * rather than a separate design.
 */

export default function StudentShell({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="bg-bg mx-auto min-h-screen w-full max-w-[520px] shadow-[0_0_60px_rgba(30,27,75,.05)] min-[600px]:border-x min-[600px]:border-line">
      <header className="border-line sticky top-0 z-50 flex items-center justify-between border-b bg-white/85 px-[18px] py-3 backdrop-blur-[12px]">
        <Link href="/vote" className="flex items-center gap-2.5">
          <span className="bg-brand-gradient grid size-[34px] place-items-center rounded-[10px] text-white shadow-sm">
            <Vote size={19} aria-hidden="true" />
          </span>
          <span>
            <span className="font-display text-ink block text-[15px] leading-none font-bold">
              PSU Vote
            </span>
            <span className="text-muted block text-[11px]">Student portal</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {user?.name && (
            <span className="text-muted hidden max-w-[140px] truncate text-xs font-medium min-[420px]:block">
              {user.name}
            </span>
          )}

          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="border-line grid size-9 cursor-pointer place-items-center rounded-[10px] border bg-slate-50 text-slate-500 transition hover:border-error-500/40 hover:bg-error-50 hover:text-error-600"
          >
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="px-[18px] pt-5 pb-10">{children}</main>
    </div>
  );
}
