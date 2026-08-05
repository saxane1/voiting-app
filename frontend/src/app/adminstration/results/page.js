import ModulePlaceholder from "@/components/adminstration/module-placeholder";

export const metadata = {
  title: "Results — PSU Online Voting System",
};

export default function Page() {
  return (
    <ModulePlaceholder title="Results" subtitle="Commission-only live tally" module="F7">
      The real-time results dashboard lands here. It shows aggregate counts only — never
      individual ballots — and results are never published to students in the app.
    </ModulePlaceholder>
  );
}
