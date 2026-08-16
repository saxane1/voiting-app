# PSU Online Voting System — B3b: Admin & Auditor Account Management

> **Handoff spec for Claude Code.** Read `docs/Project-Context.md` first (source of truth), then `CLAUDE.md`, `prisma/schema.prisma`, `docs/API-Map.md`, `docs/Modules.md`. This spec fills the optional **B3b** stub in API-Map (`POST /users`). Implement to the locked decisions; do not deviate without asking.

---

## 0. Purpose

Today ADMIN and AUDITOR accounts can only be created by the seed script or by hand in the DB. This adds an admin-only screen + API to create and manage elevated (non-student) accounts. Because auth is **passwordless OTP**, no password is ever provisioned — the account is created with an email + role, and the holder logs in through the normal OTP flow.

**In scope:** create ADMIN/AUDITOR, list them, deactivate/reactivate, notification email on creation.
**Out of scope (future work — do NOT build):** role editing / promote-demote, self-service registration, creating STUDENT accounts (that stays in B3).

---

## 1. Locked decisions for this module

1. **This route creates ADMIN/AUDITOR only.** Reject any other role. Reject `studentId`/`facultyId` in the body — elevated accounts have neither. Student creation stays in B3.
2. **RBAC:** the entire slice is `requireRole('ADMIN')`. AUDITOR is read-only across the system and must be refused here.
3. **Flat admin model is preserved.** Any ADMIN may create any ADMIN/AUDITOR. Do **not** invent a super-admin tier — the locked RBAC is STUDENT / ADMIN / AUDITOR only.
4. **Seed admin = permanent root of trust.** The bootstrap admin is flagged `isRoot = true` and can **never** be deactivated, by anyone, including itself. It is the guaranteed always-present anchor so the system can never be locked out.
5. **Email is the login identity → globally unique.** If the email already exists (student OR elevated), **reject** the request. Never silently promote a student into an admin.
6. **Soft deactivate only — never hard-delete.** The audit log references these users as actors; deleting one orphans the trail. Match the existing student `isActive` pattern.
7. **Notification email on creation** (see §5). Passwordless — the email tells them they have access and how to log in; it does **not** contain an OTP.
8. **Audit every action loudly** (see §6).

---

## 2. Prerequisite — schema check (do this FIRST, confirm before coding)

Read `prisma/schema.prisma` and confirm the `User` model supports this. Required state:

- `role` enum includes `STUDENT`, `ADMIN`, `AUDITOR`.
- `studentId` and `facultyId` are **nullable** (elevated accounts have neither).
- `isActive Boolean @default(true)` exists.
- **Add if missing:** `isRoot Boolean @default(false)` — marks the seed admin as the permanent trust anchor.

If any of these require a change (especially making `studentId`/`facultyId` nullable, or adding `isRoot`), **plan the migration and confirm with me before running it** — a nullability change on an existing column is not a silent edit. If the model already satisfies all of the above except `isRoot`, adding `isRoot` is a clean additive migration.

**Report what you find in the schema before writing any code.**

---

## 3. Seed script change

- The bootstrap admin is created with `isRoot: true`.
- Its email comes from an env var — add **`SEED_ADMIN_EMAIL`** (and reuse existing bootstrap-admin env if present). Document it in `.env.example`.
- Seed must be **idempotent** (upsert on email) so re-running never creates a duplicate root.

---

## 4. Backend — `/api/users` slice

New route file (kebab-case), controllers in **`adminstration-controllers.js`** (match the existing spelling so imports resolve), guarded by `requireRole('ADMIN')`. ES modules only.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/users` | ADMIN | List elevated accounts (`role != STUDENT`). Returns id, name, email, role, isActive, isRoot. Supports `?page`,`?limit`,`?search`,`?role`. |
| POST | `/api/users` | ADMIN | Create `{ email, name, role }` where role ∈ {ADMIN, AUDITOR}. Validate → dedupe email → create `isActive:true, isRoot:false` → send notification email → audit. Returns the created user (no secrets). |
| PATCH | `/api/users/:id/deactivate` | ADMIN | Soft-deactivate. Guards below. Audit. |
| PATCH | `/api/users/:id/reactivate` | ADMIN | Un-deactivate (include this — deactivate without a way back is a trap). Audit. |

**Validation on POST** (zod/express-validator, per B10 convention):
- `email` valid + unique across ALL users → 409 if taken.
- `name` non-empty.
- `role` ∈ {ADMIN, AUDITOR} → 400 otherwise.
- Reject presence of `studentId` / `facultyId` in body → 400.

**Deactivate guards (all server-side, return clear errors):**
- Target `isRoot === true` → **refuse** (409/403). The seed admin is permanent.
- Target is the requester (self) → **refuse**.
- Target is the **last active ADMIN** → **refuse** (count active admins server-side first). Belt-and-suspenders with the root rule.
- Otherwise set `isActive:false`.

---

## 5. Enforcement dependency (this makes deactivation actually bite)

Deactivation is meaningless if a deactivated admin keeps working until their token expires. Confirm / wire:

- `requireAuth` middleware checks `user.isActive` on every request → deactivated users are rejected even with a valid access token.
- `POST /auth/refresh` rejects deactivated users (no new access token issued).
- Access-token TTL stays short (already locked in B1) so the revocation window is small.

If `requireAuth` does not currently check `isActive`, add it — note it in your report since it touches B1.

---

## 6. Notification email

Add a template to `utils/mailer.js` (reuse the existing Nodemailer + transactional SMTP transport from B1 — no new mail dependency).

- **Trigger:** after a successful `POST /users`.
- **Content:** informs them they've been granted ADMIN/AUDITOR access to the PSU Voting System, states their login email, and links to the login page. **Passwordless** — instruct them to log in with their email and request a one-time code. **Do NOT include an OTP in this email.**
- **Failure handling:** match how B1 handles OTP-email failures. The account is already created and valid (they can still get in via OTP or the admin fallback code), so a send failure must **not** roll back the account. Log the failure and record it (e.g. an audit note); surface a non-fatal warning to the admin UI.

---

## 7. Audit actions (B9)

Add via `utils/audit.js`, each with actor (requester) + target user id + role:

- `ADMIN_CREATED`, `AUDITOR_CREATED`
- `ADMIN_DEACTIVATED`, `AUDITOR_DEACTIVATED`
- `ADMIN_REACTIVATED`, `AUDITOR_REACTIVATED`

These surface in the existing `GET /audit` viewer with no special handling (standard actor enrichment). Never touch the `Vote` table.

---

## 8. Frontend — Next.js App Router

Follow the pattern in Project-Context §11b (route `page.js` = clean server parent doing fetch/auth; UI split into small client components under `components/<feature>/`). Use the existing axios instance, react-query, and react-hot-toast.

- **Route:** `app/adminstration/users/page.js` — server parent: auth-guard (ADMIN only; redirect/403 otherwise), fetch initial list.
- **Components under `components/adminstration/`:**
  - `users-page.js` (client) — table of elevated accounts: name, email, role, status, `isRoot` badge. react-query for data.
  - `users-form.js` (client) — create form: email, name, role select (ADMIN/AUDITOR). Inline validation feedback; success/error toasts.
  - Deactivate/reactivate action with a confirm step.
- **UI guards mirroring the server:** disable/hide deactivate on the `isRoot` account and on the current user's own row. (Server is still the source of truth — UI guards are convenience only.)
- **Nav:** show the "Users" / "Access management" menu entry to ADMIN only. AUDITOR must not see it.

---

## 9. Doc updates (do these as part of the task)

- **`docs/API-Map.md`** — add a `## Users (module B3b)` section with the table from §4. Bump the endpoint count note.
- **`docs/Modules.md`** — mark B3b as specced/done under Track B; add matching frontend item under Track F. **Housekeeping:** Track F currently says "React (Vite)" but the locked stack (Project-Context §11) is **Next.js App Router** — reconcile that line while you're in the file.

---

## 10. Tests (B10 scope — write these)

- Role guard: STUDENT and AUDITOR are refused on every `/users` route.
- Create: rejects role outside {ADMIN, AUDITOR}; rejects duplicate email; rejects `studentId`/`facultyId` in body.
- Root immutability: deactivating the `isRoot` admin is refused.
- No self-deactivation.
- Last-admin guard: cannot deactivate the final active ADMIN.
- Enforcement: a deactivated admin is rejected by `requireAuth` and by `/auth/refresh`.

---

## 11. Thesis material generated here (capture as you go)

- **Chapter 3 (design):** separation of duties, least privilege, and a documented **root of trust** (seed admin) — a short paragraph each, plus the RBAC matrix updated to show who can manage accounts.
- **Chapter 4:** screenshot the user-management screen and an audit-log row showing `ADMIN_CREATED`, as evidence of privileged-action logging.

---

## 12. Suggested build order for this module

1. §2 schema check → report findings → (migration if confirmed).
2. §3 seed `isRoot`.
3. §4 backend slice + guards.
4. §5 wire `isActive` enforcement (if not already).
5. §6 notification email.
6. §7 audit actions.
7. §8 frontend route + components.
8. §9 doc updates.
9. §10 tests.

**Gate:** do not start step 1's migration or any coding until the §2 schema findings are reported and the migration (if any) is confirmed.