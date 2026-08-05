import http from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env, isProduction } from "./src/config/env.js";
import { connectPrisma, disconnectPrisma } from "./src/config/prisma.js";
import { closeSocket, initSocket } from "./src/config/socket.js";
import { errorHandler, notFoundHandler } from "./src/middleware/error-handler.js";
import { apiLimiter } from "./src/middleware/rate-limit.js";
import auditRoutes from "./src/routes/audit-routes.js";
import authRoutes from "./src/routes/auth-routes.js";
import candidateRoutes from "./src/routes/candidate-routes.js";
import electionRoutes from "./src/routes/election-routes.js";
import facultyRoutes from "./src/routes/faculty-routes.js";
import healthRoutes from "./src/routes/health-routes.js";
import meRoutes from "./src/routes/me-routes.js";
import studentRoutes from "./src/routes/student-routes.js";
import voteRoutes from "./src/routes/vote-routes.js";

const app = express();

// Deployed behind a reverse proxy (Railway / Lightsail). Without this, every
// request looks like it came from the proxy IP — which B1's rate limiting and
// B9's audit log both depend on being correct.
app.set("trust proxy", 1);

// Security headers, mounted before anything that can produce a response so a
// 404, a 429 and a rate-limiter rejection all carry them too.
//
// crossOriginResourcePolicy is relaxed from Helmet's "same-origin" default to
// "cross-origin" ON PURPOSE. This process is a JSON API with no HTML and no
// static assets; its only consumer is the Next.js frontend on a DIFFERENT
// origin. Leaving CORP at same-origin tells the browser to refuse the response
// to any cross-origin consumer, which is precisely the credentialed
// login -> refresh -> me flow the whole app depends on. Access control here is
// CORS + the JWT, not CORP.
//
// Everything else is left at Helmet's defaults deliberately — see the header
// dump in the B10 notes. CSP stays on even though this API serves no markup:
// it costs nothing on JSON and it protects the one case that would otherwise
// bite, an error page or a future HTML response rendered by mistake.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // required for the httpOnly refresh cookie (B1)
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(isProduction ? "combined" : "dev"));

// ---------------------------------------------------------------------------
// RATE LIMITING — the exemption is expressed as MOUNT ORDER, not as a path
// filter, because ordering cannot drift out of sync with the route list.
// Anything mounted ABOVE apiLimiter is exempt from the per-IP backstop;
// anything below it is covered.
//
// /api/health is exempt because the deploy platform probes it on a timer, and a
// health check that can be rate-limited into failure is worse than no health
// check at all.
//
// /api/auth is exempt because a per-IP limit in front of it reintroduces
// exactly the NAT lockout the email-keyed limiter exists to prevent (see
// middleware/rate-limit.js). PSU's campus is behind one public address, so an
// IP bucket here is a CAMPUS-WIDE bucket:
//   request-otp  — already limited per EMAIL, which is the real control.
//   verify-otp   — guarded by the code's own expiry, single-use flag and
//                  attempt cap; an IP limit adds nothing an attacker feels but
//                  would 429 legitimate students queued behind the same NAT.
//   refresh      — every active session refreshes on ACCESS_TTL. On election
//                  day that is the single highest-volume authenticated route,
//                  and per-IP limiting it would drop whole faculties' sessions.
//   admin/*      — role-gated.
// A request to an unknown /api/auth/* path is not handled by authRoutes, falls
// through, and IS caught by the limiter below — so the exemption covers the
// real auth surface without opening an unmetered hole.
// ---------------------------------------------------------------------------
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);

// Volume backstop for everything else, keyed on IDENTITY (authenticated user
// id) and falling back to IP only for anonymous traffic — so campus NAT does
// not put the whole university in one bucket. This position is load-bearing:
// requireAuth lives inside the routers below, so the limiter derives the user
// from the Authorization header itself. See middleware/rate-limit.js.
app.use("/api", apiLimiter);

app.use("/api/faculties", facultyRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/audit", auditRoutes);

// Voter-facing. Its own router with a STUDENT gate — never under the
// admin-gated elections router.
app.use("/api/me", meRoutes);

// Candidates own /api/elections/:electionId/candidates and must be mounted
// BEFORE the elections router, whose blanket ADMIN gate would otherwise 403 a
// student requesting their ballot list.
app.use("/api", candidateRoutes);
app.use("/api", voteRoutes);
app.use("/api/elections", electionRoutes);

// Must stay last: unmatched routes, then the global error shape.
app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

async function start() {
  await connectPrisma();

  server.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);

  // Sockets first: server.close() waits for connections to drain, and a live
  // dashboard's socket is a connection that never drains on its own. This also
  // stops the B8 throttle timer.
  await closeSocket();

  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch(async (error) => {
  console.error("[server] failed to start", error);
  await disconnectPrisma();
  process.exit(1);
});
