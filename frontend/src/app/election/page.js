import { redirect } from "next/navigation";

/**
 * Elections moved under the guarded administration area in F4.
 *
 * This route was an ungated pre-F0 scaffold page. Rather than leave it serving
 * placeholder content to anyone who keeps the link, it now forwards to the real
 * screen — where app/adminstration/layout.js applies the ADMIN guard.
 *
 * Note the singular folder name: the real route is /adminstration/elections.
 */

export default function Page() {
  redirect("/adminstration/elections");
}
