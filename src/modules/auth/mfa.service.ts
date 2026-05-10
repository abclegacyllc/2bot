/**
 * MFA Service — TOTP enrollment, verification, and recovery codes.
 *
 * Built on top of:
 *   - `otpauth` (RFC 6238 TOTP) for code generation/validation
 *   - `lib/encryption` for at-rest secret encryption (AES-256-GCM, versioned)
 *   - `lib/password` (bcrypt) for one-shot recovery code hashing
 *
 * The service is **stateless** — it produces values and verifies them but
 * does not write to or read from the database. Callers (the auth service /
 * route handlers, in a follow-up commit) are responsible for persisting
 * the encrypted secret and recovery-code hashes to the User row, and for
 * marking `totpEnabledAt` once the first verification succeeds.
 *
 * Design choices worth flagging:
 *
 *   - The TOTP secret is generated as 20 random bytes (160 bits), the size
 *     RFC 6238 recommends for SHA-1 HMAC. We persist the *base32-encoded*
 *     representation because authenticator apps require base32; storing the
 *     same value the QR code carries simplifies recovery.
 *
 *   - We tolerate ±1 step (±30s) of drift on `verifyTotp`. Wider windows
 *     enlarge the brute-force surface; narrower windows fail legitimately
 *     drifted clocks.
 *
 *   - Recovery codes are 10 base32 chars (~50 bits of entropy). 8 codes are
 *     issued; each is bcrypt-hashed (cost 12, matching `password.ts`) before
 *     storage. `consumeRecoveryCode` returns the *index* of the code that
 *     matched so callers can splice it out of the array atomically.
 *
 *   - `isMfaEnabled(user)` is the single source of truth for "this account
 *     has finished enrolling and the second factor is in force." A user with
 *     `totpSecret` set but `totpEnabledAt === null` is mid-enrollment and
 *     login should ignore their MFA state.
 *
 * @module modules/auth/mfa
 */

import { decrypt, encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/password";
import crypto from "crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const mfaLogger = logger.child({ module: "mfa" });

const TOTP_ISSUER_DEFAULT = "2bot";
const TOTP_ALGORITHM = "SHA1"; // RFC 6238 default; what every authenticator app supports
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SEC = 30;
const TOTP_WINDOW_STEPS = 1; // accept ±30s of drift
const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_LENGTH = 10; // base32 chars → ~50 bits entropy each

/**
 * Result of starting an MFA enrollment. Hand the QR code data URL to the
 * client so the user can scan it in their authenticator app, and store
 * the encrypted secret on the User row (but leave `totpEnabledAt` null
 * until `verifyTotp` succeeds for the first time).
 */
export interface MfaEnrollmentArtifacts {
  /** Base32-encoded TOTP secret. Show ONCE to the user as a fallback to scanning. */
  secret: string;
  /** Wrapped via `encrypt()`. Persist this; never log or send to the client. */
  encryptedSecret: string;
  /** `otpauth://totp/...` URL — embed in QR code or paste into authenticator. */
  otpauthUri: string;
  /** `data:image/png;base64,...` QR code rendering of `otpauthUri`. */
  qrDataUrl: string;
}

/** Inputs needed to construct a stable label inside the otpauth URI. */
export interface OtpauthLabelInput {
  /** User's email (becomes the `account` portion of `Issuer:account`). */
  email: string;
  /** Issuer name shown in the authenticator app — defaults to "2bot". */
  issuer?: string;
}

/**
 * Generate a fresh TOTP secret + provisioning URI + QR data URL.
 *
 * The returned `secret` is the plaintext base32 string — show it once to
 * the user as a manual-entry fallback. Only `encryptedSecret` should be
 * persisted to the User row.
 *
 * Does not touch the database.
 */
export async function startEnrollment(
  label: OtpauthLabelInput,
): Promise<MfaEnrollmentArtifacts> {
  const issuer = label.issuer ?? TOTP_ISSUER_DEFAULT;

  // 20 random bytes → base32 (RFC 4648, no padding) — matches what
  // authenticator apps expect when manually keyed.
  const secretObj = new OTPAuth.Secret({ size: 20 });
  const secret = secretObj.base32;

  const totp = new OTPAuth.TOTP({
    issuer,
    label: label.email,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SEC,
    secret: secretObj,
  });
  const otpauthUri = totp.toString();

  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  const encryptedSecret = encrypt(secret);

  return {
    secret,
    encryptedSecret,
    otpauthUri,
    qrDataUrl,
  };
}

/**
 * Verify a 6-digit TOTP code against an encrypted secret.
 *
 * @param encryptedSecret - The value previously stored on User.totpSecret
 * @param code - The 6-digit code submitted by the user
 * @returns true when the code matches within ±TOTP_WINDOW_STEPS of now
 */
export function verifyTotp(encryptedSecret: string, code: string): boolean {
  if (!isSixDigitCode(code)) return false;

  let secret: string;
  try {
    secret = decrypt(encryptedSecret);
  } catch (err) {
    // Decryption failure means either ciphertext corruption or a
    // missing encryption key. Either way the code can't be validated.
    mfaLogger.error({ err }, "Failed to decrypt TOTP secret during verify");
    return false;
  }

  const totp = new OTPAuth.TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SEC,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // delta is null on mismatch, an integer step offset on success.
  const delta = totp.validate({ token: code, window: TOTP_WINDOW_STEPS });
  return delta !== null;
}

/**
 * Generate a fresh batch of recovery codes (plaintext) plus their bcrypt
 * hashes. Show the plaintext set to the user **once**; only persist the
 * hashes to `User.totpRecoveryCodes`.
 */
export async function generateRecoveryCodes(): Promise<{
  plaintext: string[];
  hashes: string[];
}> {
  const plaintext: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    plaintext.push(generateOneRecoveryCode());
  }
  // Hash the *normalised* form so consumeRecoveryCode (which also normalises
  // the submitted value) compares like-for-like regardless of how the user
  // types it back (with/without hyphen, casing, whitespace).
  const hashes = await Promise.all(
    plaintext.map((c) => hashPassword(normaliseRecoveryCode(c))),
  );
  return { plaintext, hashes };
}

/**
 * Try to consume one recovery code from a stored hash list.
 *
 * Walks the entire list (no early return) so the timing is not
 * obviously dependent on which slot matches, then returns the
 * matching index or `null`. The caller is expected to splice the
 * matched index out of `User.totpRecoveryCodes` inside an `UPDATE`
 * that also sets `totpEnabledAt` (or leaves it as-is).
 */
export async function consumeRecoveryCode(
  storedHashes: readonly string[],
  submittedCode: string,
): Promise<number | null> {
  if (!isRecoveryCodeShape(submittedCode)) return null;

  const normalised = normaliseRecoveryCode(submittedCode);

  let matchedIndex: number | null = null;
  for (let i = 0; i < storedHashes.length; i++) {
    const hash = storedHashes[i];
    if (!hash) continue;
    const ok = await verifyPassword(normalised, hash);
    if (ok && matchedIndex === null) {
      matchedIndex = i;
      // Don't break — keep the remaining bcrypt comparisons running so
      // total time is independent of which slot matched.
    }
  }
  return matchedIndex;
}

/**
 * Convenience predicate: has the user finished enrollment and is MFA
 * actively required for them?
 *
 * A row with `totpSecret` set but `totpEnabledAt === null` is in
 * mid-enrollment and login should ignore the MFA fields.
 */
export function isMfaEnabled(user: {
  totpSecret: string | null;
  totpEnabledAt: Date | null;
}): boolean {
  return Boolean(user.totpSecret && user.totpEnabledAt);
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

/** RFC 4648 base32 alphabet, minus 0/1/8/O/I/L which look alike at small sizes. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateOneRecoveryCode(): string {
  const buf = crypto.randomBytes(RECOVERY_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_ALPHABET[buf.readUInt8(i) % RECOVERY_ALPHABET.length];
  }
  // Insert a hyphen mid-string for legibility ("ABCDE-FGHJK").
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function normaliseRecoveryCode(input: string): string {
  // Users may type with or without the hyphen, lowercase, with whitespace.
  return input.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

function isSixDigitCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

function isRecoveryCodeShape(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const stripped = normaliseRecoveryCode(value);
  return /^[A-Z0-9]{8,16}$/.test(stripped);
}
