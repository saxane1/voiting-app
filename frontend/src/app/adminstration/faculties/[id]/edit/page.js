import FacultyEditPage from "@/components/adminstration/faculties/faculty-edit-page";

/**
 * `params` is a Promise in Next 16 (synchronous access was removed), so it is
 * awaited here before the id is handed to the client component.
 */

export const metadata = {
  title: "Edit faculty — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <FacultyEditPage facultyId={id} />;
}
