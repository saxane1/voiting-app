-- CreateEnum
CREATE TYPE "RevokeReason" AS ENUM ('ROTATED', 'LOGGED_OUT');

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "revoked_reason" "RevokeReason";

-- Backfill (hand-written). Rows revoked before this column existed carry no
-- reason. They are backfilled as ROTATED — the SAFE default: ROTATED is the
-- theft-signal case, so an unknown-provenance token replayed later still
-- triggers full family revocation. Defaulting them to LOGGED_OUT would silently
-- downgrade a possibly-stolen token to benign.
UPDATE "refresh_tokens"
   SET "revoked_reason" = 'ROTATED'
 WHERE "revoked_at" IS NOT NULL
   AND "revoked_reason" IS NULL;
