/**
 * A loading placeholder shaped like the value it is standing in for.
 *
 * The overview's whole job is to show numbers, so a spinner in the middle of a
 * tile tells an admin nothing about what is coming. A bar the size of the figure
 * does, and it keeps the layout from jumping when the figure lands.
 *
 * Uses the `animate-shimmer` keyframe wired in globals.css from the prototype,
 * which slides a highlight across a 200%-wide gradient. `motion-safe:` because a
 * page of these is a lot of movement for anyone who asked for less of it.
 */

export default function OverviewShimmer({ className = "", tone = "light" }) {
  const gradient =
    tone === "dark"
      ? "bg-[linear-gradient(90deg,rgba(255,255,255,.14),rgba(255,255,255,.3),rgba(255,255,255,.14))]"
      : "bg-[linear-gradient(90deg,var(--color-slate-100),var(--color-slate-200),var(--color-slate-100))]";

  return (
    <span
      aria-hidden="true"
      className={`block rounded-md bg-[length:200%_100%] motion-safe:animate-shimmer ${gradient} ${className}`}
    />
  );
}
