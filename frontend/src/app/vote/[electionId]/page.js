import BallotScreen from "@/components/vote/ballot-screen";

/**
 * Thin route parent for one ballot.
 *
 * `params` is a Promise in Next 16 (synchronous access was removed), so it is
 * awaited here — the one thing this server component does before handing the id
 * to the client component that actually fetches the ballot.
 */

export const metadata = {
  title: "Your ballot — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { electionId } = await params;

  return <BallotScreen electionId={electionId} />;
}
