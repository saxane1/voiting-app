"use client";

import { ArrowRight, Check, EyeOff, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { formatDateTime } from "@/utils/format-date";

/**
 * The post-vote confirmation.
 *
 * It names the ELECTION and never the candidate. Echoing the choice back here
 * would suggest the system can still tell you what you picked — it cannot, and
 * must not appear to: the Vote row has no link to the voter, so there is no
 * "view my vote" to follow this screen up with. What the student is being
 * confirmed is PARTICIPATION.
 *
 * This state is ephemeral client state. Reload or come back later and the
 * ballot shows the server's "already voted" panel instead.
 */

export default function VoteRecorded({ election, votedAt }) {
  return (
    <div className="animate-fade-in px-1 py-7 text-center">
      <div className="relative mx-auto mb-[22px] size-[104px]">
        <span
          className="absolute inset-0 rounded-full bg-success-50 motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <span className="bg-success-gradient relative grid size-[104px] place-items-center rounded-full text-white shadow-[0_14px_30px_-8px_rgba(16,185,129,.55)]">
          <Check size={52} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </div>

      <h1
        className="font-display text-ink m-0 mb-2 text-[26px] font-bold tracking-[-0.02em]"
        role="status"
      >
        Your vote has been recorded
      </h1>

      <p className="text-muted mx-auto mb-[22px] max-w-[330px] text-[14.5px] leading-[1.55]">
        Thank you for voting in <strong className="text-ink font-bold">{election.title}</strong>.
        Your ballot has been sealed.
      </p>

      <div className="border-line bg-surface mx-auto mb-6 max-w-[360px] rounded-lg border p-[18px] text-left shadow-sm">
        <div className="border-line flex items-center gap-[11px] border-b pb-3.5">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-indigo-50 text-indigo-600">
            <EyeOff size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-ink m-0 text-[13.5px] font-bold">Anonymous &amp; secret</p>
            <p className="text-muted m-0 text-xs">Your choice can&apos;t be traced back to you</p>
          </div>
        </div>

        <div className="flex items-center gap-[11px] pt-3.5">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-success-50 text-success-600">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-ink m-0 text-[13.5px] font-bold">Counted once</p>
            <p className="text-muted m-0 text-xs">
              {votedAt ? `Recorded ${formatDateTime(votedAt)}` : "Recorded"}
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/vote"
        className="bg-primary-gradient inline-flex items-center gap-2 rounded-md px-6 py-3.5 text-[14.5px] font-semibold text-white shadow-glow transition hover:brightness-105"
      >
        Back to my elections
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}
