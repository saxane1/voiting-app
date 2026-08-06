"use client";

import { useState } from "react";

import { ArrowLeft, Building2, ClipboardList, Lock, LogOut, User } from "lucide-react";
import Link from "next/link";

import { LoadingState } from "@/components/common/query-states";
import { useAuth } from "@/context/auth-context";
import { useFaculties } from "@/hooks/use-faculties";
import { initialsOf } from "@/utils/initials";

/**
 * The student's own record, read-only — design/PSU Vote.dc.html, "STUDENT
 * PROFILE".
 *
 * READ-ONLY IS THE FEATURE, NOT A MISSING FORM. Student records are created and
 * updated by the commission only (Project-Context §7), so there is no edit
 * control here and no PATCH behind one. The registrar note is the design's
 * answer to "how do I change this", and it is the whole answer.
 *
 * IDENTITY ONLY. Name, student ID, faculty, email. Deliberately nothing about
 * which elections this student voted in, when, or for whom: the ballot is
 * unlinkable by construction (§8) and results are not a student-side concept at
 * all (§9). The dashboard owns participation; this screen owns who you are.
 *
 * No fetch of its own for the identity fields — they are already in the session
 * user from /auth/me. Only the faculty NAME is looked up, because the user
 * payload carries facultyId and the design shows a name; useFaculties() is the
 * same cached read the admin screens use (GET /faculties is auth-level, not
 * admin-level, precisely so a student can resolve their own faculty).
 */

export default function StudentProfile() {
  const { user, logout } = useAuth();
  const facultiesQuery = useFaculties();

  // The shell's guard already holds this route until the session is settled, so
  // this is the narrow window where a signed-in user object has not landed yet.
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) {
    return <LoadingState label="Loading your profile" />;
  }

  const faculty = facultiesQuery.data?.find((entry) => entry.id === user.facultyId);

  async function handleSignOut() {
    // logout() ends with a redirect, so this latch is only here to stop a second
    // tap on a slow connection firing a second POST /auth/logout.
    if (isSigningOut) return;

    setIsSigningOut(true);

    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <Link
        href="/vote"
        className="text-muted hover:text-ink mb-[18px] inline-flex items-center gap-1.5 text-[13px] font-semibold transition"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Dashboard
      </Link>

      <header className="bg-brand-gradient relative mb-4 overflow-hidden rounded-[28px] px-[22px] py-[26px] text-center text-white shadow-lg md:px-7 md:py-8">
        <span
          className="absolute inset-0 opacity-40 [background:radial-gradient(300px_200px_at_80%_0,rgba(255,255,255,.25),transparent)]"
          aria-hidden="true"
        />

        <span
          className="font-display relative mx-auto mb-3.5 grid size-20 place-items-center rounded-3xl border border-white/30 bg-white/[.18] text-[28px] font-bold md:size-[88px] md:text-[31px]"
          aria-hidden="true"
        >
          {initialsOf(user.name)}
        </span>

        <h1 className="font-display relative m-0 text-[21px] font-bold tracking-[-0.01em] md:text-2xl">
          {user.name}
        </h1>
        <p className="relative m-0 mt-[3px] text-[13px] break-all opacity-85">{user.email}</p>
      </header>

      <dl className="border-line bg-surface m-0 overflow-hidden rounded-lg border shadow-sm">
        <DetailRow icon={User} label="Full name">
          {user.name}
        </DetailRow>

        <DetailRow icon={ClipboardList} label="Student ID">
          <span className="font-display">{user.studentId || "—"}</span>
        </DetailRow>

        <DetailRow icon={Building2} label="Faculty" isLast>
          <FacultyValue query={facultiesQuery} faculty={faculty} hasFaculty={Boolean(user.facultyId)} />
        </DetailRow>
      </dl>

      <p className="border-line text-muted m-0 mt-3.5 flex items-start gap-2.5 rounded-md border bg-slate-50 px-3.5 py-3 text-[12.5px] leading-[1.45]">
        <Lock size={16} className="mt-px shrink-0" aria-hidden="true" />
        Your records are managed by the Election Commission. Contact the registrar to update
        details.
      </p>

      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-error-500/30 bg-error-50 py-3.5 text-sm font-semibold text-error-600 transition hover:bg-error-50/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut size={17} aria-hidden="true" />
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

/**
 * One label/value pair. <dl> rather than the prototype's <div>s so the pairing
 * is in the markup and not only in the visual alignment.
 */
function DetailRow({ icon: Icon, label, isLast = false, children }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-[15px] md:px-5 md:py-4 ${
        isLast ? "" : "border-line border-b"
      }`}
    >
      <dt className="text-muted flex shrink-0 items-center gap-2.5 text-[13px]">
        <Icon size={17} className="shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-ink m-0 min-w-0 truncate text-right text-[13.5px] font-semibold">
        {children}
      </dd>
    </div>
  );
}

/**
 * The faculty name is the one value on this screen that can be in flight or
 * fail, since it comes from a second request. A failed lookup says so instead
 * of rendering an em dash that would read as "you belong to no faculty".
 */
function FacultyValue({ query, faculty, hasFaculty }) {
  if (!hasFaculty) return "—";

  if (faculty) return faculty.name;

  if (query.isPending) {
    return (
      <>
        <span
          aria-hidden="true"
          className="inline-block h-4 w-28 rounded bg-slate-100 align-middle bg-[linear-gradient(90deg,var(--color-slate-100),var(--color-slate-200),var(--color-slate-100))] bg-[length:200%_100%] motion-safe:animate-shimmer"
        />
        <span className="sr-only">Loading your faculty</span>
      </>
    );
  }

  return <span className="text-muted font-medium">Unavailable</span>;
}
