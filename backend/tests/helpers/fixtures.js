import { prisma } from "../../src/config/prisma.js";
import { hashValue } from "../../src/utils/hashing.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../src/utils/jwt.js";

// ---------------------------------------------------------------------------
// Fixtures run against the SAME database the app uses, so every one of them is
// namespaced by a per-run id and torn down in an after() hook. The suite asserts
// the table is byte-for-byte back to its starting counts before it exits.
//
// Access tokens are minted directly rather than driven through request-otp ->
// verify-otp. The OTP flow is B1's to test; going through it here would make
// every B3b test depend on a mailbox and on the per-email rate limiter, and
// would send real mail. requireAuth accepts these tokens exactly as it accepts
// real ones — it verifies the signature and then re-reads the account.
// ---------------------------------------------------------------------------

export const RUN_ID = `b3btest-${Date.now().toString(36)}`;

export function testEmail(label) {
  return `${RUN_ID}-${label}@example.com`;
}

// Every user this suite creates carries the run id in its address, which is what
// makes cleanup exact rather than best-effort.
function testUserFilter() {
  return { email: { startsWith: `${RUN_ID}-` } };
}

export function tokenFor(user) {
  return signAccessToken({ sub: user.id, role: user.role });
}

export async function getRoot() {
  const root = await prisma.user.findFirst({
    where: { isRoot: true },
    select: { id: true, email: true, name: true, role: true, isActive: true, isRoot: true },
  });

  if (!root) {
    throw new Error("No isRoot admin found. Run `npm run seed` before the tests.");
  }

  return root;
}

export async function getStudent() {
  const student = await prisma.user.findFirst({
    where: { role: "STUDENT", isActive: true },
    select: { id: true, email: true, role: true },
  });

  if (!student) {
    throw new Error("No active STUDENT found. The role-guard tests need one.");
  }

  return student;
}

// Created directly rather than through POST /api/users, so that tests which are
// not ABOUT creation do not depend on creation working.
export async function createElevatedUser({ label, role, isActive = true }) {
  return prisma.user.create({
    data: {
      email: testEmail(label),
      name: `Test ${role} ${label}`,
      role,
      isActive,
      isRoot: false,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, isRoot: true },
  });
}

// A genuine session: a signed refresh token whose hash is stored under the jti
// that doubles as the row's primary key — the exact shape verify-otp writes.
export async function issueRefreshToken(userId) {
  const token = signRefreshToken({ sub: userId });
  const payload = verifyRefreshToken(token);

  await prisma.refreshToken.create({
    data: {
      id: payload.jti,
      userId,
      tokenHash: await hashValue(token),
      expiresAt: new Date(payload.exp * 1000),
      userAgent: "node-test",
      ip: "127.0.0.1",
    },
  });

  return token;
}

export async function snapshotCounts() {
  const [users, roots, refreshTokens] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isRoot: true } }),
    prisma.refreshToken.count(),
  ]);

  return { users, roots, refreshTokens };
}

// Removes everything this run created, in FK-safe order.
//
// Audit rows are deleted too, scoped to this run's user ids. They are synthetic
// rows about accounts that no longer exist, and leaving them would put fake
// ADMIN_CREATED entries in the trail the thesis screenshots. This is the only
// place in the codebase that deletes from audit_logs, and it is deliberately
// scoped to ids this process created seconds earlier.
export async function cleanup() {
  const testUsers = await prisma.user.findMany({
    where: testUserFilter(),
    select: { id: true, isRoot: true, email: true },
  });

  // ⚠ NEVER DELETE A ROOT, whatever its address looks like.
  //
  // One test temporarily moves the root account's email to a test-prefixed one
  // to prove root is editable, and restores it in a `finally`. If that restore
  // were ever skipped — a crash, a kill between the two statements — the filter
  // above would match the real root admin and this function would delete the
  // system's only permanent administrator. The flag is the authority here, not
  // the address.
  const survivors = testUsers.filter((user) => user.isRoot);

  if (survivors.length > 0) {
    console.error(
      `[cleanup] REFUSED to delete a root account matching the test filter (${survivors
        .map((user) => user.email)
        .join(", ")}). Its email was not restored — run \`npm run seed\` to put it back.`
    );
  }

  const ids = testUsers.filter((user) => !user.isRoot).map((user) => user.id);

  if (ids.length === 0) {
    return { users: 0, refreshTokens: 0, auditRows: 0 };
  }

  const refreshTokens = await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  const auditRows = await prisma.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: ids } }, { actorUserId: { in: ids } }] },
  });
  const users = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  return {
    users: users.count,
    refreshTokens: refreshTokens.count,
    auditRows: auditRows.count,
  };
}
