import nodemailer from "nodemailer";

import { env, isDevelopment } from "../config/env.js";

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
