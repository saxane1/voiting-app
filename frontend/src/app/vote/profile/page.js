import StudentProfile from "@/components/vote/student-profile";

/**
 * Thin route parent, matching the other student routes.
 *
 * It sits under app/vote/layout.js, so the STUDENT gate and the portal chrome
 * are inherited rather than restated — adding the route is all that was needed
 * to have it guarded.
 *
 * A static segment beats a dynamic sibling in Next's matcher, so /vote/profile
 * resolves here and never to /vote/[electionId].
 */

export const metadata = {
  title: "Your profile — PSU Online Voting System",
};

export default function Page() {
  return <StudentProfile />;
}
