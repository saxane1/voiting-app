import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { normalizeEmail } from "../utils/email.js";
import { verifyAccessToken } from "../utils/jwt.js";

// ---------------------------------------------------------------------------
// WHY THE OTP LIMITER IS KEYED ON EMAIL, NOT IP
//
// express-rate-limit keys on req.ip by default. PSU's campus shares wifi behind
// NAT, so hundreds of students appear to the server as ONE address. An IP-keyed
// OTP limit would mean the first few students to request a code exhaust the
// bucket and every other student on campus is locked out of logging in — on
// election day. Keying on the normalised email makes the limit per-account,
// which is what actually stops OTP spamming of a single inbox.
//
// `app.set("trust proxy", 1)` is already configured in server.js, so req.ip is
// the real client address for the IP-keyed limiter below.
// ---------------------------------------------------------------------------

// Kept as constants rather than env vars so this file stays self-contained.
// Promote to env if these need to differ per environment.
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const OTP_MAX_REQUESTS = 5; // per email, per window

const GENERIC_WINDOW_MS = 15 * 60 * 1000;

// Per IDENTITY, per window. Sized for a real voting session with headroom:
// login, /me/ballots, a ballot detail, the candidate list, the vote itself,
// /me/voting-status, plus a refresh every ACCESS_TTL and any retries on a flaky
// phone connection — call it 12-15 requests. 100 leaves room for a student who
// reloads repeatedly without leaving room for a script.
const AUTHENTICATED_MAX_REQUESTS = 100;

// Per IP, per window, for requests carrying no usable token. Stays a blunt DoS
// backstop. Sharing this bucket across campus NAT is harmless HERE because the
// routes an unauthenticated caller can reach below this limiter are all 401s
// and 404s — /api/auth and /api/health are mounted ABOVE it (see server.js), so
// no legitimate anonymous flow is metered by it.
const ANONYMOUS_MAX_REQUESTS = 300;

// Returns the normalized email, or null when the body has no usable one.
// Uses the shared normalizeEmail so the limiter bucket, the User lookup and the
// OtpToken lookup are guaranteed to agree on what counts as the same address.
function getNormalizedEmail(req) {
  return normalizeEmail(req.body?.email);
}

export const otpRequestLimiter = rateLimit({
  windowMs: OTP_WINDOW_MS,
  limit: OTP_MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: (req) => getNormalizedEmail(req),

  // EDGE CASE — missing or non-string req.body.email.
  //
  // Decision: skip this limiter entirely for those requests.
  //
  // Rejected alternative A: let the key be undefined/"unknown". Every malformed
  // request would then share ONE bucket, so a trivial flood of {} bodies fills
  // it and any later malformed-but-innocent request is 429'd — and worse, the
  // shared bucket tells an attacker nothing about real accounts while costing us
  // nothing to exhaust.
  //
  // Rejected alternative B: fall back to req.ip for these. That reintroduces
  // exactly the NAT problem this limiter exists to avoid — one bad client on
  // campus wifi would 429 requests from everyone behind that address.
  //
  // Skipping is safe because a request with no email cannot produce an OTP: the
  // route validator rejects it with 400 before any code is generated or mail is
  // sent. Volume abuse of that path is the generic per-IP limiter's job, which
  // is why apiLimiter below should be mounted on /api.
  skip: (req) => getNormalizedEmail(req) === null,

  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: "OTP_RATE_LIMITED",
        message:
          "Too many login codes requested for this email. Please wait a few minutes and try again.",
      },
    });
  },
});

// ---------------------------------------------------------------------------
// WHY THE GENERIC LIMITER IS KEYED ON IDENTITY, NOT IP
//
// Same NAT reasoning as the OTP limiter above, applied to the voting path. An
// IP-keyed bucket behind campus NAT is a WHOLE-UNIVERSITY bucket: one shared
// address, thousands of students, so the first few dozen voters would exhaust
// it and everyone else would be 429'd mid-election. Keying on the authenticated
// user makes the limit per-student, which is what actually stops one account
// hammering the API.
//
// WHERE THIS RUNS, AND WHY IT PEEKS AT THE TOKEN ITSELF:
// apiLimiter is mounted at `app.use("/api", apiLimiter)` in server.js, ABOVE the
// resource routers. requireAuth runs INSIDE each of those routers, so req.user
// is NOT yet populated when this limiter executes — `req.user?.id ?? req.ip`
// would silently take the IP branch on every single request and the NAT lockout
// would survive the "fix" untouched. So the key is derived from the Authorization
// header directly.
//
// The alternative was to move the limiter below requireAuth, which would mean a
// separate mount inside all eight routers — eight places to forget, and it would
// break the mount-order exemption that keeps /auth and /health unmetered.
//
// The token is VERIFIED, never merely decoded. A decoded-but-unverified `sub`
// would let anyone mint an unlimited supply of buckets by forging subject
// claims, which defeats the limiter entirely. Verification is a stateless HMAC
// check with no database access — the same cost profile as requireAuth, which
// is deliberately DB-free for exactly this reason.
// ---------------------------------------------------------------------------

// Resolved once per request and cached: both keyGenerator and limit need it,
// and neither should pay for a second signature check.
const IDENTITY = Symbol("rateLimitIdentity");

function resolveIdentity(req) {
  if (req[IDENTITY]) {
    return req[IDENTITY];
  }

  let identity = { key: `ip:${ipKeyGenerator(req.ip)}`, authenticated: false };

  const [scheme, token] = (req.headers.authorization ?? "").split(" ");

  if (scheme === "Bearer" && token) {
    try {
      const payload = verifyAccessToken(token);

      if (payload.sub) {
        identity = { key: `user:${payload.sub}`, authenticated: true };
      }
    } catch {
      // Expired, forged or malformed: not an authenticated request. It falls to
      // the IP bucket here and requireAuth will reject it with 401 downstream.
      // Deliberately silent — this is a limiter, not an auth error reporter.
    }
  }

  req[IDENTITY] = identity;

  return identity;
}

export const apiLimiter = rateLimit({
  windowMs: GENERIC_WINDOW_MS,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: (req) => resolveIdentity(req).key,

  // Two buckets in one limiter. The key prefixes ("user:" / "ip:") keep the two
  // namespaces from ever colliding in the shared store.
  limit: (req) =>
    resolveIdentity(req).authenticated ? AUTHENTICATED_MAX_REQUESTS : ANONYMOUS_MAX_REQUESTS,

  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please slow down and try again shortly.",
      },
    });
  },
});
