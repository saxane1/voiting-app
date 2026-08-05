import { env } from "../src/config/env.js";
import { prisma, disconnectPrisma } from "../src/config/prisma.js";

// ⚠ PLACEHOLDER NAMES — confirm these against PSU's official faculty list before
// the real election. They are not recorded in any spec file in this repo, so
// they were filled in from a typical Somali public-university structure.
// `name` is unique, so correcting a name here creates a NEW faculty rather than
// renaming the old one — edit the DB directly (or add a migration) if students
// are already attached.
const FACULTIES = [
  { name: "Faculty of Computer Science and Information Technology", code: "CSIT" },
  { name: "Faculty of Economics and Business Administration", code: "EBA" },
  { name: "Faculty of Education", code: "EDU" },
  { name: "Faculty of Health Sciences", code: "HS" },
  { name: "Faculty of Law", code: "LAW" },
  { name: "Faculty of Engineering", code: "ENG" },
];

async function seedFaculties() {
  const results = [];

  for (const faculty of FACULTIES) {
    // Upsert on the unique name -> re-running never duplicates a faculty.
    const existing = await prisma.faculty.findUnique({
      where: { name: faculty.name },
      select: { id: true },
    });

    await prisma.faculty.upsert({
      where: { name: faculty.name },
      update: { code: faculty.code },
      create: faculty,
    });

    results.push({ name: faculty.name, action: existing ? "unchanged" : "created" });
  }

  return results;
}

async function seedBootstrapAdmin() {
  const email = env.BOOTSTRAP_ADMIN_EMAIL;

  if (!email) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL is not set. Add it to .env before running the seed."
    );
  }

  const normalisedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true, role: true },
  });

  const admin = await prisma.user.upsert({
    where: { email: normalisedEmail },
    // On re-run, only guarantee the account can still administer. The name is
    // left alone so an edit made through the app is not reverted by a re-seed.
    update: { role: "ADMIN", isActive: true },
    create: {
      email: normalisedEmail,
      name: env.BOOTSTRAP_ADMIN_NAME,
      role: "ADMIN",
      isActive: true,
      // ADMIN accounts carry no studentId/facultyId — those are student-only.
    },
  });

  return {
    email: admin.email,
    action: existing ? (existing.role === "ADMIN" ? "unchanged" : "promoted to ADMIN") : "created",
  };
}

async function main() {
  console.log("[seed] starting");

  const faculties = await seedFaculties();
  for (const faculty of faculties) {
    console.log(`[seed] faculty ${faculty.action.padEnd(9)} ${faculty.name}`);
  }

  const admin = await seedBootstrapAdmin();
  console.log(`[seed] admin   ${admin.action.padEnd(9)} ${admin.email}`);

  const facultyCount = await prisma.faculty.count();
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  console.log(`[seed] done — ${facultyCount} faculties, ${adminCount} admin(s)`);
}

main()
  .catch((error) => {
    console.error("[seed] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
