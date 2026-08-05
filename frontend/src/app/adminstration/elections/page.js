import ElectionsPage from "@/components/adminstration/elections/elections-page";

/**
 * Route parent for the elections list. Thin by design: the access token lives
 * in browser memory only, so a server component cannot fetch on the admin's
 * behalf. The ADMIN guard and the shell come from app/adminstration/layout.js.
 */

export const metadata = {
  title: "Elections — PSU Online Voting System",
};

export default function Page() {
  return <ElectionsPage />;
}
