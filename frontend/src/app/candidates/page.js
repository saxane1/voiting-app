import { redirect } from "next/navigation";

/**
 * The candidate roster moved under the guarded administration area in F6.
 *
 * This route was an ungated pre-F0 scaffold page. Rather than leave it serving
 * placeholder content to anyone who keeps the link, it now forwards to the real
 * screen — where app/adminstration/layout.js applies the ADMIN guard.
 */

export default function Page() {
  redirect("/adminstration/candidates");
}
