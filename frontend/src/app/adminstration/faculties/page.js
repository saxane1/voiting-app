import FacultiesPage from "@/components/adminstration/faculties/faculties-page";

/**
 * Route parent for faculty management. Thin by design: the access token lives
 * in browser memory only, so a server component cannot fetch on the admin's
 * behalf. The ADMIN guard and the shell come from app/adminstration/layout.js.
 */

export const metadata = {
  title: "Faculties — PSU Online Voting System",
};

export default function Page() {
  return <FacultiesPage />;
}
