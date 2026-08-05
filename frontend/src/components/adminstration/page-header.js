"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The prototype's `.scr-head`: a sticky, translucent screen header carrying the
 * title, an optional subtitle, an optional back link, and the screen's actions.
 *
 * It sticks to `top-0` on desktop and to `top-14` on drawer widths, where the
 * admin topbar already occupies the first 56px.
 *
 * `sticky` is opt-out for exactly one caller: the F8 audit screen reuses this
 * header but lives outside the admin shell, under a top bar that is itself
 * sticky and whose height changes as it wraps. Two stacked sticky elements with
 * a variable offset between them is a layout bug waiting to happen, so that
 * screen scrolls its header away instead. Every admin screen keeps the default.
 */

export default function PageHeader({ title, subtitle, backHref, backLabel, sticky = true, children }) {
  return (
    <div
      className={`border-line bg-bg/85 border-b px-4 py-4 backdrop-blur-[10px] min-[920px]:px-7 min-[920px]:py-5 ${
        sticky ? "sticky top-0 z-30 max-[919px]:top-14" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="text-muted hover:text-ink mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold transition"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {backLabel || "Back"}
            </Link>
          )}

          <h1 className="font-display text-ink m-0 text-[22px] font-bold tracking-[-0.02em]">
            {title}
          </h1>

          {subtitle && <p className="text-muted m-0 mt-[3px] text-[13px]">{subtitle}</p>}
        </div>

        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
