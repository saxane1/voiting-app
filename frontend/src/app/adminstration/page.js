import OverviewPage from "@/components/adminstration/overview/overview-page";

/**
 * The commission's landing screen (roleHome("ADMIN")) — the Election Overview.
 *
 * Thin by design, like every route parent in this app: the guard and the chrome
 * come from app/adminstration/layout.js, and the data is read client-side
 * because the access token lives only in browser memory, where a server
 * component cannot reach it.
 */

export const metadata = {
  title: "Election Overview — PSU Online Voting System",
};

export default function Page() {
  return <OverviewPage />;
}
