import ResultsIndexPage from "@/components/adminstration/results/results-index-page";

/**
 * The Results nav destination: pick an election, then see its aggregates.
 *
 * No guard here — app/adminstration/layout.js already wraps every route below
 * it in <RequireRole roles={["ADMIN"]}>, and the API is ADMIN-only server-side
 * regardless (backend/src/routes/election-routes.js).
 */

export const metadata = {
  title: "Results — PSU Online Voting System",
};

export default function Page() {
  return <ResultsIndexPage />;
}
