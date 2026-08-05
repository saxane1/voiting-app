import ElectionResultsPage from "@/components/adminstration/results/election-results-page";

/**
 * One election's results dashboard — tally, turnout, integrity, and the live
 * Socket.io feed while it is OPEN.
 *
 * `params` is a Promise in Next 16 (synchronous access was removed), so it is
 * awaited here before the id is handed to the client component that fetches,
 * joins the election's socket room, and renders. No guard is added: the
 * administration layout already gates this on ADMIN.
 */

export const metadata = {
  title: "Results — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <ElectionResultsPage electionId={id} />;
}
