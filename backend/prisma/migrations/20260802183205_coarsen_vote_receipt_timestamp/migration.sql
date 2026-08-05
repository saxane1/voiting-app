-- AlterTable
-- The default is dropped so the application MUST supply an explicitly coarsened
-- value; a forgotten write now fails loudly instead of storing a precise time.
ALTER TABLE "vote_receipts" ALTER COLUMN "voted_at" DROP DEFAULT;

-- Backfill (hand-written). Any receipt written before this migration holds a
-- precise timestamp, which is exactly the deanonymisation vector being closed.
-- In normal state this table is empty at migration time and both statements
-- affect 0 rows — they exist so the fix is complete on any database that does
-- carry live data.
UPDATE "vote_receipts"
   SET "voted_at" = date_trunc('hour', "voted_at")
 WHERE "voted_at" <> date_trunc('hour', "voted_at");

-- Same vector through the audit table: a VOTE_CAST row's precise created_at
-- reconstructs vote order just as well as a receipt does. Other audit actions
-- keep full precision (forensics needs it); only VOTE_CAST is coarsened.
UPDATE "audit_logs"
   SET "created_at" = date_trunc('hour', "created_at")
 WHERE "action" = 'VOTE_CAST'
   AND "created_at" <> date_trunc('hour', "created_at");
