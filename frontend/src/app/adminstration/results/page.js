import { Suspense } from "react";

import ResultsIndexPage from "@/components/adminstration/results/results-index-page";
import { LoadingState } from "@/components/common/query-states";

/**
 * The Results nav destination: pick an election, then see its aggregates inline.
 *
 * No guard here — app/adminstration/layout.js already wraps every route below
 * it in <RequireRole roles={["ADMIN"]}>, and the API is ADMIN-only server-side
 * regardless (backend/src/routes/election-routes.js).
 *
 * The <Suspense> boundary is required, not decorative: the switcher reads its
 * selection from the query string with useSearchParams, and Next prerenders
 * this route. Without a boundary the whole client tree above the hook would be
 * forced out of the prerender and the build would fail.
 */

export const metadata = {
  title: "Results — PSU Online Voting System",
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading results" />}>
      <ResultsIndexPage />
    </Suspense>
  );
}
