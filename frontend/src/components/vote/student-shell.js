"use client";

import { Vote } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/context/auth-context";
import { initialsOf } from "@/utils/initials";

import StudentContainer from "./student-container";

/**
 * The student portal chrome from design/PSU Vote.dc.html.
 *
 * The prototype draws this as a 520px phone frame centred on the page. That is
 * right for a phone and wrong for a laptop, where it left the whole portal
 * stranded in a narrow strip. So the FRAME is gone and the MEASURE stayed: the
 * header rule now spans the viewport like any web app, while the header's own
 * contents and the page body below share one StudentContainer and therefore one
 * column. Below 640px this renders exactly what it always did.
 *
 * SIGN-OUT LIVES ON THE PROFILE PAGE, NOT HERE. The prototype has it in both
 * places; two of them is one too many, and the header is the worse of the two —
 * an unlabelled icon one mis-tap away from the ballot link, on a phone, in the
 * middle of voting. The avatar pill is the way in, and the profile screen holds
 * the single logout (components/vote/student-profile.js).
 */

export default function StudentShell({ children }) {
  const { user } = useAuth();

  return (
    <div className="bg-bg min-h-screen w-full">
      <header className="border-line sticky top-0 z-50 border-b bg-white/85 backdrop-blur-[12px]">
        <StudentContainer className="flex items-center justify-between py-3">
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

          <Link
            href="/vote/profile"
            aria-label="Your profile"
            className=" flex items-center "
          >
            <span
              className="bg-brand-gradient font-display grid size-[26px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-white border-2 border-indigo-600 "
              aria-hidden="true"
            >
              {initialsOf(user?.name)}
            </span>

            {/* {user?.name && (
              <span className="text-muted hidden max-w-[160px] truncate pr-1 text-xs font-medium min-[420px]:block">
                {user.name}
              </span>
            )} */}
          </Link>
        </StudentContainer>
      </header>

      <StudentContainer as="main" className="pt-5 pb-10 md:pt-7 md:pb-14">
        {children}
      </StudentContainer>
    </div>
  );
}
