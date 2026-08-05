import CandidatesIndexPage from "@/components/adminstration/candidates/candidates-index-page";

/**
 * The Candidates nav destination. Candidates belong to an election, so this
 * picks one and hands off to /adminstration/elections/[id]/candidates.
 */

export const metadata = {
  title: "Candidates — PSU Online Voting System",
};

export default function Page() {
  return <CandidatesIndexPage />;
}
