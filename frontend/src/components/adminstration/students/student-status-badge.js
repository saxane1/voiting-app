/**
 * The `isActive` flag from GET /students, made visible.
 *
 * It is not cosmetic: an inactive student cannot sign in (refresh kills their
 * session family) and cannot vote, so the roll has to show which accounts are
 * actually part of the electorate.
 */

export default function StudentStatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${
        isActive ? "bg-success-50 text-success-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
