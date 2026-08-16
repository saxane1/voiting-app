# PSU Online Voting System — REST API Map

The backend contract. Every Track-B module implements a slice of this. Base path: **`/api`**.

**Conventions**
- Auth via **`Authorization: Bearer <accessToken>`**. Refresh token stored in an **httpOnly cookie** (safer than localStorage).
- Access levels: **PUBLIC** (no auth) · **STUDENT** · **ADMIN** · **AUTH** (any logged-in user).
- JSON everywhere. Standard error shape: `{ error: { code, message, details? } }`.
- List endpoints support `?page`, `?limit`, `?search`, and relevant filters.

---

## Auth  (module B1)  — base `/api/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/request-otp` | PUBLIC | Body `{email}`. Look up user, generate OTP, store hash, email via Nodemailer. Rate-limited per email. |
| POST | `/auth/verify-otp` | PUBLIC | Body `{email, code}`. Verify hash/expiry/single-use/attempts → issue access token + set refresh cookie. Returns `{user, accessToken}`. |
| POST | `/auth/refresh` | PUBLIC* | Uses refresh cookie. Rotates refresh, returns new access token. |
| POST | `/auth/logout` | AUTH | Revoke current refresh token. |
| GET | `/auth/me` | AUTH | Current user profile + role. |
| POST | `/auth/admin/issue-otp` | ADMIN | Body `{studentId}`. Manual fallback login code for a student stuck on email. |

\*guarded by the refresh cookie itself.

---

## Faculties  (module B2)  — base `/api/faculties`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/faculties` | AUTH | List all faculties. |
| POST | `/faculties` | ADMIN | Create faculty. |
| PATCH | `/faculties/:id` | ADMIN | Update name/code. |
| DELETE | `/faculties/:id` | ADMIN | Delete (blocked if students/elections attached). |

---

## Students  (module B3)  — base `/api/students`
*(Students are Users with role STUDENT.)*

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/students` | ADMIN | List/search/paginate, filter by faculty. |
| POST | `/students` | ADMIN | Create one student `{email, studentId, name, facultyId}`. |
| POST | `/students/bulk` | ADMIN | Multipart Excel upload → parse, validate, dedupe, return per-row result. |
| GET | `/students/:id` | ADMIN | Student detail. |
| PATCH | `/students/:id` | ADMIN | Update fields. |
| PATCH | `/students/:id/deactivate` | ADMIN | Deactivate (soft) — cannot log in / vote. |

*(Elevated ADMIN/AUDITOR accounts are **not** managed here — see Users (module B3b) below.)*

---

## Users  (module B3b)  — base `/api/users`
*(Elevated accounts only: Users with role ADMIN or AUDITOR. STUDENT rows never appear here.)*

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/users` | ADMIN | List elevated accounts (`role in {ADMIN, AUDITOR}`). Returns id, name, email, role, isActive, isRoot. Supports `?page`, `?limit`, `?search` (name or email), `?role`. |
| POST | `/users` | ADMIN | Create `{email, name, role}` where role ∈ {ADMIN, AUDITOR}. Returns 201 `{user, notification}`. |
| PATCH | `/users/:id` | ADMIN | Edit identity: `name` and/or `email`, at least one. Nothing else is accepted. Returns `{user, changed, notification?}`. |
| PATCH | `/users/:id/deactivate` | ADMIN | Soft-deactivate. Refused for the root account, for self, and for the last active ADMIN. |
| PATCH | `/users/:id/reactivate` | ADMIN | Un-deactivate. Idempotent, like its counterpart. |

- **The whole slice is `requireRole('ADMIN')`.** AUDITOR is refused here as firmly as STUDENT: read-only oversight that could grant itself a second account, or disable the admins it watches, is not oversight. `GET /audit` remains the only endpoint the AUDITOR role exists for.
- **No credential is ever provisioned.** Auth is passwordless, so an account is an email plus a role; the holder signs in through the ordinary OTP flow. There is nothing in the request or the response worth stealing.
- **Email is the login identity and is unique across ALL users.** An address already held by a student is a 409, never a silent promotion of that student into an administrator.
- **`isRoot` is not settable through the API.** The seed script alone claims it (`BOOTSTRAP_ADMIN_EMAIL`), and a partial unique index — `users(is_root) WHERE is_root` — makes "at most one root" a database invariant rather than a convention.
- **Soft deactivation only, never a hard delete.** These accounts appear as actors throughout the audit log; deleting one would orphan the trail that proves what they did while they held power.
- **Deactivation bites immediately**, not at token expiry: `requireAuth` re-reads the account on every request (401 `ACCOUNT_INACTIVE`), and `POST /auth/refresh` revokes the whole refresh-token family with reason `DEACTIVATED`. The one gap is an already-established Socket.io connection, which is verified at handshake only.

**Error codes** this slice returns beyond the standard envelope:

| Code | Status | Meaning |
|---|---|---|
| `STUDENT_FIELD_NOT_ALLOWED` | 400 | `studentId` or `facultyId` was present in the body. Elevated accounts have neither. |
| `FIELD_NOT_EDITABLE` | 400 | `role`, `isRoot` or `isActive` was present in a PATCH body. Each is refused for its own reason — see the note below. |
| `EMAIL_ALREADY_EXISTS` | 409 | The address is taken — by another elevated account **or** by a student. |
| `ROOT_ACCOUNT_IMMUTABLE` | 409 | The seeded root admin can never be deactivated, by anyone, including itself. |
| `CANNOT_DEACTIVATE_SELF` | 409 | An admin may not deactivate their own account. |
| `LAST_ACTIVE_ADMIN` | 409 | Refuses to remove the final active ADMIN. Belt-and-suspenders behind the root rule — see the note below. |
| `USER_NOT_FOUND` | 404 | No ADMIN/AUDITOR with that id (a STUDENT id 404s here too). |

**On `LAST_ACTIVE_ADMIN`:** it is unreachable over HTTP and that is by design, not an oversight. The caller must be an active ADMIN, so if the target is someone else the caller *is* the other active admin and the count is never zero; if the target is the caller, `CANNOT_DEACTIVATE_SELF` fires first. The root rule dominates both. It is kept as a defensive floor and is tested by calling the controller directly against a fabricated single-admin state.

**`PATCH /users/:id` edits IDENTITY ONLY — name and email.** Nothing about an account's *power* is editable through it, and each exclusion has its own reason:

- **`role`** — promoting or demoting an existing account is deferred future work. Create the account with the role it needs.
- **`isRoot`** — never settable through the API at all; the seed script claims it and a partial unique index enforces it.
- **`isActive`** — has its own `/deactivate` and `/reactivate` endpoints, which carry the root, self and last-admin guards. A general-purpose PATCH that accepted it would be a way around all three.
- **`studentId` / `facultyId`** — elevated accounts have neither.

All five are **rejected with a 400, never silently stripped**: an admin who sends `isActive: false` and gets a 200 back would reasonably believe the account was disabled, and it would not be.

**Editing the root account's name or email IS allowed.** Root means the account can never be *deactivated* — it is the permanent trust anchor, not an immutable record. Since the email is the only way to sign in as it, refusing to correct a typo there would be the more dangerous rule.

**Email changes re-check global uniqueness** (excluding the row being edited, so re-saving an unchanged address is a no-op rather than a self-conflict) and are normalised to lowercase before comparison — the `@unique` index is case-sensitive, so normalisation is what makes the rule case-insensitive in practice.

**`notification` on POST and PATCH.** `{sent: boolean, warning?: string}` alongside the user. A failed notification email does **not** roll back the account or the edit — the holder can still sign in via OTP or the admin fallback code, so destroying valid work over a courtesy email would be the worse outcome. The failure is logged, recorded as `ELEVATED_ACCESS_EMAIL_FAILED` in the audit log, and surfaced to the admin UI as a non-blocking notice. On PATCH the key is **present only when the email actually changed** — the notification goes to the NEW address, and a name-only edit emails nobody.

**Audit actions written here:** `ADMIN_CREATED`, `AUDITOR_CREATED`, `ADMIN_UPDATED`, `AUDITOR_UPDATED`, `ADMIN_DEACTIVATED`, `AUDITOR_DEACTIVATED`, `ADMIN_REACTIVATED`, `AUDITOR_REACTIVATED`, plus `ELEVATED_ACCESS_EMAIL_FAILED`. Each carries the acting admin, the target user id and the role. The `*_UPDATED` rows record **which field names changed and nothing more** — never the old or new address, since the audit log is exported and read more widely than the users table is.

---

## Elections  (module B4)  — base `/api/elections`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/elections` | ADMIN | List all elections + status. |
| POST | `/elections` | ADMIN | Create `{title, type, facultyId?, startAt, endAt}`. |
| GET | `/elections/:id` | ADMIN | Detail incl. candidates. |
| PATCH | `/elections/:id` | ADMIN | Edit (only while DRAFT/SCHEDULED). |
| POST | `/elections/:id/open` | ADMIN | Status → OPEN. |
| POST | `/elections/:id/close` | ADMIN | Status → CLOSED. |
| POST | `/elections/:id/publish` | ADMIN | Status → PUBLISHED (bookkeeping; results still admin-only in app). |
| DELETE | `/elections/:id` | ADMIN | Delete (DRAFT only). |

---

## Candidates  (module B5)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/elections/:id/candidates` | AUTH | List candidates (students see this on their ballot). |
| POST | `/elections/:id/candidates` | ADMIN | Add candidate `{userId, manifesto?, photoUrl?}`. Validates faculty match + uniqueness. |
| PATCH | `/candidates/:id` | ADMIN | Update manifesto/photo. |
| DELETE | `/candidates/:id` | ADMIN | Remove candidate. |

---

## Voting  (module B6)  — voter-facing

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/me/ballots` | STUDENT | Elections the student is eligible for (their faculty + Gudoomiye), with voted/not-voted flag. |
| GET | `/me/ballots/:electionId` | STUDENT | The ballot (candidates) if eligible + OPEN + not yet voted. |
| POST | `/elections/:id/vote` | STUDENT | Body `{candidateId}`. Eligibility + window check → **atomic tx**: write `VoteReceipt` (blocks re-vote) + `Vote` (unlinked, UUID, hash-chained). |
| GET | `/me/voting-status` | STUDENT | Which elections the student has voted in (participation only, never the choice). |

---

## Results  (module B7)  — admin-only, NO public endpoint

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/elections/:id/results` | ADMIN | Aggregate tally per candidate. |
| GET | `/elections/:id/turnout` | ADMIN | Turnout stats (voted vs eligible). |
| GET | `/elections/:id/integrity` | ADMIN | Verify the `Vote` hash chain is unbroken (tamper check). |

---

## Audit  (module B9)  — base `/api/audit`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/audit` | ADMIN + AUDITOR | Filterable, paginated activity log. Filters (all optional, combinable): `action` (exact), `actorUserId`, `entityType`+`entityId` (the pair; `entityId` alone is a 400), `from`/`to` (ISO date or datetime on `createdAt`). `?page`, `?limit` (default 25, max 100 — over the cap is a 400, not a silent clamp). Ordered `createdAt DESC, id DESC`. Returns `{ data, page, limit, total }`. |

- **The AUDITOR role's only endpoint.** Read-only oversight sees the trail and nothing else — no results, no students, no elections.
- **Rows are displayed as stored.** The one enrichment is `actorUserId` → `actor { id, name, email, role, isSystem }`; system/anonymous rows (e.g. `OTP_REQUESTED_UNKNOWN_EMAIL`, which has no user to resolve) render as a named non-user actor rather than `null`.
- **Never joined to `Vote`.** A `VOTE_CAST` row carries an actor, the election, an hour-floored time and `participation: true` — no candidateId, no vote id, no chain hash. Enriching this endpoint from the ballot table would rebuild the voter → choice link that design rule 1 exists to prevent.
- **Reads of the audit log are not themselves audited** — reading a forensic record is not a state change, and logging it would drown the signal in viewer noise.

---

## Real-time — Socket.io  (module B8)  — NOT REST

- **Handshake:** access token read from `socket.handshake.auth.token`, verified with the same `verifyAccessToken` the REST middleware uses. ADMIN only — STUDENT and AUDITOR are refused at the handshake, so they never reach a room. Known property: the token is verified once, at connect, and is not re-checked for the socket's lifetime.
- **client → server:** `join-election { electionId }` — validates the election exists, joins that election's room, and acks `{ ok, electionId, status }`. The joining socket immediately receives one `results-update` snapshot. An admin only receives updates for elections they have joined.
- **client → server:** `leave-election { electionId }` — optional; detaches from the room.
- **server → client:** `results-update { electionId, tallies[{candidateId,name,voteCount}], turnout{voted,eligible,turnoutPct} }` — **aggregate only**, throttled to at most once per 5 s per election (trailing edge). A committed vote only marks the election dirty; the aggregate is recomputed on the timer's schedule, never the vote's. There is deliberately **no per-vote event** — a live per-vote feed would let an observer correlate ballots to voters in real time.
- **server → client:** `election-status { electionId, status }` — on `/open`, `/close`, `/reopen`, `/publish` (and the lighter `/schedule`, `/unschedule`). `/close` additionally pushes a final unthrottled `results-update` carrying the true final tally.
- **Shared computation:** the tallies and turnout come from `src/utils/tally.js`, which the B7 REST endpoints also call — the live number and the refreshed number cannot diverge.

---

## Endpoint count by module

Counted from the route files in `backend/src/routes/`, not from the tables above.

B1 auth (6) · B2 faculties (4) · B3 students (7) · **B3b users (5)** · B4 elections (11) · B5 candidates (4) · B6 voting (4) · B7 results (3) · B9 audit (1) + B8 socket events. **45 REST endpoints**, plus `GET /api/health`.

⚠ **Four of those are implemented but have no row in the tables above** — found while recounting for B3b, and predating it:

- `PATCH /students/:id/reactivate` (B3) — the counterpart to deactivate.
- `POST /elections/:id/schedule`, `POST /elections/:id/unschedule`, `POST /elections/:id/reopen` (B4) — the lighter lifecycle transitions, which the B8 section already refers to.

The counts above are the true ones. Adding the missing rows is a small doc task, deliberately left separate from the B3b change so this file's history stays readable.
