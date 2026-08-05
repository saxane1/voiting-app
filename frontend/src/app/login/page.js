import LoginPage from "@/components/auth/login-page";

/**
 * Thin route parent (repo convention: page.js composes, the UI lives in
 * components/<feature>/). Deliberately NOT wrapped in <RequireRole> — this is
 * the one authenticated-app route that must stay public.
 */

export const metadata = {
  title: "Sign in — PSU Online Voting System",
  description: "Sign in with your PSU university email and a one-time code.",
};

export default function Page() {
  return <LoginPage />;
}
