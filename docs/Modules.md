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
*React (Vite)*

### F0 — Project setup
- React + Vite scaffold, router, Tailwind (or chosen CSS), API client with **access/refresh interceptor** (auto-refresh on 401).
- Auth state/context, role-based route guards. Mobile-first (low-end phones).

### F1 — Auth UI
- Email entry → OTP entry → session. Handle expiry, resend cooldown, errors.

### F2 — Student voter flow
- Dashboard: list eligible elections + status.
- Ballot screen (faculty + Gudoomiye), candidate cards, confirm-before-submit.
- "Vote recorded" + "already voted" states. (No results shown to students.)

### F3 — Admin: student management
- List/search, create-one form, **Excel upload** with validation feedback, edit/deactivate.

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

**Thesis runs in parallel, not after:**
- **T0–T3 can be written now / during the build** (intro, lit review, methodology + design diagrams come from work you're already doing).
- **T4 needs the working system** (screenshots, test results, usability data) → do it after Phase 4–5.
- **T5–T6 last.**

**Rule of thumb:** every backend module you finish generates thesis material — the ER diagram feeds T3, test results feed T4, screenshots feed T4. Capture as you go so Chapter 4 isn't a scramble at the end.
