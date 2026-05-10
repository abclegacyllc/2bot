-- =============================================================================
-- Account lifecycle (Wave 2.2 — GDPR delete + export)
--
-- Adds two columns the account-deletion flow needs. `deletedAt` already
-- exists in the schema (set by the soft-delete request); these fields
-- track the scheduled-for date and the post-grace-period anonymization.
--
--   users.deletion_scheduled_for — when the row will be anonymised. Set
--                                  to deletedAt + 30d at request time.
--                                  NULL means no deletion is in flight.
--   users.anonymized_at          — when the cron actually scrubbed PII.
--                                  Idempotent: anonymisation is a no-op
--                                  once this is non-null. Lets us
--                                  retain a tombstone row for FK
--                                  integrity and billing compliance.
--
-- Both default to NULL so existing rows are unaffected.
-- =============================================================================

ALTER TABLE "users"
  ADD COLUMN "deletion_scheduled_for" TIMESTAMP(3),
  ADD COLUMN "anonymized_at"          TIMESTAMP(3);

CREATE INDEX "users_deletion_scheduled_for_idx" ON "users" ("deletion_scheduled_for");
CREATE INDEX "users_anonymized_at_idx"           ON "users" ("anonymized_at");
