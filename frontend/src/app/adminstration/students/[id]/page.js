import StudentDetailPage from "@/components/adminstration/students/student-detail-page";

/**
 * One student's record. `params` is a Promise in Next 16 (synchronous access
 * was removed), so it is awaited here before the id is handed to the client
 * component that fetches and edits the record.
 */

export const metadata = {
  title: "Edit student — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <StudentDetailPage studentId={id} />;
}
