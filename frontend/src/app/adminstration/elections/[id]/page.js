import ElectionDetailPage from "@/components/adminstration/elections/election-detail-page";

/**
 * One election and its lifecycle controls. `params` is a Promise in Next 16
 * (synchronous access was removed), so it is awaited here before the id is
 * handed to the client component that fetches and drives it.
 */

export const metadata = {
  title: "Election — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <ElectionDetailPage electionId={id} />;
}
