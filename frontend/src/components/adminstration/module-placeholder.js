import { Construction } from "lucide-react";

import PageHeader from "./page-header";

/**
 * A named-but-unbuilt admin screen. The nav has to link somewhere for every
 * module the commission will eventually have, and a placeholder that says which
 * module lands here beats a 404 that looks like a bug.
 */

export default function ModulePlaceholder({ title, subtitle, module: moduleName, children }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="px-4 py-6 min-[920px]:px-7">
        <div className="border-line bg-surface mx-auto max-w-[560px] rounded-lg border p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Construction size={26} aria-hidden="true" />
          </div>

          <h2 className="font-display text-ink m-0 mb-1.5 text-lg font-bold">Coming in {moduleName}</h2>
          <p className="text-muted m-0 text-[13.5px] leading-[1.55]">{children}</p>
        </div>
      </div>
    </>
  );
}
