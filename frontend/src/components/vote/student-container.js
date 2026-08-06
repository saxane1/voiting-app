/**
 * The one measure every student screen is laid out against.
 *
 * The prototype (design/PSU Vote.dc.html) is drawn at a fixed 520px phone frame,
 * and phones are the real target (Project-Context §10), so 520px stays the cap
 * for phone widths — this is byte-for-byte the old layout below 640px.
 *
 * Above that it steps up instead of staying marooned in the middle of a desktop
 * viewport. It deliberately does NOT go full-bleed: a ballot is a reading task,
 * and the admin dashboard's edge-to-edge grid would be the wrong borrowing. The
 * ceiling of 760px keeps the longest line on these screens (a candidate's
 * manifesto) inside a comfortable measure.
 *
 * Every student screen composes through this, so the header rule and the content
 * below it always share one left edge.
 */

export default function StudentContainer({ as: Tag = "div", className = "", children }) {
  return (
    <Tag
      className={`mx-auto w-full max-w-[520px] px-[18px] sm:max-w-[600px] sm:px-5 md:max-w-[680px] md:px-6 xl:max-w-[760px] ${className}`}
    >
      {children}
    </Tag>
  );
}
