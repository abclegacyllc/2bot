/**
 * Auth Service — MFA flow tests (Wave 2.1)
 *
 * Covers `login` MFA branch, `completeMfaChallenge`, `startMfaEnrollment`,
 * `confirmMfaEnrollment`, and `disableMfa`. Uses Prisma mocks plus the
 * real encryption + mfa.service stack so we exercise the actual TOTP
 * verification path.
 */

import { hashPassword } from "@/lib/password";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";
import { AuthError, authService } from "../auth.service";
import { startEnrollment } from "../mfa.service";

// MFA flows hit bcrypt (password verify + recovery-code scan) and can
// exceed the default 5s timeout under CPU contention.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-mfa-flow-tests-min-32-chars";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));
import { prisma } from "@/lib/prisma";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  session: { create: ReturnType<typeof vi.fn> };
  organization: { findFirst: ReturnType<typeof vi.fn> };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface FixtureUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  plan: "FREE";
  role: "MEMBER";
  isActive: boolean;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpRecoveryCodes: string[];
  createdAt: Date;
  updatedAt: Date;
}

let mockUser: FixtureUser;

const mockSession = {
  id: "session-456",
  userId: "user-123",
  token: "session-token",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  userAgent: null,
  ipAddress: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockUser = {
    id: "user-123",
    email: "alice@example.com",
    name: "Alice",
    passwordHash: await hashPassword("SecurePass123"),
    plan: "FREE",
    role: "MEMBER",
    isActive: true,
    totpSecret: null,
    totpEnabledAt: null,
    totpRecoveryCodes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockedPrisma.session.create.mockResolvedValue(mockSession);
  mockedPrisma.user.update.mockImplementation(({ data }: { data: Partial<FixtureUser> }) => {
    Object.assign(mockUser, data);
    return Promise.resolve(mockUser);
  });
});

function currentCodeFor(secret: string, atMs?: number): string {
  return new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: atMs });
}

// ---------------------------------------------------------------------------
// login() — MFA branch
// ---------------------------------------------------------------------------

describe("login (with MFA enabled)", () => {
  it("returns an MFA challenge instead of a session when totpEnabledAt is set", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockedPrisma.user.findUnique.mockResolvedValue({ ...mockUser, memberships: [] });

    const result = await authService.login({
      email: mockUser.email,
      password: "SecurePass123",
    });

    expect("mfaRequired" in result && result.mfaRequired).toBe(true);
    if (!("mfaRequired" in result)) throw new Error("expected challenge");
    expect(typeof result.mfaToken).toBe("string");
    expect(result.mfaToken.split(".").length).toBe(3); // JWT has 3 segments
    // No session was created — a Session row is only made after the second factor.
    expect(mockedPrisma.session.create).not.toHaveBeenCalled();
  });

  it("returns a normal AuthResponse when MFA is enrolled but not confirmed", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = null; // mid-enrollment
    mockedPrisma.user.findUnique.mockResolvedValue({ ...mockUser, memberships: [] });

    const result = await authService.login({
      email: mockUser.email,
      password: "SecurePass123",
    });

    expect("mfaRequired" in result).toBe(false);
    if ("mfaRequired" in result) throw new Error("unexpected challenge");
    expect(result.token).toBeDefined();
  });

  it("rejects login with MFA_ENROLLMENT_REQUIRED when an org member's org enforces MFA and they have not enrolled", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser, // totpEnabledAt = null
      memberships: [
        {
          status: "ACTIVE",
          organization: { id: "org-1", name: "Acme", slug: "acme" },
        },
      ],
    });
    mockedPrisma.organization.findFirst.mockResolvedValue({
      id: "org-1",
      name: "Acme",
    });

    await expect(
      authService.login({ email: mockUser.email, password: "SecurePass123" }),
    ).rejects.toMatchObject({ code: "MFA_ENROLLMENT_REQUIRED" });
    expect(mockedPrisma.session.create).not.toHaveBeenCalled();
  });

  it("does not reject when the user is in an org but no org requires MFA", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      memberships: [
        {
          status: "ACTIVE",
          organization: { id: "org-2", name: "Beta", slug: "beta" },
        },
      ],
    });
    // organization.findFirst returns null → no org requires MFA
    mockedPrisma.organization.findFirst.mockResolvedValue(null);

    const result = await authService.login({
      email: mockUser.email,
      password: "SecurePass123",
    });
    expect("token" in result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// completeMfaChallenge
// ---------------------------------------------------------------------------

describe("completeMfaChallenge", () => {
  async function setupChallenge() {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockedPrisma.user.findUnique.mockResolvedValue({ ...mockUser, memberships: [] });
    const loginResult = await authService.login({
      email: mockUser.email,
      password: "SecurePass123",
    });
    if (!("mfaRequired" in loginResult)) throw new Error("expected challenge");
    return { mfaToken: loginResult.mfaToken, secret: enrol.secret };
  }

  it("exchanges a valid token + TOTP code for a real session", async () => {
    const { mfaToken, secret } = await setupChallenge();
    // For this branch findUnique returns the bare user (no memberships).
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await authService.completeMfaChallenge(mfaToken, currentCodeFor(secret));

    expect("user" in result).toBe(true);
    expect("token" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe(mockUser.email);
    }
    expect(mockedPrisma.session.create).toHaveBeenCalledOnce();
  });

  it("rejects a stale or tampered MFA token", async () => {
    await expect(
      authService.completeMfaChallenge("not.a.real.jwt", "123456"),
    ).rejects.toMatchObject({ code: "MFA_CHALLENGE_INVALID" });
    expect(mockedPrisma.session.create).not.toHaveBeenCalled();
  });

  it("rejects an incorrect TOTP code (and does not consume a recovery code)", async () => {
    const { mfaToken } = await setupChallenge();
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      authService.completeMfaChallenge(mfaToken, "000000"),
    ).rejects.toMatchObject({ code: "MFA_CODE_INVALID" });
    expect(mockedPrisma.session.create).not.toHaveBeenCalled();
  });

  it("consumes a valid recovery code and issues a session", async () => {
    const { generateRecoveryCodes } = await import("../mfa.service");
    const { plaintext, hashes } = await generateRecoveryCodes();

    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockUser.totpRecoveryCodes = hashes;
    mockedPrisma.user.findUnique.mockResolvedValue({ ...mockUser, memberships: [] });

    const loginResult = await authService.login({
      email: mockUser.email,
      password: "SecurePass123",
    });
    if (!("mfaRequired" in loginResult)) throw new Error("expected challenge");

    // findUnique called again inside completeMfaChallenge — return the bare user.
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await authService.completeMfaChallenge(loginResult.mfaToken, plaintext[2]!);
    expect("token" in result).toBe(true);

    // The consumed code was spliced out: prisma.user.update should have
    // been called with a 7-element totpRecoveryCodes array.
    const updateCall = mockedPrisma.user.update.mock.calls.find(
      ([args]) => (args as { data?: { totpRecoveryCodes?: string[] } }).data?.totpRecoveryCodes,
    );
    expect(updateCall).toBeDefined();
    expect(
      (updateCall![0] as { data: { totpRecoveryCodes: string[] } }).data.totpRecoveryCodes,
    ).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// startMfaEnrollment / confirmMfaEnrollment / disableMfa
// ---------------------------------------------------------------------------

describe("startMfaEnrollment", () => {
  it("persists an encrypted secret and returns artifacts (no enabledAt yet)", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ totpEnabledAt: null });

    const out = await authService.startMfaEnrollment(mockUser.id, mockUser.email);

    expect(out.secret).toMatch(/^[A-Z2-7]+$/);
    expect(out.qrDataUrl.startsWith("data:image/png;")).toBe(true);
    // Find the update call that wrote the encrypted secret. Using a search
    // (rather than [0]) so a late-arriving call from a previous test that
    // bled past its timeout cannot pollute the assertion.
    const enrollWriteCall = mockedPrisma.user.update.mock.calls.find(
      ([args]) => {
        const data = (args as { data?: { totpSecret?: string } }).data;
        return data?.totpSecret && data.totpSecret.startsWith("v2:");
      },
    );
    expect(enrollWriteCall).toBeDefined();
    const data = (enrollWriteCall![0] as {
      data: { totpSecret: string; totpEnabledAt: null; totpRecoveryCodes: string[] };
    }).data;
    expect(data.totpSecret.startsWith("v2:")).toBe(true);
    expect(data.totpEnabledAt).toBeNull();
    expect(data.totpRecoveryCodes).toEqual([]);
  });

  it("rejects when MFA is already enrolled", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ totpEnabledAt: new Date() });
    await expect(
      authService.startMfaEnrollment(mockUser.id, mockUser.email),
    ).rejects.toMatchObject({ code: "MFA_ALREADY_ENROLLED" });
  });
});

describe("confirmMfaEnrollment", () => {
  it("activates MFA and returns plaintext recovery codes when the code matches", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockedPrisma.user.findUnique.mockResolvedValue({
      totpSecret: enrol.encryptedSecret,
      totpEnabledAt: null,
    });

    const out = await authService.confirmMfaEnrollment(
      mockUser.id,
      currentCodeFor(enrol.secret),
    );

    expect(out.recoveryCodes).toHaveLength(8);
    const updateArgs = mockedPrisma.user.update.mock.calls.at(-1)?.[0] as {
      data: { totpEnabledAt: Date; totpRecoveryCodes: string[] };
    };
    expect(updateArgs.data.totpEnabledAt).toBeInstanceOf(Date);
    expect(updateArgs.data.totpRecoveryCodes).toHaveLength(8);
  });

  it("rejects an incorrect code (and does not flip totpEnabledAt)", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockedPrisma.user.findUnique.mockResolvedValue({
      totpSecret: enrol.encryptedSecret,
      totpEnabledAt: null,
    });

    await expect(
      authService.confirmMfaEnrollment(mockUser.id, "000000"),
    ).rejects.toMatchObject({ code: "MFA_CODE_INVALID" });
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects when there is no enrollment in progress", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      totpSecret: null,
      totpEnabledAt: null,
    });
    await expect(
      authService.confirmMfaEnrollment(mockUser.id, "123456"),
    ).rejects.toMatchObject({ code: "MFA_NOT_ENROLLED" });
  });
});

describe("disableMfa", () => {
  it("clears all MFA fields when password and TOTP are valid", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    await authService.disableMfa(
      mockUser.id,
      "SecurePass123",
      currentCodeFor(enrol.secret),
    );

    const updateArgs = mockedPrisma.user.update.mock.calls.at(-1)?.[0] as {
      data: {
        totpSecret: null;
        totpEnabledAt: null;
        totpRecoveryCodes: string[];
      };
    };
    expect(updateArgs.data.totpSecret).toBeNull();
    expect(updateArgs.data.totpEnabledAt).toBeNull();
    expect(updateArgs.data.totpRecoveryCodes).toEqual([]);
  });

  it("rejects with INVALID_CREDENTIALS on wrong password", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      authService.disableMfa(mockUser.id, "WrongPassword", currentCodeFor(enrol.secret)),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects with MFA_CODE_INVALID on wrong code (with right password)", async () => {
    const enrol = await startEnrollment({ email: mockUser.email });
    mockUser.totpSecret = enrol.encryptedSecret;
    mockUser.totpEnabledAt = new Date();
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      authService.disableMfa(mockUser.id, "SecurePass123", "000000"),
    ).rejects.toMatchObject({ code: "MFA_CODE_INVALID" });
  });

  it("rejects when MFA is not enrolled", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser); // totpEnabledAt: null
    await expect(
      authService.disableMfa(mockUser.id, "SecurePass123", "123456"),
    ).rejects.toMatchObject({ code: "MFA_NOT_ENROLLED" });
  });
});

// silence the encryption-key-provider singleton warning between test files
afterAll(() => {
  vi.restoreAllMocks();
});

// trivial sanity check
describe("auth error class", () => {
  it("MFA error codes are surfaced via AuthError", () => {
    const err = new AuthError("x", "MFA_CHALLENGE_INVALID");
    expect(err.code).toBe("MFA_CHALLENGE_INVALID");
  });
});
