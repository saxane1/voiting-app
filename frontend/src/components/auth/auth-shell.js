import { ShieldCheck, Vote } from "lucide-react";

/**
 * The two-column auth layout from design/PSU Vote.dc.html: a brand-gradient
 * aside beside the form panel.
 *
 * Mobile-first — the aside is decorative and is dropped below 840px (the
 * prototype's own breakpoint), leaving the form the full screen. Every student
 * logs in from a phone, so nothing here is load-bearing except the panel.
 */

const STATS = [
  { value: "6", label: "Faculties" },
  { value: "1", label: "Gudoomiye seat" },
  { value: "100%", label: "Anonymous" },
];

export default function AuthShell({ children }) {
  return (
    <div className="grid min-h-screen min-[840px]:grid-cols-[1.05fr_1fr]">
      <aside className="bg-brand-gradient relative hidden flex-col justify-between overflow-hidden p-[56px_60px] text-white min-[840px]:flex">
        {/* Depth wash from the prototype — purely decorative. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-35"
          style={{
            background:
              "radial-gradient(600px 400px at 80% 0%, rgba(255,255,255,.22), transparent), radial-gradient(500px 500px at 0% 100%, rgba(139,92,246,.5), transparent)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[13px] bg-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)] backdrop-blur-[4px]">
            <Vote size={24} aria-hidden="true" />
          </span>
          <div>
            <div className="font-display text-[19px] font-bold tracking-[-0.01em]">PSU Vote</div>
            <div className="text-xs tracking-[0.02em] opacity-80">Puntland State University</div>
          </div>
        </div>

        <div className="relative max-w-[440px]">
          <div className="mb-[22px] inline-flex items-center gap-[7px] rounded-pill border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold">
            <ShieldCheck size={14} aria-hidden="true" />
            Official Election Commission Platform
          </div>

          <h1 className="font-display m-0 mb-4 text-[clamp(30px,3.6vw,44px)] leading-[1.06] font-bold tracking-[-0.02em]">
            Your voice, sealed and secret.
          </h1>

          <p className="m-0 text-[15.5px] leading-relaxed opacity-90">
            Vote in your faculty and university elections from anywhere. Passwordless, encrypted,
            and anonymous — every ballot counts exactly once.
          </p>

          <div className="mt-[34px] flex gap-[22px]">
            {STATS.map((stat, index) => (
              <div key={stat.label} className="flex gap-[22px]">
                {index > 0 && <div className="w-px bg-white/20" aria-hidden="true" />}
                <div>
                  <div className="font-display text-[26px] font-bold">{stat.value}</div>
                  <div className="text-xs opacity-80">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs opacity-70">
          Encrypted end-to-end · One student, one vote · Audited
        </div>
      </aside>

      <main className="bg-surface flex items-center justify-center px-6 py-10">
        <div className="animate-fade-up w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
