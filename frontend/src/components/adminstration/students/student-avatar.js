import { initialsOf } from "@/utils/initials";

/**
 * Initials tile for a row in the voter roll. Students have no photo field on
 * the User model, so unlike the candidate avatar there is nothing to fall back
 * from — initials are the whole thing.
 *
 * A deactivated student's tile goes flat grey, so a disabled account reads as
 * disabled at a glance down the column rather than only in the status cell.
 */

export default function StudentAvatar({ name, isActive = true, size = 36 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      className={`font-display grid flex-none place-items-center rounded-[10px] font-bold ${
        isActive ? "bg-brand-gradient text-white" : "bg-slate-200 text-slate-500"
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}
