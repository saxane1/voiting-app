import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Boots the real server as a child process on a throwaway port and talks to it
// over HTTP. Nothing is stubbed: the tests exercise the actual middleware stack
// (helmet -> cors -> apiLimiter -> requireAuth -> requireRole -> controller), so
// a guard that only works because of mount order still gets caught.
//
// PORT is overridden rather than read from .env because the dev server usually
// holds 5000. dotenv does not override variables already present in the
// environment, so passing them here wins.
//
// ⚠ SMTP IS DELIBERATELY POINTED AT A CLOSED PORT. Two reasons:
//   1. A test run must never send real mail. Creating an account emails the
//      holder, and a suite that spams a live SMTP account is a suite nobody
//      runs twice.
//   2. It makes every create exercise the send-FAILURE path from B3b §6, which
//      is the one with a real invariant attached: the account must survive a
//      failed notification rather than being rolled back. The success path was
//      confirmed by hand (notification.sent === true) before this suite existed.
// ---------------------------------------------------------------------------

const SERVER_ENTRY = fileURLToPath(new URL("../../server.js", import.meta.url));
const PORT = 5099;

export const BASE_URL = `http://127.0.0.1:${PORT}/api`;

let child = null;

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet — keep polling until the deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Test server did not become healthy on port ${PORT} within ${timeoutMs}ms`);
}

export async function startTestServer() {
  child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      // Connection refused, immediately. See the note above.
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[test-server] exited with ${code}:\n${logs.join("")}`);
    }
  });

  await waitForHealth();
}

export async function stopTestServer() {
  if (!child) {
    return;
  }

  const exited = new Promise((resolve) => child.once("exit", resolve));

  child.kill("SIGTERM");

  // The server drains sockets and disconnects Prisma on SIGTERM. If it has not
  // gone within a few seconds, stop waiting — a hung child must not hang CI.
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }

  child = null;
}

// Thin fetch wrapper returning { status, body, headers } so assertions read as
// status/code pairs rather than response plumbing.
export async function api(path, { method = "GET", token, body, cookie } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const parsed = await response.json().catch(() => null);

  return { status: response.status, body: parsed, headers: response.headers };
}

export function errorCode(response) {
  return response.body?.error?.code ?? null;
}
