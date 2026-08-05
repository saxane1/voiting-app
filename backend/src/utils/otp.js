import crypto from "node:crypto";

import { addMinutes } from "date-fns";

import { env } from "../config/env.js";

// 6-digit numeric code, zero-padded so "000123" stays six characters.
// crypto.randomInt is uniform and CSPRNG-backed — Math.random is neither, and a
// predictable OTP would defeat the whole login flow.
export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// The caller emails the plaintext code and stores only hashValue(code).
export function getOtpExpiry(from = new Date()) {
  return addMinutes(from, env.OTP_TTL_MIN);
}
