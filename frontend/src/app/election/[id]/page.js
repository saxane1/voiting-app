import { redirect } from "next/navigation";

/**
 * One election's detail view moved under the guarded administration area in F4.
 *
 * This route was an ungated pre-F0 scaffold page. Rather than leave it serving
 * placeholder content to anyone who keeps the link, it now forwards to the real
 * screen — where app/adminstration/layout.js applies the ADMIN guard.
 *
 * The id is carried across so an old bookmark lands on the same election.
 * `params` is a Promise in Next 16 (synchronous access was removed), so it is
 * awaited before the redirect target is built.
 */

export default async function Page({ params }) {
  const { id } = await params;

  redirect(`/adminstration/elections/${encodeURIComponent(id)}`);
}
