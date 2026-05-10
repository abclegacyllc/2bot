-- =============================================================================
-- TOTP MFA fields (Wave 2.1)
--
-- Adds the columns the MFA service needs:
--
--   users.totp_secret           — encrypted TOTP shared secret. Wrapped via
--                                 lib/encryption.ts so a DB leak alone is not
--                                 enough to bypass MFA.
--   users.totp_enabled_at       — timestamp of successful enrollment confirmation.
--                                 NULL means MFA is set up but not yet verified
--                                 (or has been disabled).
--   users.totp_recovery_codes   — array of bcrypt-hashed one-shot recovery codes.
--                                 Empty array means no recovery codes available.
--   organizations.mfa_required  — when true, members of this org cannot complete
--                                 login without an active TOTP enrollment.
--
-- All four columns default to a "no MFA" posture so existing rows are
-- unaffected. The MFA flow is feature-flagged at the route layer
-- (FEATURE_MFA), so adding the columns alone does not change behaviour.
-- =============================================================================

ALTER TABLE "users"
  ADD COLUMN "totp_secret"          TEXT,
  ADD COLUMN "totp_enabled_at"      TIMESTAMP(3),
  ADD COLUMN "totp_recovery_codes"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "organizations"
  ADD COLUMN "mfa_required" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_totp_enabled_at_idx" ON "users" ("totp_enabled_at");
CREATE INDEX "organizations_mfa_required_idx" ON "organizations" ("mfa_required");
