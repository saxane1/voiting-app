import "dotenv/config";
import { z } from "zod";

// Single source of truth for environment config. Nothing else in the app should
// read process.env directly — import `env` from here so a missing/invalid value
// fails loudly at boot instead of surfacing as undefined mid-request.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (Neon pooled connection string)"),

  // Comma-separated list -> array, so the Next.js dev origin and the deployed
  // origin can both be allowed. Consumed by cors and by socket.io.
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),

  // Used only by prisma/seed.js. Optional here so the server still boots without
  // it; the seed script fails loudly if it is missing.
  BOOTSTRAP_ADMIN_EMAIL: z.email("BOOTSTRAP_ADMIN_EMAIL must be a valid email").optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).default("PSU Election Admin"),

  // ---------------------- Auth (B1) ----------------------

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // jsonwebtoken duration strings ("15m", "7d") or a number of seconds.
  ACCESS_TTL: z.string().min(1).default("15m"),
  REFRESH_TTL: z.string().min(1).default("7d"),

  OTP_TTL_MIN: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // ---------------------- Email ----------------------
  // Generic SMTP so swapping Gmail -> Brevo/SendGrid/SES is an env-only change.

  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1, "SMTP_USER is required"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required"),
  // Plain address or "Display Name <address>" — not validated as a bare email.
  SMTP_FROM: z.string().min(1, "SMTP_FROM is required"),
})
  // Reusing one secret for both token types would let an access token be
  // replayed as a refresh token (and vice versa), defeating rotation.
  .refine((config) => config.JWT_ACCESS_SECRET !== config.JWT_REFRESH_SECRET, {
    path: ["JWT_REFRESH_SECRET"],
    message: "JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET",
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
