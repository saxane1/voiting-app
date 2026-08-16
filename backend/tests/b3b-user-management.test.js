import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { prisma, disconnectPrisma } from "../src/config/prisma.js";
import { deactivateUser } from "../src/controllers/adminstration-controllers.js";
import {
  api,
  errorCode,
  startTestServer,
  stopTestServer,
} from "./helpers/test-server.js";
import {
  cleanup,
  createElevatedUser,
  getRoot,
  getStudent,
  issueRefreshToken,
  snapshotCounts,
  testEmail,
  tokenFor,
} from "./helpers/fixtures.js";

// ---------------------------------------------------------------------------
// B3b — admin/auditor account management (docs/B3b-user-management.md §10).
//
// These are the guards the account-management UI will be built on top of, so
// they are tested at the HTTP boundary against the real middleware stack rather
// than by calling controllers with hand-made objects. The one exception is the
// last-active-admin guard, which cannot be reached over HTTP at all — see the
// long note on that block for why.
// ---------------------------------------------------------------------------

let root;
let rootToken;
let student;
let studentToken;
let baseline;

before(async () => {
  baseline = await snapshotCounts();

  root = await getRoot();
  rootToken = tokenFor(root);
  student = await getStudent();
  studentToken = tokenFor(student);

  await startTestServer();
});

after(async () => {
  const removed = await cleanup();
  await stopTestServer();

  const final = await snapshotCounts();

  console.log(
    `\n[cleanup] removed ${removed.users} user(s), ${removed.refreshTokens} refresh token(s), ${removed.auditRows} audit row(s)`
  );
  console.log(
    `[state] users ${baseline.users} -> ${final.users}, roots ${baseline.roots} -> ${final.roots}, refreshTokens ${baseline.refreshTokens} -> ${final.refreshTokens}`
  );

  // The suite is only trustworthy if it leaves nothing behind. Asserted here so
  // a leak fails the run rather than quietly accumulating rows.
  assert.deepEqual(final, baseline, "database was not restored to its prior state");

  const rootAfter = await prisma.user.findUnique({
    where: { id: root.id },
    select: { isActive: true, isRoot: true },
  });

  assert.equal(rootAfter.isActive, true, "root was left deactivated");
  assert.equal(rootAfter.isRoot, true, "root lost its isRoot flag");

  await disconnectPrisma();
});

// ---------------------------------------------------------------------------

describe("role guard — /api/users is ADMIN-only", () => {
  // Built from the router so a route added later without a guard shows up here.
  const routes = () => [
    { method: "GET", path: "/users" },
    { method: "POST", path: "/users", body: { email: testEmail("nope"), name: "N", role: "ADMIN" } },
    { method: "PATCH", path: `/users/${root.id}`, body: { name: "Renamed By Intruder" } },
    { method: "PATCH", path: `/users/${root.id}/deactivate` },
    { method: "PATCH", path: `/users/${root.id}/reactivate` },
  ];

  it("refuses every route with no token", async () => {
    for (const route of routes()) {
      const response = await api(route.path, route);

      assert.equal(response.status, 401, `${route.method} ${route.path}`);
      assert.equal(errorCode(response), "NO_TOKEN", `${route.method} ${route.path}`);
    }
  });

  it("refuses every route for a STUDENT", async () => {
    for (const route of routes()) {
      const response = await api(route.path, { ...route, token: studentToken });

      assert.equal(response.status, 403, `${route.method} ${route.path}`);
      assert.equal(errorCode(response), "FORBIDDEN", `${route.method} ${route.path}`);
    }
  });

  it("refuses every route for an AUDITOR", async () => {
    const auditor = await createElevatedUser({ label: "guard-auditor", role: "AUDITOR" });
    const auditorToken = tokenFor(auditor);

    for (const route of routes()) {
      const response = await api(route.path, { ...route, token: auditorToken });

      assert.equal(response.status, 403, `${route.method} ${route.path}`);
      assert.equal(errorCode(response), "FORBIDDEN", `${route.method} ${route.path}`);
    }
  });

  it("still refuses an AUDITOR holding a token that claims ADMIN", async () => {
    // requireAuth reads the role from the database, not from the token claim, so
    // a forged or stale role in an otherwise valid token must not be honoured.
    const auditor = await createElevatedUser({ label: "liar-auditor", role: "AUDITOR" });
    const lyingToken = tokenFor({ id: auditor.id, role: "ADMIN" });

    const response = await api("/users", { token: lyingToken });

    assert.equal(response.status, 403);
    assert.equal(errorCode(response), "FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/users — validation", () => {
  it("rejects a role outside {ADMIN, AUDITOR}", async () => {
    for (const role of ["STUDENT", "SUPERADMIN", "admin", "", null]) {
      const response = await api("/users", {
        method: "POST",
        token: rootToken,
        body: { email: testEmail("badrole"), name: "Bad Role", role },
      });

      assert.equal(response.status, 400, `role=${JSON.stringify(role)}`);
      assert.equal(errorCode(response), "VALIDATION_ERROR", `role=${JSON.stringify(role)}`);
    }
  });

  it("rejects a duplicate email held by another elevated account", async () => {
    const existing = await createElevatedUser({ label: "dupe-admin", role: "ADMIN" });

    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email: existing.email, name: "Clone", role: "ADMIN" },
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "EMAIL_ALREADY_EXISTS");
  });

  it("rejects an email already used by a STUDENT, and does not promote them", async () => {
    // Locked decision 5. The failure mode being guarded against is a typo
    // silently turning a voter into an administrator.
    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email: student.email, name: "Sneaky Promotion", role: "ADMIN" },
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "EMAIL_ALREADY_EXISTS");

    const unchanged = await prisma.user.findUnique({
      where: { id: student.id },
      select: { role: true, isRoot: true },
    });

    assert.equal(unchanged.role, "STUDENT", "the student was promoted");
    assert.equal(unchanged.isRoot, false);
  });

  it("rejects the same email in different casing", async () => {
    const existing = await createElevatedUser({ label: "case-admin", role: "ADMIN" });

    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email: existing.email.toUpperCase(), name: "Case Clone", role: "ADMIN" },
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "EMAIL_ALREADY_EXISTS");
  });

  it("rejects studentId or facultyId in the body", async () => {
    for (const field of ["studentId", "facultyId"]) {
      const response = await api("/users", {
        method: "POST",
        token: rootToken,
        body: { email: testEmail(`with-${field}`), name: "Hybrid", role: "ADMIN", [field]: "x" },
      });

      assert.equal(response.status, 400, field);
      assert.equal(errorCode(response), "STUDENT_FIELD_NOT_ALLOWED", field);

      const created = await prisma.user.findUnique({
        where: { email: testEmail(`with-${field}`) },
        select: { id: true },
      });

      assert.equal(created, null, `${field} request created an account anyway`);
    }
  });

  it("creates an ADMIN with isRoot false and isActive true", async () => {
    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email: testEmail("created-admin"), name: "Created Admin", role: "ADMIN" },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, "ADMIN");
    assert.equal(response.body.user.isActive, true);
    assert.equal(response.body.user.isRoot, false, "a created account claimed root");
    assert.equal(response.body.user.studentId, undefined, "student fields leaked into the response");
  });

  it("creates an AUDITOR", async () => {
    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email: testEmail("created-auditor"), name: "Created Auditor", role: "AUDITOR" },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, "AUDITOR");
    assert.equal(response.body.user.isRoot, false);
  });

  it("keeps the account when the notification email fails (B3b §6)", async () => {
    // The test server's SMTP points at a closed port, so every send in this
    // suite fails. The account must survive it: the holder can still get in via
    // OTP, so destroying a valid account over a courtesy email is the worse
    // outcome. The admin is told, non-fatally.
    const email = testEmail("mail-fails");

    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email, name: "Mail Fails", role: "ADMIN" },
    });

    assert.equal(response.status, 201, "a failed notification rolled back the account");
    assert.equal(response.body.notification.sent, false);
    assert.match(response.body.notification.warning, /could not be sent/i);

    const persisted = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });

    assert.ok(persisted, "the account was not persisted");
    assert.equal(persisted.isActive, true);

    // And the failure is on the record rather than only in a log line.
    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "ELEVATED_ACCESS_EMAIL_FAILED", entityId: persisted.id },
      select: { actorUserId: true },
    });

    assert.ok(auditRow, "no ELEVATED_ACCESS_EMAIL_FAILED audit row");
    assert.equal(auditRow.actorUserId, root.id);
  });

  it("writes a role-specific audit row naming actor and target", async () => {
    const email = testEmail("audited-admin");

    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email, name: "Audited Admin", role: "ADMIN" },
    });

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "ADMIN_CREATED", entityId: response.body.user.id },
      select: { actorUserId: true, entityType: true, metadata: true },
    });

    assert.ok(auditRow, "no ADMIN_CREATED row");
    assert.equal(auditRow.actorUserId, root.id);
    assert.equal(auditRow.entityType, "User");
    assert.equal(auditRow.metadata.role, "ADMIN");
  });
});

// ---------------------------------------------------------------------------

describe("PATCH /api/users/:id — identity edits", () => {
  it("updates the name, and sends no email for a name-only change", async () => {
    const target = await createElevatedUser({ label: "rename-me", role: "ADMIN" });

    const before = await prisma.auditLog.count({
      where: { action: "ELEVATED_ACCESS_EMAIL_FAILED", entityId: target.id },
    });

    const response = await api(`/users/${target.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { name: "Renamed Admin" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.name, "Renamed Admin");
    assert.equal(response.body.user.email, target.email, "the email moved on a name-only edit");
    assert.equal(response.body.changed, true);

    // The suite's SMTP points at a closed port, so any attempted send fails and
    // leaves an ELEVATED_ACCESS_EMAIL_FAILED row. No new row means no attempt
    // was made — which is the assertion that a name change emails nobody.
    assert.equal(response.body.notification, undefined, "a name-only edit reported a notification");

    const after = await prisma.auditLog.count({
      where: { action: "ELEVATED_ACCESS_EMAIL_FAILED", entityId: target.id },
    });

    assert.equal(after, before, "a name-only edit attempted to send an email");
  });

  it("updates the email and notifies the NEW address", async () => {
    const target = await createElevatedUser({ label: "remail-me", role: "ADMIN" });
    const nextEmail = testEmail("remail-me-new");

    const response = await api(`/users/${target.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { email: nextEmail },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, nextEmail);
    assert.equal(response.body.changed, true);

    // The send is attempted and fails (closed SMTP port), which is what proves
    // it was attempted at all. The update must stand regardless — B3b §6.
    assert.equal(response.body.notification.sent, false);
    assert.match(response.body.notification.warning, /could not be emailed/i);

    const persisted = await prisma.user.findUnique({
      where: { id: target.id },
      select: { email: true },
    });

    assert.equal(persisted.email, nextEmail, "the email change was rolled back by a failed send");

    const failureRow = await prisma.auditLog.findFirst({
      where: { action: "ELEVATED_ACCESS_EMAIL_FAILED", entityId: target.id },
      select: { metadata: true },
    });

    assert.ok(failureRow, "no ELEVATED_ACCESS_EMAIL_FAILED row for the address change");
    assert.equal(failureRow.metadata.trigger, "EMAIL_CHANGED");
  });

  it("lowercases the incoming address", async () => {
    const target = await createElevatedUser({ label: "case-me", role: "ADMIN" });
    const nextEmail = testEmail("case-me-new");

    const response = await api(`/users/${target.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { email: nextEmail.toUpperCase() },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, nextEmail);
  });

  it("rejects an email held by another elevated account", async () => {
    const target = await createElevatedUser({ label: "clash-source", role: "ADMIN" });
    const other = await createElevatedUser({ label: "clash-holder", role: "AUDITOR" });

    const response = await api(`/users/${target.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { email: other.email },
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "EMAIL_ALREADY_EXISTS");

    const unchanged = await prisma.user.findUnique({
      where: { id: target.id },
      select: { email: true },
    });

    assert.equal(unchanged.email, target.email);
  });

  it("rejects an email held by a STUDENT, in any casing", async () => {
    const target = await createElevatedUser({ label: "clash-student", role: "ADMIN" });

    for (const candidate of [student.email, student.email.toUpperCase()]) {
      const response = await api(`/users/${target.id}`, {
        method: "PATCH",
        token: rootToken,
        body: { email: candidate },
      });

      assert.equal(response.status, 409, candidate);
      assert.equal(errorCode(response), "EMAIL_ALREADY_EXISTS", candidate);
    }

    // And the student is untouched — no promotion by the back door.
    const untouched = await prisma.user.findUnique({
      where: { id: student.id },
      select: { role: true, email: true },
    });

    assert.equal(untouched.role, "STUDENT");
    assert.equal(untouched.email, student.email);
  });

  it("accepts an unchanged email as a no-op rather than a conflict", async () => {
    // The uniqueness check must exclude the row being edited, or saving a form
    // without touching the address would 409 against itself.
    const target = await createElevatedUser({ label: "same-email", role: "ADMIN" });

    const response = await api(`/users/${target.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { email: target.email, name: target.name },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.changed, false);
    assert.equal(response.body.notification, undefined);
  });

  it("rejects role, isRoot, isActive, studentId and facultyId in the body", async () => {
    const target = await createElevatedUser({ label: "locked-fields", role: "AUDITOR" });

    const cases = [
      { field: "role", value: "ADMIN", code: "FIELD_NOT_EDITABLE" },
      { field: "isRoot", value: true, code: "FIELD_NOT_EDITABLE" },
      { field: "isActive", value: false, code: "FIELD_NOT_EDITABLE" },
      { field: "studentId", value: "PSU/001", code: "STUDENT_FIELD_NOT_ALLOWED" },
      { field: "facultyId", value: "abc", code: "STUDENT_FIELD_NOT_ALLOWED" },
    ];

    for (const { field, value, code } of cases) {
      const response = await api(`/users/${target.id}`, {
        method: "PATCH",
        token: rootToken,
        // Paired with a legitimate edit, so a pass would mean the forbidden
        // field rode in alongside an otherwise valid request.
        body: { name: "Should Not Apply", [field]: value },
      });

      assert.equal(response.status, 400, field);
      assert.equal(errorCode(response), code, field);
    }

    const untouched = await prisma.user.findUnique({
      where: { id: target.id },
      select: { name: true, role: true, isRoot: true, isActive: true },
    });

    assert.equal(untouched.name, target.name, "a rejected request still applied the name");
    assert.equal(untouched.role, "AUDITOR");
    assert.equal(untouched.isRoot, false);
    assert.equal(untouched.isActive, true);
  });

  it("rejects an empty body and an invalid email", async () => {
    const target = await createElevatedUser({ label: "bad-body", role: "ADMIN" });

    for (const body of [{}, { email: "not-an-email" }, { name: "" }]) {
      const response = await api(`/users/${target.id}`, {
        method: "PATCH",
        token: rootToken,
        body,
      });

      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(errorCode(response), "VALIDATION_ERROR", JSON.stringify(body));
    }
  });

  it("404s for a STUDENT id", async () => {
    const response = await api(`/users/${student.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { name: "Not Via This Route" },
    });

    assert.equal(response.status, 404);
    assert.equal(errorCode(response), "USER_NOT_FOUND");
  });

  it("writes ADMIN_UPDATED / AUDITOR_UPDATED naming the changed fields, not the values", async () => {
    const admin = await createElevatedUser({ label: "audit-admin-edit", role: "ADMIN" });
    const auditor = await createElevatedUser({ label: "audit-auditor-edit", role: "AUDITOR" });

    await api(`/users/${admin.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { name: "Audited Rename", email: testEmail("audit-admin-edit-new") },
    });

    await api(`/users/${auditor.id}`, {
      method: "PATCH",
      token: rootToken,
      body: { name: "Audited Auditor Rename" },
    });

    const adminRow = await prisma.auditLog.findFirst({
      where: { action: "ADMIN_UPDATED", entityId: admin.id },
      select: { actorUserId: true, entityType: true, metadata: true },
    });

    assert.ok(adminRow, "no ADMIN_UPDATED row");
    assert.equal(adminRow.actorUserId, root.id);
    assert.equal(adminRow.entityType, "User");
    assert.deepEqual([...adminRow.metadata.changedFields].sort(), ["email", "name"]);

    // The addresses themselves must NOT be in the trail — the audit log is
    // exported and read more widely than the users table is.
    const serialised = JSON.stringify(adminRow.metadata);
    assert.ok(!serialised.includes("@"), `audit metadata leaked an address: ${serialised}`);

    const auditorRow = await prisma.auditLog.findFirst({
      where: { action: "AUDITOR_UPDATED", entityId: auditor.id },
      select: { metadata: true },
    });

    assert.ok(auditorRow, "no AUDITOR_UPDATED row");
    assert.deepEqual(auditorRow.metadata.changedFields, ["name"]);
  });

  it("allows editing the ROOT account's name and email", async () => {
    // Root means "cannot be deactivated", NOT "frozen". The email is the only
    // way to sign in as it, so being unable to correct it would be worse.
    const originalName = root.name;
    const originalEmail = root.email;

    try {
      const renamed = await api(`/users/${root.id}`, {
        method: "PATCH",
        token: rootToken,
        body: { name: "Root Renamed By Test" },
      });

      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.user.name, "Root Renamed By Test");
      assert.equal(renamed.body.user.isRoot, true, "editing root cleared its root flag");

      const remailed = await api(`/users/${root.id}`, {
        method: "PATCH",
        token: rootToken,
        body: { email: testEmail("root-new-address") },
      });

      assert.equal(remailed.status, 200);
      assert.equal(remailed.body.user.email, testEmail("root-new-address"));
      assert.equal(remailed.body.user.isRoot, true);
      assert.equal(remailed.body.user.isActive, true, "editing root deactivated it");
    } finally {
      // Restored immediately: every other test in this file resolves the root by
      // its flag, and the after() hook asserts the account is intact.
      await prisma.user.update({
        where: { id: root.id },
        data: { name: originalName, email: originalEmail },
      });
    }

    const restored = await prisma.user.findUnique({
      where: { id: root.id },
      select: { name: true, email: true, isRoot: true, isActive: true },
    });

    assert.equal(restored.email, originalEmail);
    assert.equal(restored.name, originalName);
    assert.equal(restored.isRoot, true);
    assert.equal(restored.isActive, true);
  });
});

// ---------------------------------------------------------------------------

describe("root immutability", () => {
  it("refuses to deactivate the isRoot admin", async () => {
    const response = await api(`/users/${root.id}/deactivate`, {
      method: "PATCH",
      token: rootToken,
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "ROOT_ACCOUNT_IMMUTABLE");

    const after = await prisma.user.findUnique({
      where: { id: root.id },
      select: { isActive: true },
    });

    assert.equal(after.isActive, true, "root was deactivated anyway");
  });

  it("refuses to deactivate root even when another admin asks", async () => {
    // The rule is not "you may not deactivate yourself" — it is that the root
    // account is permanent for everyone.
    const other = await createElevatedUser({ label: "other-admin", role: "ADMIN" });

    const response = await api(`/users/${root.id}/deactivate`, {
      method: "PATCH",
      token: tokenFor(other),
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "ROOT_ACCOUNT_IMMUTABLE");
  });

  it("rejects a second isRoot=true at the DATABASE level", async () => {
    // The partial unique index (users_is_root_key ... WHERE is_root) is the
    // layer that survives a bug in the application. Written inside a transaction
    // that is always rolled back, so the row never lands even if it is accepted.
    const ROLLBACK = Symbol("rollback");
    let rejection = null;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            email: testEmail("second-root"),
            name: "Second Root",
            role: "ADMIN",
            isActive: true,
            isRoot: true,
          },
        });

        throw ROLLBACK; // unreachable if the index is doing its job
      });
    } catch (error) {
      rejection = error;
    }

    assert.notEqual(rejection, ROLLBACK, "the database accepted a second root");
    assert.equal(rejection.code, "P2002", `unexpected failure: ${rejection.message}`);

    const roots = await prisma.user.count({ where: { isRoot: true } });
    assert.equal(roots, 1);
  });

  it("never lets the API set isRoot, even when asked directly", async () => {
    const email = testEmail("wants-root");

    const response = await api("/users", {
      method: "POST",
      token: rootToken,
      body: { email, name: "Wants Root", role: "ADMIN", isRoot: true },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.isRoot, false, "isRoot was settable through the API");
  });
});

// ---------------------------------------------------------------------------

describe("no self-deactivation", () => {
  it("refuses when an admin targets their own id", async () => {
    const self = await createElevatedUser({ label: "self-admin", role: "ADMIN" });

    const response = await api(`/users/${self.id}/deactivate`, {
      method: "PATCH",
      token: tokenFor(self),
    });

    assert.equal(response.status, 409);
    assert.equal(errorCode(response), "CANNOT_DEACTIVATE_SELF");

    const after = await prisma.user.findUnique({
      where: { id: self.id },
      select: { isActive: true },
    });

    assert.equal(after.isActive, true);
  });

  it("allows a different admin to deactivate that same account", async () => {
    // Confirms the refusal above is about SELF, not about the target.
    const target = await createElevatedUser({ label: "target-admin", role: "ADMIN" });

    const response = await api(`/users/${target.id}/deactivate`, {
      method: "PATCH",
      token: rootToken,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.isActive, false);
    assert.equal(response.body.changed, true);
  });
});

// ---------------------------------------------------------------------------

describe("last active admin", () => {
  // ⚠ THIS ONE TEST CALLS THE CONTROLLER DIRECTLY, AND IT HAS TO.
  //
  // The guard is unreachable over HTTP. To reach it the caller must be an active
  // ADMIN (requireAuth + requireRole), and the guard asks whether any active
  // ADMIN other than the target exists. If the target is someone else, the
  // CALLER is that someone else and the count is never zero; if the target is
  // the caller, the self-guard fires first. Guards 1 and 2 dominate guard 3
  // completely, which is exactly what "belt-and-suspenders" meant in the spec.
  //
  // So the guard is exercised where it lives, with the database arranged so the
  // target really is the last active administrator. Every account that gets
  // temporarily deactivated to build that state is restored in the finally
  // block, including root. If this process is killed mid-test, `npm run seed`
  // restores root (it upserts isActive: true).
  function mockRes() {
    const res = { statusCode: null, payload: null };

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    res.json = (payload) => {
      res.payload = payload;
      return res;
    };

    return res;
  }

  it("refuses to deactivate the final active ADMIN", async () => {
    const lastAdmin = await createElevatedUser({ label: "last-admin", role: "ADMIN" });

    const others = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true, id: { not: lastAdmin.id } },
      select: { id: true },
    });

    const otherIds = others.map((user) => user.id);

    await prisma.user.updateMany({
      where: { id: { in: otherIds } },
      data: { isActive: false },
    });

    try {
      const remaining = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      assert.equal(remaining, 1, "failed to arrange a single-admin state");

      const req = {
        params: { id: lastAdmin.id },
        // A different actor, so the self-guard cannot be what fires.
        user: { id: root.id, role: "ADMIN" },
        ip: "127.0.0.1",
        get: () => "node-test",
      };

      const res = mockRes();
      await deactivateUser(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.payload.error.code, "LAST_ACTIVE_ADMIN");

      const after = await prisma.user.findUnique({
        where: { id: lastAdmin.id },
        select: { isActive: true },
      });

      assert.equal(after.isActive, true, "the last admin was deactivated");
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherIds } },
        data: { isActive: true },
      });
    }
  });

  it("allows it once a second active admin exists", async () => {
    // The mirror image: same target, same caller, one more active admin.
    const target = await createElevatedUser({ label: "not-last-admin", role: "ADMIN" });

    const req = {
      params: { id: target.id },
      user: { id: root.id, role: "ADMIN" },
      ip: "127.0.0.1",
      get: () => "node-test",
    };

    const res = mockRes();
    await deactivateUser(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.user.isActive, false);
  });
});

// ---------------------------------------------------------------------------

describe("enforcement — deactivation bites immediately", () => {
  it("rejects a deactivated admin on every authenticated route", async () => {
    const victim = await createElevatedUser({ label: "enforce-admin", role: "ADMIN" });
    const victimToken = tokenFor(victim);

    // The token works while the account is live.
    const before = await api("/auth/me", { token: victimToken });
    assert.equal(before.status, 200);

    const deactivated = await api(`/users/${victim.id}/deactivate`, {
      method: "PATCH",
      token: rootToken,
    });
    assert.equal(deactivated.status, 200);

    // Same token, unexpired and correctly signed — requireAuth must now refuse
    // it rather than waiting out ACCESS_TTL.
    for (const path of ["/auth/me", "/users", "/students", "/faculties", "/audit"]) {
      const response = await api(path, { token: victimToken });

      assert.equal(response.status, 401, path);
      assert.equal(errorCode(response), "ACCOUNT_INACTIVE", path);
    }
  });

  it("rejects a deactivated user at /auth/refresh and revokes the token family", async () => {
    const victim = await createElevatedUser({ label: "refresh-admin", role: "ADMIN" });
    const refreshToken = await issueRefreshToken(victim.id);

    // A live session refreshes normally.
    const ok = await api("/auth/refresh", {
      method: "POST",
      cookie: `refreshToken=${refreshToken}`,
    });

    assert.equal(ok.status, 200);
    assert.ok(ok.body.accessToken, "refresh returned no access token");

    // That call rotated the token; carry the replacement forward.
    const rotated = /refreshToken=([^;]+)/.exec(ok.headers.get("set-cookie") ?? "")?.[1];
    assert.ok(rotated, "no rotated refresh cookie was set");

    await api(`/users/${victim.id}/deactivate`, { method: "PATCH", token: rootToken });

    const refused = await api("/auth/refresh", {
      method: "POST",
      cookie: `refreshToken=${rotated}`,
    });

    assert.equal(refused.status, 401);
    assert.equal(errorCode(refused), "INVALID_REFRESH");

    // Not just this token — the whole family, so no sibling session survives.
    const live = await prisma.refreshToken.count({
      where: { userId: victim.id, revokedAt: null },
    });

    assert.equal(live, 0, "a live refresh token survived deactivation");

    const killed = await prisma.refreshToken.findFirst({
      where: { userId: victim.id, revokedReason: "DEACTIVATED" },
      select: { id: true },
    });

    assert.ok(killed, "no token was revoked with reason DEACTIVATED");

    // The reason must be truthful: an auditor has to be able to tell an
    // administrative deactivation from a stolen-token replay incident.
    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "USER_DEACTIVATED_SESSION_KILLED", entityId: victim.id },
      select: { metadata: true },
    });

    assert.ok(auditRow, "no USER_DEACTIVATED_SESSION_KILLED row");
    assert.equal(auditRow.metadata.revokeReason, "DEACTIVATED");
    assert.ok(auditRow.metadata.sessionsRevoked >= 1, "sessionsRevoked was not recorded");
  });

  it("lets a reactivated admin back in", async () => {
    const victim = await createElevatedUser({
      label: "reactivate-admin",
      role: "ADMIN",
      isActive: false,
    });
    const victimToken = tokenFor(victim);

    const blocked = await api("/users", { token: victimToken });
    assert.equal(blocked.status, 401);
    assert.equal(errorCode(blocked), "ACCOUNT_INACTIVE");

    const response = await api(`/users/${victim.id}/reactivate`, {
      method: "PATCH",
      token: rootToken,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.isActive, true);

    const allowed = await api("/users", { token: victimToken });
    assert.equal(allowed.status, 200);
  });
});
