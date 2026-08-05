import ModulePlaceholder from "@/components/adminstration/module-placeholder";

export const metadata = {
  title: "Faculties — PSU Online Voting System",
};

export default function Page() {
  return (
    <ModulePlaceholder title="Faculties" subtitle="The six faculties of PSU" module="F4">
      Creating, renaming and removing faculties lands here. The student screens already read the
      live faculty list for their filter and their faculty picker.
    </ModulePlaceholder>
  );
}
