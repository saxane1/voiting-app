"use client";

import { useEffect, useState } from "react";

import { LogOut, Menu, Vote, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/auth-context";
import { initialsOf } from "@/utils/initials";

import AdminNav from "./admin-nav";

/**
 * The chrome every admin screen sits in — the prototype's commission layout
 * (design/PSU Vote.dc.html, "ADMIN" section): a 250px indigo-950 sidebar, a
 * scrolling content column, and the account block with sign-out pinned to the
 * bottom of the sidebar.
 *
 * Desktop-first, because admins work at a desk: below 920px (the prototype's
 * own breakpoint) the sidebar becomes an off-canvas drawer behind a topbar, so
 * the same screens are still usable one-handed on a phone.
 *
 * F4–F8 inherit this by adding a page under app/adminstration/ — the guard and
 * the chrome are applied by the layout above, not by each page.
 */

const DRAWER_BREAKPOINT = 920;

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // The drawer remembers WHICH screen it was opened on, and is only open while
  // that is still the current one. Navigating therefore closes it by itself —
  // including via the back button — without an effect that reacts to the route
  // after the fact and paints the new screen behind a drawer for a frame.
  const [drawer, setDrawer] = useState({ open: false, path: null });

  const navOpen = drawer.open && drawer.path === pathname;

  function setNavOpen(open) {
    setDrawer({ open, path: open ? pathname : null });
  }

  useEffect(() => {
    if (!navOpen) return undefined;

    // setDrawer is stable, so the listeners below depend on nothing that
    // changes between renders.
    const close = () => setDrawer({ open: false, path: null });

    function onKeyDown(event) {
      if (event.key === "Escape") close();
    }

    // Widening past the breakpoint turns the drawer back into a static
    // sidebar; leaving it "open" would strand the overlay on top of it.
    function onResize() {
      if (window.innerWidth >= DRAWER_BREAKPOINT) close();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [navOpen]);

  return (
    <div className="relative flex min-h-screen">
      {/* Scrim — drawer widths only; the sidebar is part of the page above 920px. */}
      <button
        type="button"
        tabIndex={navOpen ? 0 : -1}
        aria-label="Close menu"
        onClick={() => setNavOpen(false)}
        className={`fixed inset-0 z-[120] cursor-default bg-[#0c0a28]/45 backdrop-blur-[2px] transition-opacity duration-300 min-[920px]:hidden ${
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[130] flex h-dvh w-[250px] flex-none flex-col bg-indigo-950 text-indigo-200 shadow-[0_24px_70px_-12px_rgba(8,6,35,.6)] transition-transform duration-300 ease-[cubic-bezier(.22,.85,.28,1)] min-[920px]:sticky min-[920px]:top-0 min-[920px]:z-auto min-[920px]:h-screen min-[920px]:translate-x-0 min-[920px]:shadow-none ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-[11px] border-b border-white/8 px-[18px] py-5">
          <span className="bg-brand-gradient grid size-[38px] place-items-center rounded-[11px] text-white shadow-glow">
            <Vote size={21} aria-hidden="true" />
          </span>
          <div>
            <div className="font-display text-[15px] leading-none font-bold text-white">
              PSU Vote
            </div>
            <div className="mt-1 text-[11px] text-indigo-300/70">Commission</div>
          </div>

          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-lg text-indigo-200/70 transition hover:bg-white/10 hover:text-white min-[920px]:hidden"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <AdminNav onNavigate={() => setNavOpen(false)} />

        <div className="border-t border-white/8 p-3">
          <div className="flex items-center gap-2.5 rounded-md bg-white/5 px-2.5 py-2">
            <span className="bg-brand-gradient font-display grid size-8 flex-none place-items-center rounded-[9px] text-xs font-bold text-white">
              {initialsOf(user?.name)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] leading-tight font-semibold text-white">
                {user?.name || "Commission"}
              </div>
              <div className="truncate text-[11px] text-indigo-300/70">{user?.email}</div>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="grid size-[30px] flex-none cursor-pointer place-items-center rounded-lg text-indigo-300/70 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[110] flex h-14 items-center gap-[11px] border-b border-white/10 bg-indigo-950 px-3.5 text-white min-[920px]:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Toggle menu"
            aria-expanded={navOpen}
            className="grid size-[38px] flex-none cursor-pointer place-items-center rounded-[10px] border border-white/15 bg-white/10 transition hover:bg-white/20"
          >
            {navOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>

          <Link href="/adminstration" className="flex items-center gap-[11px] text-white">
            <span className="bg-brand-gradient grid size-[30px] flex-none place-items-center rounded-[9px] shadow-glow">
              <Vote size={17} aria-hidden="true" />
            </span>
            <span className="font-display text-[15px] leading-none font-bold">
              PSU Vote <span className="text-xs font-medium opacity-60">· Commission</span>
            </span>
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
