# CLAUDE.md — PSU Online Voting System (Backend)

Repo memory for Claude Code. Read this before doing anything in this repo.

## What this is
Backend for a **production-ready online voting system** for Puntland State University (PSU), part of a final-year thesis. Students vote remotely in **faculty elections** (6 faculties, one leader each, scoped to that faculty) and one **university election** (Gudoomiye, all students vote).

## Stack (do not deviate without asking)
- **Language:** plain **JavaScript**, **ES modules** (`"type":"module"` → use `import`/`export`, never `require`).
- **Framework:** Express **v5** (entry `server.js`).
- **DB:** PostgreSQL on **Neon**, via Prisma **`@prisma/adapter-pg` + `pg`** driver adapter.
- **ORM:** Prisma (`prisma/schema.prisma`).
- **Auth:** passwordless email **OTP → JWT** (`jsonwebtoken`, `bcryptjs` to hash OTP/tokens, `cookie-parser` for httpOnly refresh cookie).
- **Rate limiting:** `express-rate-limit`.
- **Realtime:** `socket.io`.
- **Email:** `nodemailer` → transactional SMTP (Brevo/SendGrid/SES). No Gmail in prod.
- **Misc:** `cors`, `dotenv`, `morgan`, `date-fns`. Dev: `nodemon`.
- **NOT YET INSTALLED (add when reaching B3):** `xlsx` or `exceljs` + `multer` for Excel bulk upload; optionally `zod`/`express-validator`.

## Conventions (MY STYLE — follow exactly)
- **File & folder names: lowercase kebab-case** (`auth-controllers.js`, `election-detail/`). NEVER PascalCase or camelCase for filenames.
- **Function names: camelCase.**
- ES modules only. Clean, flexible, layered structure.
- Existing folders spelled **`adminstration`** — match it so imports resolve.

## Companion spec files (in repo — follow them)
- `prisma/schema.prisma` — the data model. Source of truth for tables/relations.
- `docs/API-Map.md` — the ~36 REST endpoints + Socket.io events, with access levels. Implement to this.
- `docs/Project-Context.md` — full locked decisions + rationale.
- `docs/Modules.md` — build order (B0 → B10).

## Non-negotiable design rules (thesis depends on these)
1. **Ballot secrecy — two unlinked tables.** `VoteReceipt` (userId + electionId, unique) proves *that* a user voted. `Vote` (electionId + candidateId, **NO userId**, random UUID id, **no precise timestamp**) holds the choice. There must be **no way to join a Vote back to a User**. Never add a userId to Vote.
2. **Atomic vote.** Write the `VoteReceipt` and the `Vote` in **one DB transaction** so a crash can never record one without the other.
3. **One person, one vote** — enforced by the `VoteReceipt` unique constraint + server check, never just the UI.
4. **Hash chain on Vote:** `hash = SHA256(prevHash + electionId + candidateId)` for tamper-evidence. Expose an integrity-check endpoint.
5. **OTP security:** store a **hash** of the OTP (never plaintext), single-use, short expiry (~5–10 min), cap attempts, **rate-limit per EMAIL address, not per IP** (campus shares NAT). Add a resend cooldown.
6. **JWT:** short-lived access token in `Authorization: Bearer`; refresh token in an **httpOnly cookie**; rotate refresh on use; support revocation.
7. **RBAC:** roles STUDENT / ADMIN / AUDITOR. Students only touch `/me/*` routes.
8. **Results are ADMIN-ONLY.** There is **no public results endpoint**. University announces officially.
9. **Time-bound:** votes accepted only while an election is OPEN and inside its window.
10. **Audit log** key actions (student created, election opened, OTP issued, vote cast [participation only], results viewed).

## Structure (match the existing repo — layered, kebab-case)
```
backend/
  prisma/          schema.prisma, migrations, seed
  prisma.config.js
  server.js        entry
  src/
    config/        env, prisma client, pg adapter, socket setup
    controllers/   auth-controllers.js, student-controllers.js,
                   election-controllers.js, candidate-controllers.js,
                   faculty-controllers.js, adminstration-controllers.js
    middleware/    auth, role, rate-limit, error-handler, validate
    routes/        one route file per resource
    socket/        socket.io handlers
    utils/         otp, jwt, hashing, mailer, excel
  .env
```
Controllers hold request logic; routes wire endpoints; shared helpers in `utils/`. No separate services layer unless it grows.

## Rate-limit caveat (important)
`express-rate-limit` keys on **IP by default**. For OTP, add a **custom `keyGenerator` on the request-otp route that keys on the email** (campus shares NAT/wifi) — otherwise one student hitting the limit locks out everyone.

## Build order
Phase 1: **B0** (setup, Prisma+Neon, seed 6 faculties + bootstrap admin) → **B1** (auth). Then B2 faculties, B3 students, B4 elections, B5 candidates, B6 voting, B7 results, B8 realtime, B9 audit, B10 hardening + tests. Do NOT jump ahead; each phase should run and be testable.

## Conventions
- Validate all input (zod or express-validator). Global error handler returns `{ error: { code, message } }`.
- Never log OTP codes, tokens, or anything linking a voter to a choice.
- Write tests for the critical paths: one-vote enforcement, ballot secrecy, auth/OTP, RBAC, window enforcement.
