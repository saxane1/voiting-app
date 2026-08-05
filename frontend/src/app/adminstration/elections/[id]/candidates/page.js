import CandidateRosterPage from "@/components/adminstration/candidates/candidate-roster-page";

/**
 * One election's candidate roster.
 *
 * Nested under the election on purpose: a candidacy only means anything in the
 * context of a specific ballot, and both rules that govern this screen — which
 * students may stand (type + faculty) and whether the roster may be changed at
 * all (status) — are properties of the election in the URL.
 *
 * `params` is a Promise in Next 16 (synchronous access was removed), so it is
 * awaited here before the id is handed to the client component. No guard is
 * added: app/adminstration/layout.js already wraps every route below it in
 * <RequireRole roles={["ADMIN"]}>.
 */

export const metadata = {
  title: "Candidates — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <CandidateRosterPage electionId={id} />;
}
