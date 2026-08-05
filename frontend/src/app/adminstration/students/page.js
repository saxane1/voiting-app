import StudentsPage from "@/components/adminstration/students/students-page";

/**
 * Route parent for the voter roll. Thin by design: the access token lives in
 * browser memory only, so a server component cannot fetch anything on the
 * admin's behalf — the list is read client-side through the axios instance.
 * The ADMIN guard is applied once by app/adminstration/layout.js.
 */

export const metadata = {
  title: "Students — PSU Online Voting System",
};

export default function Page() {
  return <StudentsPage />;
}
