# PSU Online Voting System — Module Breakdown & Roadmap

Three tracks: **Backend (B)**, **Frontend (F)**, **Thesis Book (T)**. Modules are IDed (B1, F2, T3…) so we can say "let's do B3 next." Build order is at the end.

---

## TRACK B — BACKEND
*Express + Prisma + Neon Postgres + JWT + Socket.io + Nodemailer*

### B0 — Project setup & infrastructure
- Repo + folder structure (routes / controllers / services / middleware / prisma / utils).
- Express scaffold, env config (`.env`), CORS, Helmet, JSON parsing.
- Prisma init, connect to **Neon**, run first migration from `schema.prisma`.
- Seed script: 6 faculties + one bootstrap ADMIN user.

### B1 — Auth (passwordless OTP → JWT)  ⭐ security heart
- `POST /auth/request-otp` — look up user by email, generate OTP, store **hash**, email it via Nodemailer.
- `POST /auth/verify-otp` — check hash + expiry + single-use + attempts, then issue **access + refresh** JWT.
- `POST /auth/refresh` — rotate refresh token, revoke old.
- `POST /auth/logout` — revoke refresh token.
- **Per-email rate limiting** + resend cooldown.
- Admin **manual fallback code** endpoint (issue OTP for a stuck student).
- Middleware: `requireAuth`, `requireRole(...)` (RBAC).

### B2 — Faculty management
- CRUD (admin). Usually just seed + read, but keep endpoints.

### B3 — Student management (admin only)
- Create one-by-one (email, studentId, faculty, name).
- **Bulk Excel upload** (parse with SheetJS/exceljs, validate rows, dedupe on studentId/email, report errors).
- List / search / update / deactivate. Admin-only guard.

### B3b — Admin & auditor account management (admin only) ✅ DONE
- `GET /users`, `POST /users`, `PATCH /users/:id`, `PATCH /users/:id/deactivate`, `PATCH /users/:id/reactivate`. Whole slice `requireRole('ADMIN')` — AUDITOR refused too.
- Creates ADMIN/AUDITOR only; rejects `studentId`/`facultyId`. Email unique across ALL users, so an address held by a student is a 409, never a promotion.
- `PATCH /users/:id` edits **identity only** (name, email). `role`, `isRoot` and `isActive` are rejected with a 400 rather than stripped — activation keeps its own endpoints so its guards cannot be bypassed by a field name. Editing root's name/email is allowed; root means "cannot be deactivated", not "frozen". An address change notifies the new address.
- **Root of trust:** the seeded admin carries `isRoot` and can never be deactivated. Enforced twice — a server guard, and a partial unique index `users(is_root) WHERE is_root` that makes "at most one root" a database invariant.
- Deactivate guards: root, self, last active ADMIN. Soft only — a hard delete would orphan the audit trail.
- **Touches B1:** `requireAuth` now re-reads the account on every request so deactivation bites immediately instead of at token expiry. Costs one indexed lookup per authenticated request; accepted knowingly.
- Passwordless notification email on creation (no OTP in it). A send failure never rolls back the account.
- 35 tests in `backend/tests/` (`npm test`), covering the role guard, create validation, identity edits, root immutability, self-deactivation, the last-admin floor and the deactivation enforcement path. Self-cleaning: the suite asserts the table is back to its starting counts before it exits.

### B4 — Election management (admin only)
- CRUD; type (FACULTY/UNIVERSITY), faculty scope, start/end window.
- Status lifecycle: DRAFT → SCHEDULED → OPEN → CLOSED → PUBLISHED.
- Guard: only OPEN + within window accepts votes.

### B5 — Candidate management (admin only)
- Register candidate = attach existing student to an election.
- Validate: faculty candidates must belong to that faculty; unique per election.

### B6 — Voting  ⭐ core integrity
- `GET /me/ballots` — return elections the logged-in student is eligible for (their faculty election + Gudoomiye), hide already-voted.
- `POST /elections/:id/vote` — eligibility check → **atomic transaction**: write `VoteReceipt` (blocks re-vote via unique constraint) + write `Vote` (no user link, UUID, hash-chained).
- Enforce window + one-vote server-side.

### B7 — Results (admin only)
- Aggregate tallies per candidate per election. **No public endpoint** — admin/commission only.
- Hash-chain integrity verification endpoint (prove ballots untampered).

### B8 — Real-time dashboard (Socket.io)
- ADMIN-only handshake (`io.use` + `verifyAccessToken`); admin joins an election "room".
- Server pushes **aggregate counts** (`results-update`), throttled to ≤ 1 emit per election per 5 s. A vote's only cost on the hot path is `notifyVote(electionId)` — one `Set.add`, no query, no await; the aggregate runs on the timer, not the vote.
- `election-status` on every transition; `/close` also pushes a final unthrottled tally.
- Aggregate-only — never per-voter data, and never a per-vote event.
- Tallies/turnout shared with B7 via `src/utils/tally.js` so the two can't diverge.

### B9 — Audit logging
- Writing happens across B1–B8 via `utils/audit.js` (student created, election opened, OTP issued, vote cast [participation only], results viewed).
- `GET /audit` — the viewer. **ADMIN + AUDITOR**; the one endpoint the AUDITOR role exists for.
- Filterable (action, actorUserId, entityType+entityId, from/to) and paginated, newest-first. Every filter is backed by an existing index.
- Actor enrichment only — `actorUserId` → `{id, name, email, role}`, with a system/anonymous actor for NULL. **Never joined to `Vote`**: a VOTE_CAST row shows participation and hour-floored time, never a choice.
- Reads of the log are deliberately not audited.

### B10 — Security hardening & testing
- Input validation (zod/express-validator), global error handler, request rate limits.
- Tests: one-vote enforcement, ballot secrecy (no join path), auth/OTP, RBAC, window enforcement.

---

## TRACK F — FRONTEND
*Next.js (App Router) — see Project-Context §11. **Not** Vite/CRA: this line said "React (Vite)" until B3b and was simply stale.*

### F0 — Project setup
- Next.js App Router scaffold, Tailwind v4, API client (`utils/axios.js`) with **access/refresh interceptor** (single-flight auto-refresh on 401).
- Auth state/context, role-based route guards. Mobile-first (low-end phones).
- **The access token is memory-only.** That is a locked F0 decision with a structural consequence for every screen: a server component holds no credential, so route parents cannot fetch on the user's behalf. Route `page.js` files stay thin and the client components fetch.

### F1 — Auth UI
- Email entry → OTP entry → session. Handle expiry, resend cooldown, errors.

### F2 — Student voter flow
- Dashboard: list eligible elections + status.
- Ballot screen (faculty + Gudoomiye), candidate cards, confirm-before-submit.
- "Vote recorded" + "already voted" states. (No results shown to students.)

### F3 — Admin: student management
- List/search, create-one form, **Excel upload** with validation feedback, edit/deactivate.

### F3b — Admin: access management (ADMIN & AUDITOR accounts) ✅ DONE
- Route `app/adminstration/users/page.js` + `components/adminstration/users-page.js` and `users-form.js`.
- Table of elevated accounts (name, email, role, status, `isRoot` badge), search and role filter, paginated. Create form with inline validation mirroring the server's rules; no password field, because there is no password.
- Per-row **Edit** (`users-edit-form.js`) for name and email, sharing the create form's field components and validation so the two cannot drift. No role or status control — those are refused server-side. Offered on every row including root and your own, since neither edit is a deactivation.
- Deactivate/reactivate behind the shared `<ConfirmDialog>`. UI guards mirror the server: the root row and your own row have the control disabled, with the reason on hover.
- A failed notification email renders as a **dismissible amber notice, not an error** — the account was created, someone just has to tell the holder.
- **Nav:** an "Access" entry in `ADMIN_NAV`, which is ADMIN-only by construction (see the F-track note below).

### F4 — Admin: faculty management
- Simple list + edit.

### F5 — Admin: election management
- Create/configure elections, set window, open/close, attach candidates.

### F6 — Admin: candidate management
- Add/remove candidates (with faculty-match validation feedback).

### F7 — Admin: real-time results dashboard  ⭐
- Socket.io client, live bar/pie charts (aggregate), per-election view, turnout.

### F8 — Admin: audit log viewer
- Filterable table of actions.

### F9 — Shared UI & polish
- Layout/nav, role-based menus, loading/error/empty states, responsiveness, accessibility.

---

## TRACK T — THESIS BOOK
*Follow PSU official guideline — min 60 pages, APA, A4, 10–12 pt*

### T0 — Preliminary pages
Title, Declaration, Approval, (Dedication/Acknowledgement optional), Abstract (≤250 words, past tense), TOC, List of Tables, List of Figures.

### T1 — Chapter 1: Introduction
Background · Problem Statement (idea/actual/gap) · General Objective · Specific Objectives · Research Questions · Significance · Scope · Operational Definitions · Conceptual Framework diagram.

### T2 — Chapter 2: Literature Review
Existing e-voting systems + related academic work, APA cited, ending with **summary + gap identification**.

### T3 — Chapter 3: Methodology (ADAPTED for software project)
Software development methodology (SDLC/prototyping) + **system analysis & design**: use-case diagrams, **ER diagram** (already drafted), DFD, architecture, security design. *If Eng Yasir approves:* add student **survey** + **usability/acceptance test** design.

### T4 — Chapter 4: Results / Findings & Discussion
Implementation walkthrough, screenshots, **testing results**, survey/usability data (if included), discussion vs literature.

### T5 — Chapter 5: Conclusions & Recommendations
Conclusion answers the research questions (no new findings); specific, directed recommendations; future work.

### T6 — References & Appendices
APA references · work plan/Gantt · instruments (questionnaire) · key code · screenshots.

---

## BUILD ORDER & DEPENDENCIES

**Phase 1 — Foundation:** B0 → B1 (auth). Nothing works without these.
**Phase 2 — Data & admin:** B2, B3 (+ F0, F1, F3) — get students in and logging in.
**Phase 3 — Elections:** B4, B5 → F5, F6.
**Phase 4 — The vote:** B6, B7 → F2 (voter flow). Core of the system.
**Phase 5 — Real-time + audit:** B8, B9 → F7, F8.
**Phase 6 — Hardening:** B10, F9.

*Built out of order:* **B3b / F3b** (admin & auditor accounts) landed after B9, because its audit actions and its `requireAuth` enforcement both depend on B1 and B9 already existing. It sits next to B3 in this list by subject, not by build date.

**Thesis runs in parallel, not after:**
- **T0–T3 can be written now / during the build** (intro, lit review, methodology + design diagrams come from work you're already doing).
- **T4 needs the working system** (screenshots, test results, usability data) → do it after Phase 4–5.
- **T5–T6 last.**

**Rule of thumb:** every backend module you finish generates thesis material — the ER diagram feeds T3, test results feed T4, screenshots feed T4. Capture as you go so Chapter 4 isn't a scramble at the end.
