# PSU Online Voting System — Project Context

> Persistent context for this Claude Project. Read this at the start of every chat before helping with tasks. Paste this into the project's custom instructions **and** keep it as an uploaded knowledge file.

---

## 1. Snapshot

Final-year **thesis project**: a secure, **production-ready** web-based **online voting system for Puntland State University (PSU)**. Students vote remotely — from anywhere — during official election periods, instead of traveling to campus. Deliverable = **working production system + written thesis book**.

**My role:** student / developer / thesis author.
**What I need from Claude:** planning, requirements, system design (diagrams + database), implementation (code), testing, deployment, and writing the thesis. Keep the Somali university context in mind.

---

## 2. The institution & election model

PSU has **6 faculties**. Two election levels:

**A. Faculty Leadership Elections (6 separate ballots)**
- Each faculty elects **one Faculty Leader**.
- Only students **enrolled in that faculty** may vote in that faculty's ballot.

**B. University Leadership Election (1 university-wide ballot)**
- **All** PSU students vote.
- They elect a single **University Leader (Gudoomiye)**. *(No vice-leader.)*

**Core scoping rule:** a student's faculty determines which faculty ballot they see; every student sees the Gudoomiye ballot.

---

## 3. Problem statement

Students currently must physically come to campus to vote — costing **transport money and time**, and making elections **expensive, slow, and labor-intensive**. The system removes travel, lets students vote securely from anywhere during the open window, and produces fast, accurate, tamper-resistant results.

---

## 4. Objectives

- Enable eligible students to vote **remotely** during a defined election window.
- Enforce **one person, one vote** per election, server-side.
- Correctly **scope** faculty ballots; open the Gudoomiye ballot to all.
- Keep votes **secret** yet **auditable** (prove a student voted without exposing how).
- Give admins / election commission a **live real-time results dashboard**.
- Reduce the **cost, time, and effort** of elections.

---

## 5. Users / roles

- **Voter (Student):** account **created by admin** (no self-registration). Tied to a student ID and faculty.
- **Candidate:** a student running for a faculty seat or for Gudoomiye.
- **Election Admin / Commission:** manages students, candidates, elections; opens/closes voting; **watches live real-time results**.
- **(Optional) Auditor:** read-only logs / audit trail.

RBAC across all roles.

---

## 6. Authentication (LOCKED — passwordless OTP → JWT)

- **No passwords, no device-locking.** (Device-locking rejected: unreliable in browsers, high lockout/support cost on election day.)
- Student enters **email** → single-use **OTP emailed** → enters OTP → logged in.
- On OTP success, issue **JWT access + refresh tokens** (short access, rotating refresh).
- **OTP rules:** single-use, short expiry (~5–10 min), **rate-limited per EMAIL ADDRESS, not per IP** (campus shares wifi/NAT — per-IP limits would lock everyone out), resend cooldown.
- **Email delivery:** **Nodemailer** as the client, pointed at a real SMTP service. Avoid Gmail SMTP for production (throttles at election volume) — use a transactional SMTP (Brevo/SendGrid/SES). Nodemailer + transactional SMTP is the combination.
- **Availability fallback:** admin can **manually issue a one-time login code** for a student stuck on email, so no one is disenfranchised by an email hiccup.
- **Election-day load:** use a **wide voting window** (e.g. 8am–6pm) so logins spread out.

---

## 7. Student management (admin-only)

- Admin creates students; stored fields: **email, studentId, faculty, name**.
- Two creation modes: **one-by-one** form, and **bulk upload via Excel** (parse with SheetJS/`xlsx` or `exceljs`; validate + dedupe on studentId/email).
- Student records **updatable only by admin**.

---

## 8. Ballot secrecy design (LOCKED)

Two records, **never linkable**, written in one DB transaction:

1. **`VoteReceipt` (participation):** `studentId + electionId + votedAt`, UNIQUE on `(studentId, electionId)`. Blocks double-voting. Knows *that* you voted, never *for whom*.
2. **`Vote` (ballot):** `electionId + candidateId`, **no foreign key to the student**. Knows the choice, never the chooser.

No join column exists between them → even a full-DB insider can't reveal how anyone voted.

**Anti-correlation hardening:**
- `Vote` primary key is a **random UUID** (not sequential) — removes ordering.
- `Vote` stores **no precise timestamp** (nothing, or just election day) — removes timing correlation.

**Tamper-evidence (optional, thesis bonus):** chain each `Vote` with an integrity hash `SHA256(prevHash + electionId + candidateId)` → editing/inserting/deleting a ballot breaks the chain and is detectable.

**Live dashboard reads AGGREGATE counts only** — never individual ballots or per-voter data.

*(Deliberately NOT using homomorphic encryption / blind signatures — overkill and undefendable for a solo student build.)*

---

## 9. Functional requirements (elections)

- **Candidates are registered directly by the admin** (no student self-nomination). A candidate is an existing student user attached to an election; for faculty elections the candidate must belong to that faculty.
- Admin creates elections: type (faculty/Gudoomiye), candidates, **open/close date-time window**.
- Ballots scoped to student's faculty (+ Gudoomiye ballot for all).
- Vote casting with server-side **double-voting prevention** (via `VoteReceipt` unique constraint).
- **Real-time results dashboard** (Socket.io) for admins during the open election.
- **Results are NOT shown to students/public in the app.** Only admins/commission see results (live dashboard + final). The **university announces the official results** outside the system. So: no public results page.
- Audit trail / activity logs.

---

## 10. Non-functional requirements

- Passwordless OTP hardening (see §6); JWT access+refresh with refresh rotation/revocation.
- RBAC; one-vote integrity in DB + server logic (not just UI).
- Time-bound elections; votes only inside the open window.
- Web security: HTTPS, input validation, SQL-injection/XSS/CSRF protection.
- Usability on low-end phones / weak connections.

---

## 11. Tech stack (LOCKED — reflects actual installed packages)

**Backend — Express (plain JS, ES modules `"type":"module"`)**
- **PostgreSQL** on **Neon** (pooled connection).
- **Prisma** via **`@prisma/adapter-pg` + `pg`** driver adapter (good for Neon).
- **express** (v5), **jsonwebtoken**, **bcryptjs** (hash OTP + tokens), **cookie-parser** (httpOnly refresh cookie), **cors**, **dotenv**, **express-rate-limit**, **morgan** (logging), **nodemailer**, **socket.io**, **date-fns**. Dev: **nodemon**. Entry: `server.js`.
- **⚠ Still to add for backend:** an Excel parser (**`xlsx`** or **`exceljs`**) **+ `multer`** (multipart) for B3 bulk student upload; optionally **`zod`/`express-validator`** for validation and a test runner.
- **⚠ Rate-limit caveat:** `express-rate-limit` keys on **IP by default**. For OTP, add a **custom `keyGenerator` on the request-otp route that keys on the email** (campus shares NAT) — preserves the per-email requirement.
- **Nodemailer** needs an SMTP behind it; for burst volume use transactional SMTP (Brevo/SendGrid/SES), not Gmail.

**Frontend — Next.js (App Router), NOT Vite/CRA**
- **next** (v16), **react** (v19), **react-dom**.
- **@tanstack/react-query** + **axios** (instance in `utils/axios.js`) for data fetching.
- **socket.io-client** (realtime), **recharts** (results charts), **react-hot-toast** (toasts), **framer-motion** (animation), **lucide-react** (icons).
- **Tailwind CSS v4** (`@tailwindcss/postcss`), eslint.

**Hosting — persistent Node host (WebSockets work):** Railway or AWS Lightsail. Neon holds the DB.
- ⚠ If AWS: backend on **Lightsail/EC2/ECS** (persistent). **Amplify alone is serverless** → same WebSocket wall as Vercel; use it only for the Next.js frontend if at all.

---

## 11b. Coding conventions & structure (MY STYLE — follow exactly)

**Naming**
- **Files & folders: lowercase kebab-case** — e.g. `auth-controllers.js`, `election-detail/`, `users-form.js`. **Never** PascalCase or camelCase for file/folder names.
- **Function names: camelCase.**
- Backend uses **ES modules** — `import`/`export`, never `require`.
- Preference: clean, flexible, manageable structure.
- Note: existing folders are spelled **`adminstration`** (match this in code so imports line up). *(Optional: rename to `administration` now while cheap, since it's a visible typo in a thesis repo.)*

**Backend layout (layered — controllers/routes/middleware/utils, NOT feature-modules)**
```
backend/
  prisma/                 schema.prisma, migrations, seed
  prisma.config.js
  server.js               entry ("main")
  src/
    config/              env, prisma client, pg adapter, socket setup
    controllers/         auth-controllers.js, student-controllers.js,
                         election-controllers.js, candidate-controllers.js,
                         faculty-controllers.js, adminstration-controllers.js
    middleware/          auth, role, rate-limit, error-handler, validate
    routes/              one route file per resource
    socket/              socket.io handlers
    utils/               otp, jwt, hashing, mailer, excel
  .env
```
Controllers hold request logic, routes wire endpoints, shared helpers in utils. No separate services layer unless it grows.

**Frontend layout (Next.js App Router)**
```
frontend/src/
  app/
    <feature>/page.js    ROUTE PARENT = server component; does server-side
                         data fetching / auth; keep it CLEAN
    layout.js  page.js  globals.css
  components/<feature>/   UI split into small files by feature
                         (e.g. adminstration/users-form.js, users-page.js)
  context/               React context providers
  utils/axios.js         axios instance
```
**Pattern (my habit):** the route `page.js` is the **server-side parent** that composes; the actual UI is split into small client-component files under `components/<feature>/`. Keeps routes clean and logic separated.

⚠ **The parent composes — it does NOT fetch.** This originally read "fetches data and composes", which the locked F0 auth model makes impossible: the access token lives in **browser memory only**, so a server component has no credential to call the API with. Every authenticated read goes through the client `utils/axios.js` instance, which is also what gives it the single-flight refresh and the 401 retry. A route parent that fetched would need a second, weaker auth path invented just for it. So `page.js` stays thin: `metadata` + render the client component. See the resolved-decisions log.

---

## 12. Thesis document — PSU OFFICIAL GUIDELINE (must follow exactly)

Source: *PSU Thesis Guideline for Undergraduate Students* (Galkaio Campus, Supervisor: Eng Yasir A. Mohamed). Minimum **60 pages**. APA referencing.

**Formatting**
- Standard font, **10–12 pt**, consistent throughout. **A4** portrait (landscape allowed for wide tables/figures).
- Margins: **min 0.5 inch** all sides. Spacing: single, 1.5, or double (consistent).
- Title page = page 1 but **not printed**. Preliminary pages in **lowercase roman numerals**; body in **Arabic numerals** from Chapter 1.
- Chapters: Roman or Arabic numerals. Tables/figures numbered by chapter (Table 4.1, Figure 4.2). Sub-topics numbered 1.1, 1.1.1.
- Tables/figures placed near first mention; captions consistent.

**Preliminary pages (in order):** Title page (unnumbered) → Declaration (essential, originality + signature) → Approval page (supervisor sign + credentials) → Dedication (optional) → Acknowledgement (optional) → Abstract (≤250 words, past tense: background, objectives, methodology, results, conclusion, recommendations) → Table of Contents → List of Tables → List of Figures.

**Body chapters:**
1. **Introduction** — 1.1 Background · 1.2 Problem Statement (idea, actual, gap) · 1.3 General Objective (one, matches title) · 1.4 Specific Objectives · 1.5 Research Questions (numbered, phrased as questions) · 1.6 Hypothesis (where applicable) · 1.7 Justification/Significance (who benefits) · 1.8 Scope (content/geographical/time) · 1.9 Operational Definitions · 1.10 Conceptual Framework (diagram). *Report adds limitations & delimitations.*
2. **Literature Review** — current sources, APA, ends with **summary + gap identification**.
3. **Methodology** — research design, population, study area, sample size, sampling procedure, data collection instrument + procedure, data analysis, inclusion/exclusion, quality control, ethical consideration.
4. **Results / Findings & Discussion** — tables/figures + interpretation; compare with literature.
5. **Conclusions & Recommendations** — conclusion answers the research questions (no new findings); recommendations specific and directed.

**After Ch5:** References (APA) → Appendices (work plan/Gantt, instruments e.g. questionnaires, illustrative notes). *Budget appendix is for proposals only.*

**⚠ Adaptation note (software project vs research-style guideline):** This guideline is written for empirical/statistical research (population, sampling, questionnaires). This is a **system-development** project, so Chapter 3 must be adapted — e.g. a software development methodology (SDLC/Agile/prototyping) plus system analysis & design (use cases, ER diagram, DFD, architecture), and Chapter 4 becomes implementation + testing results. To satisfy the empirical flavor, likely add a **small survey** (students on the current manual-voting problem) and/or a **usability/acceptance test** of the built system. **Confirm this adaptation with the supervisor (Eng Yasir) early.**

---

## 13. How Claude should help

- Treat this document as the source of truth.
- **Workflow split:** implementation/coding is done in **Claude Code** (agentic tool). This project/chat handles **planning, architecture, spec, decisions, and the thesis book** — not writing out full code file-by-file unless explicitly asked.
- Match the **locked PERN + Prisma + JWT** stack (backend = **plain JavaScript**) and the **ballot-secrecy** + **OTP** designs in all guidance.
- Keep security front of mind; keep everything **buildable and production-grade**.
- Academic tone for thesis prose; Somali public-university context.

---

## Still to confirm
1. **Final host pick:** Railway vs AWS Lightsail (either works — both persistent, both run Socket.io). Not blocking; can decide at deploy time.
2. **Supervisor sign-off on methodology adaptation** (software project vs research-style guideline) — and whether to include a student survey / usability test. *(Still open — pending Eng Yasir.)*

## Resolved decisions log
- University = Gudoomiye only (no vice-leader).
- Stack = PERN + Prisma + JWT (access+refresh) + passwordless email OTP + Socket.io realtime.
- Ballot secrecy = split VoteReceipt / Vote, UUID + hash chain, atomic write.
- Students = admin-created (one-by-one + Excel), admin-only updates.
- Candidates = admin-registered directly.
- Results = not public in app; university announces officially.
- Hosting = **persistent Node host (Railway or AWS Lightsail)** + Neon DB; email via Nodemailer + transactional SMTP. (Vercel dropped — serverless can't run Socket.io.)
- Thesis = follow PSU official guideline (§12), min 60 pages, APA.
- Elevated accounts (B3b) = admin-created ADMIN/AUDITOR, seeded **root of trust** that can never be deactivated, enforced by a server guard *and* a partial unique index. Soft deactivation only.

### Frontend architecture — settled during B3b

Three points where the B3b spec described one thing and the shipped code does another. In each case the repo was right and the spec was written without the F0 constraint in view. Recorded here so they are not "corrected" back later.

1. **Route parents do not fetch server-side.** The spec asked the `users` route parent to do the initial fetch. It cannot: the access token is memory-only (F0), so a server component holds no credential. The client component fetches through the axios instance. This is general — it applies to every authenticated screen, not just B3b. (See the §11b warning above.)

2. **The ADMIN guard lives in `app/adminstration/layout.js`, not per-page.** The spec asked for a guard on the users page. The layout already wraps the whole subtree in `<RequireRole roles={["ADMIN"]}>`, so a per-page guard would be redundant *and* would establish a pattern where each new admin screen has to remember its own gate. One gate the subtree inherits cannot be forgotten; a per-page one can. AUDITOR and STUDENT are redirected to `/not-authorized` before anything renders.

3. **Nav gating is structural, not an inline role check.** The spec asked to show the Users entry "to ADMIN only". `ADMIN_NAV` is rendered exclusively by `<AdminShell>`, which sits inside that ADMIN-guarded layout — auditors get `<AuditShell>` instead, whose only admin link is already `{isAdmin && …}`. So the entry is ADMIN-only by construction. Adding a per-item role check would imply the list is sometimes rendered for a non-admin, which is not true and would be a misleading thing to teach the next screen.

**None of the three is a security boundary.** Every `/api/users` route is `requireAuth + requireRole("ADMIN")` server-side, and `requireAuth` re-reads the account on each request. The client only decides what the browser paints.
