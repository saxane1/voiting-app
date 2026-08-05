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

*(Optional B3b — admin/auditor accounts: `POST /users` ADMIN to create ADMIN/AUDITOR users.)*

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
B1 auth (6) · B2 faculties (4) · B3 students (6) · B4 elections (8) · B5 candidates (4) · B6 voting (4) · B7 results (3) · B9 audit (1) + B8 socket events. ≈ 36 REST endpoints.
