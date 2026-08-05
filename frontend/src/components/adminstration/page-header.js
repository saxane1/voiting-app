"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The prototype's `.scr-head`: a sticky, translucent screen header carrying the
 * title, an optional subtitle, an optional back link, and the screen's actions.
 *
 * It sticks to `top-0` on desktop and to `top-14` on drawer widths, where the
 * admin topbar already occupies the first 56px.
 */

export default function PageHeader({ title, subtitle, backHref, backLabel, children }) {
  return (
    <div className="border-line bg-bg/85 sticky top-0 z-30 border-b px-4 py-4 backdrop-blur-[10px] max-[919px]:top-14 min-[920px]:px-7 min-[920px]:py-5">
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
