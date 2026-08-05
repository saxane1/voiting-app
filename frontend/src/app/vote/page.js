import BallotsDashboard from "@/components/vote/ballots-dashboard";

/**
 * Thin route parent. The ballots are fetched client-side because the access
 * token lives only in browser memory (F0), so a server component has no
 * credential to fetch them with.
 */

export const metadata = {
  title: "Your elections — PSU Online Voting System",
};

export default function Page() {
  return <BallotsDashboard />;
}
