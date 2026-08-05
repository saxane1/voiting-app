import { PrismaPg } from "@prisma/adapter-pg";

import { env, isProduction } from "./env.js";
// Prisma 7 generates the client into src/generated/prisma (see schema.prisma).
// The generator emits TypeScript, hence the explicit .ts specifier below. Node
// 24 strips types natively, so this needs no flags — see "engines" in
// package.json, which is what keeps that true.
import { PrismaClient } from "../generated/prisma/client.ts";

// Neon pooled connection. The pg driver adapter owns pooling in Prisma 7.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  // Deliberately NO "query" logging, in any environment. Query logs would print
  // the VoteReceipt insert (has userId) next to the Vote insert (has candidateId)
  // inside the same transaction — enough to correlate a voter to their ballot in
  // the logs, which breaks the ballot-secrecy guarantee the schema enforces.
  log: isProduction ? ["error"] : ["warn", "error"],
});

export async function connectPrisma() {
  await prisma.$connect();
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
