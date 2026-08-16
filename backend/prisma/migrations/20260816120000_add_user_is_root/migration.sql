-- B3b: root of trust for admin/auditor account management.
--
-- Marks the bootstrap (seed) admin as the permanent trust anchor. That account
-- can never be deactivated -- not by another admin, not by itself -- so the
-- system can never reach a state where nobody is able to administer it.

-- Additive and non-destructive. On PostgreSQL 11+ a NOT NULL column with a
-- non-volatile DEFAULT is stored in the catalogue rather than written to every
-- row, so this is a metadata-only change: instant even on a populated table,
-- and safe to run against Neon without a maintenance window.
ALTER TABLE "users" ADD COLUMN "is_root" BOOLEAN NOT NULL DEFAULT false;

-- Every existing row stays false. The root is claimed by prisma/seed.js, which
-- upserts on BOOTSTRAP_ADMIN_EMAIL -- deliberately NOT by an UPDATE hardcoding
-- an address here, which would bake one environment's admin into version
-- control and be wrong for every other deployment.

-- ---------------------------------------------------------------------------
-- "EXACTLY ONE ROOT", ENFORCED BY THE DATABASE.
--
-- A partial unique index constrains only the rows matching its predicate, so
-- the uniqueness applies to is_root = true and the thousands of false rows are
-- not covered by it (a plain UNIQUE would allow only ONE non-root user in the
-- entire table). The result: a second root is rejected by Postgres itself, not
-- merely by application code that a future refactor could forget to call.
--
-- ⚠ PRISMA DRIFT WARNING -- READ BEFORE RUNNING `prisma migrate dev`.
-- Prisma's schema language cannot express a WHERE clause on an index, so this
-- index exists in the database but has no representation in schema.prisma.
-- `prisma migrate dev` compares the two and will therefore see the index as
-- drift and generate a `DROP INDEX "users_is_root_key"` in the next migration
-- it creates. DELETE that line before applying it. `prisma migrate deploy`,
-- which is what production runs, never does this comparison and is unaffected.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "users_is_root_key" ON "users"("is_root") WHERE "is_root";
