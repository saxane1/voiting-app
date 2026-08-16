import nodemailer from "nodemailer";

import { appUrl, env, isDevelopment } from "../config/env.js";

// Generic SMTP transport — provider is entirely an env concern, so moving from a
// Gmail app password to Brevo/SendGrid/SES needs no code change.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

// Optional connectivity check — useful at boot or from a health check.
export async function verifyMailer() {
  await transporter.verify();
}

export async function sendOtpEmail(to, code) {
  // DEV ONLY: printed before the send attempt so a failing SMTP config still
  // leaves a usable code in the terminal. This is the single place in the entire
  // codebase permitted to log an OTP, and it never runs in production or test.
  if (isDevelopment) {
    console.log(`[mailer] DEV ONLY — OTP for ${to}: ${code}`);
  }

  const minutes = env.OTP_TTL_MIN;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Your PSU voting login code",
    text: [
      `Your PSU online voting login code is: ${code}`,
      "",
      `This code expires in ${minutes} minutes and can be used once.`,
      "If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Your PSU online voting login code is:</p>",
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>`,
      `<p>This code expires in ${minutes} minutes and can be used once.</p>`,
      "<p>If you did not request it, you can ignore this email.</p>",
    ].join(""),
  });
}

// ---------------------------------------------------------------------------
// B3b — elevated (ADMIN / AUDITOR) account notification.
//
// ⚠ THIS EMAIL CARRIES NO CREDENTIAL. Authentication is passwordless, so there
// is nothing to provision and nothing here worth stealing: it tells the holder
// that access exists and points them at the normal OTP login, which they drive
// themselves. Do NOT be tempted to "help" by generating a code and embedding it
// — that would turn a routine notification into a bearer token sitting in an
// inbox, and it would bypass the request-otp rate limiting entirely.
// ---------------------------------------------------------------------------

// name and email are admin-supplied and land inside an HTML body, so they are
// escaped rather than trusted. The plain-text part needs no escaping.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROLE_LABELS = {
  ADMIN: "Administrator",
  AUDITOR: "Auditor",
};

const ROLE_DESCRIPTIONS = {
  ADMIN:
    "You can manage students, faculties, elections and candidates, and view results.",
  AUDITOR: "You have read-only access to the system's audit log.",
};

export async function sendElevatedAccessEmail({ to, name, role }) {
  const label = ROLE_LABELS[role] ?? role;
  const description = ROLE_DESCRIPTIONS[role] ?? "";
  const loginUrl = `${appUrl}/login`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `You have been granted ${label} access to the PSU Voting System`,
    text: [
      `Hello ${name},`,
      "",
      `You have been granted ${label} access to the Puntland State University online voting system.`,
      description,
      "",
      `Your login email is: ${to}`,
      "",
      "The system does not use passwords. To sign in:",
      `  1. Go to ${loginUrl}`,
      "  2. Enter this email address",
      "  3. Enter the one-time code that is emailed to you",
      "",
      "If you believe this was sent to you in error, please contact the election commission.",
    ].join("\n"),
    html: [
      `<p>Hello ${escapeHtml(name)},</p>`,
      `<p>You have been granted <strong>${label}</strong> access to the Puntland State University online voting system.`,
      description ? ` ${description}` : "",
      "</p>",
      `<p>Your login email is: <strong>${escapeHtml(to)}</strong></p>`,
      "<p>The system does not use passwords. To sign in:</p>",
      "<ol>",
      `<li>Go to <a href="${loginUrl}">${loginUrl}</a></li>`,
      "<li>Enter this email address</li>",
      "<li>Enter the one-time code that is emailed to you</li>",
      "</ol>",
      "<p>If you believe this was sent to you in error, please contact the election commission.</p>",
    ].join(""),
  });
}

/**
 * B3b addendum — the login email on an elevated account was changed.
 *
 * Sent to the NEW address, because that is the one that can now sign in and the
 * one whose holder needs to know. Like every mail in this module it carries no
 * code and no credential: it tells them the address changed and points them at
 * the normal OTP login.
 *
 * The OLD address is deliberately NOT written into this message. The new holder
 * does not need it, and putting one person's address in another person's inbox
 * is a small leak with no upside.
 */
export async function sendLoginEmailChangedEmail({ to, name, role }) {
  const label = ROLE_LABELS[role] ?? role;
  const loginUrl = `${appUrl}/login`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Your PSU Voting System login email has changed",
    text: [
      `Hello ${name},`,
      "",
      `The login email for your ${label} account on the Puntland State University online voting system has been changed to this address.`,
      "",
      `From now on, sign in with: ${to}`,
      "",
      "The system does not use passwords. To sign in:",
      `  1. Go to ${loginUrl}`,
      "  2. Enter this email address",
      "  3. Enter the one-time code that is emailed to you",
      "",
      "If you did not expect this change, contact the election commission immediately.",
    ].join("\n"),
    html: [
      `<p>Hello ${escapeHtml(name)},</p>`,
      `<p>The login email for your <strong>${label}</strong> account on the Puntland State University online voting system has been changed to this address.</p>`,
      `<p>From now on, sign in with: <strong>${escapeHtml(to)}</strong></p>`,
      "<p>The system does not use passwords. To sign in:</p>",
      "<ol>",
      `<li>Go to <a href="${loginUrl}">${loginUrl}</a></li>`,
      "<li>Enter this email address</li>",
      "<li>Enter the one-time code that is emailed to you</li>",
      "</ol>",
      "<p>If you did not expect this change, contact the election commission immediately.</p>",
    ].join(""),
  });
}
