import LandingRedirect from "@/components/auth/landing-redirect";

/**
 * The site root.
 *
 * This was an ungated pre-F0 scaffold page serving placeholder text to anyone
 * who found the domain. It now resolves to wherever the visitor actually
 * belongs — role home if they are signed in, /login if they are not.
 *
 * Thin server parent, as everywhere else in this app; the decision itself has to
 * happen in the browser, because the session does. See the component for why.
 */

export const metadata = {
  title: "PSU Online Voting System",
};

export default function Page() {
  return <LandingRedirect />;
}
