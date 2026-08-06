import NotAuthorizedPage from "@/components/auth/not-authorized-page";

/**
 * Thin route parent (repo convention: page.js composes, the UI lives in
 * components/<feature>/). The screen itself is a client component because the
 * way out of it depends on the viewer's role, which only the browser knows.
 */

export const metadata = {
  title: "Not authorized — PSU Online Voting System",
};

export default function Page() {
  return <NotAuthorizedPage />;
}
