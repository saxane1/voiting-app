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

// The bootstrap admin is the ROOT OF TRUST (B3b): isRoot = true marks the one
// account that can never be deactivated, so the system can never be locked out
// of its own administration. "At most one root" is enforced by a partial unique
// index on users(is_root) WHERE is_root — see the add_user_is_root migration.
async function seedBootstrapAdmin() {
  const email = env.BOOTSTRAP_ADMIN_EMAIL;

  if (!email) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL is not set. Add it to .env before running the seed."
    );
  }

  const normalisedEmail = email.trim().toLowerCase();

  const [existing, currentRoot] = await Promise.all([
    prisma.user.findUnique({
      where: { email: normalisedEmail },
      select: { id: true, role: true, isRoot: true },
    }),
    prisma.user.findFirst({
      where: { isRoot: true },
      select: { id: true, email: true },
    }),
  ]);

  // A root already exists under a DIFFERENT address. Re-pointing
  // BOOTSTRAP_ADMIN_EMAIL would otherwise move the trust anchor as a silent
  // side effect of an .env edit — which is a privilege-escalation path, not a
  // configuration change. Refuse and make the operator do it deliberately.
  // (Without this the upsert would still be blocked, but by a raw P2002 from
  // the partial unique index, which says nothing about what to do next.)
  if (currentRoot && currentRoot.email !== normalisedEmail) {
    throw new Error(
      [
        `A root admin already exists (${currentRoot.email}) but BOOTSTRAP_ADMIN_EMAIL is set to ${normalisedEmail}.`,
        "The seed will not move the root of trust on its own.",
        "Either point BOOTSTRAP_ADMIN_EMAIL back at the existing root, or transfer root deliberately:",
        "  1. create the new admin through POST /api/users (it is audited),",
        "  2. in one transaction, clear isRoot on the old account and set it on the new one,",
        "  3. then update BOOTSTRAP_ADMIN_EMAIL to match.",
      ].join("\n         ")
    );
  }

  // Safe now: either no root exists, or the existing root IS this email, so the
  // partial unique index cannot be violated by writing isRoot: true here.
  const admin = await prisma.user.upsert({
    where: { email: normalisedEmail },
    // On re-run, guarantee the account can still administer AND is still the
    // root. The name is left alone so an edit made through the app is not
    // reverted by a re-seed.
    update: { role: "ADMIN", isActive: true, isRoot: true },
    create: {
      email: normalisedEmail,
      name: env.BOOTSTRAP_ADMIN_NAME,
      role: "ADMIN",
      isActive: true,
      isRoot: true,
      // ADMIN accounts carry no studentId/facultyId — those are student-only.
    },
  });

  let action;

  if (!existing) {
    action = "created";
  } else if (existing.role !== "ADMIN") {
    action = "promoted to ADMIN";
  } else if (!existing.isRoot) {
    action = "marked root";
  } else {
    action = "unchanged";
  }

  return { email: admin.email, action };
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
  // Root count is printed as a standing invariant check: it must always read 1.
  const rootCount = await prisma.user.count({ where: { isRoot: true } });
  console.log(
    `[seed] done — ${facultyCount} faculties, ${adminCount} admin(s), ${rootCount} root`
  );
}

main()
  .catch((error) => {
    console.error("[seed] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
