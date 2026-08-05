import ElectionEditPage from "@/components/adminstration/elections/election-edit-page";

export const metadata = {
  title: "Edit election — PSU Online Voting System",
};

export default async function Page({ params }) {
  const { id } = await params;

  return <ElectionEditPage electionId={id} />;
}
