/**
 * MFA Routes (Wave 2.1)
 *
 * Endpoints:
 *   POST /auth/mfa/challenge     — finish a login that returned an mfaToken
 *   POST /auth/mfa/enroll        — auth required; start TOTP enrollment
 *   POST /auth/mfa/confirm       — auth required; finish TOTP enrollment with first code
 *   POST /auth/mfa/disable       — auth required; password + code; clear MFA
 *
 * The whole router is gated by FEATURE_MFA. When the flag is "disabled"
 * (the default), every endpoint returns 404 — not 403 — so the existence
 * of MFA itself is invisible to clients on environments that aren't
 * running the feature.
 *
 * @module server/routes/auth-mfa
 */

import { auditActions } from "@/lib/audit";
import { AuthError, authService } from "@/modules/auth/auth.service";
import type { AuthResponse } from "@/modules/auth/auth.types";
import {
    mfaChallengeSchema,
    mfaConfirmSchema,
    mfaDisableSchema,
    validateSchema,
} from "@/modules/auth/auth.validation";
import {
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const authMfaRouter = Router();

// ===========================================
// Feature-flag gate
// ===========================================

function isMfaEnabled(): boolean {
  const raw = process.env.FEATURE_MFA;
  if (!raw) return false;
  const norm = raw.toLowerCase();
  return norm === "enabled" || norm === "true" || norm === "1";
}

authMfaRouter.use((req, _res, next: NextFunction) => {
  if (!isMfaEnabled()) {
    // Hide the surface entirely when the flag is off.
    return next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
  }
  next();
});

// ===========================================
// Helpers
// ===========================================

function getSessionMeta(req: Request) {
  return {
    userAgent: req.headers["user-agent"] || undefined,
    ipAddress: req.ip || req.socket.remoteAddress || undefined,
  };
}

function getAuthCtx(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

// ===========================================
// POST /auth/mfa/challenge
// ===========================================

authMfaRouter.post(
  "/challenge",
  asyncHandler(async (req: Request, res: Response<ApiResponse<AuthResponse>>) => {
    const validation = validateSchema(mfaChallengeSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid MFA challenge body", validation.errors);
    }

    try {
      const result = await authService.completeMfaChallenge(
        validation.data.mfaToken,
        validation.data.code,
        getSessionMeta(req),
      );

      void auditActions.mfaChallengePassed(
        { userId: result.user.id, ...getAuthCtx(req) },
        // We don't know whether it was TOTP or recovery from the response
        // alone; auth.service handles the splice atomically. Tag as 'totp'
        // unless future telemetry needs to distinguish.
        "totp",
      );
      void auditActions.loginSuccess({ userId: result.user.id, ...getAuthCtx(req) });

      res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === "MFA_CHALLENGE_INVALID") {
          throw new UnauthorizedError("Invalid or expired MFA token");
        }
        if (error.code === "MFA_CODE_INVALID") {
          void auditActions.mfaCodeRejected(getAuthCtx(req), "challenge");
          throw new UnauthorizedError("Invalid MFA code");
        }
        if (error.code === "USER_INACTIVE") {
          throw new UnauthorizedError("Account is deactivated");
        }
      }
      throw error;
    }
  }),
);

// ===========================================
// POST /auth/mfa/enroll  (auth required)
// ===========================================

authMfaRouter.post(
  "/enroll",
  requireAuth,
  asyncHandler(
    async (
      req: Request,
      res: Response<
        ApiResponse<{ otpauthUri: string; qrDataUrl: string; secret: string }>
      >,
    ) => {
      if (!req.user) throw new UnauthorizedError("Authentication required");

      try {
        const artifacts = await authService.startMfaEnrollment(
          req.user.id,
          req.user.email,
        );

        void auditActions.mfaEnrollStarted({
          userId: req.user.id,
          ...getAuthCtx(req),
        });

        // Don't return `encryptedSecret` to the client — that's persisted
        // server-side. The plaintext `secret` IS returned (one-time) so
        // the user has a manual-entry fallback alongside the QR code.
        res.json({
          success: true,
          data: {
            otpauthUri: artifacts.otpauthUri,
            qrDataUrl: artifacts.qrDataUrl,
            secret: artifacts.secret,
          },
        });
      } catch (error) {
        if (error instanceof AuthError && error.code === "MFA_ALREADY_ENROLLED") {
          throw new ValidationError("MFA is already enrolled for this account");
        }
        throw error;
      }
    },
  ),
);

// ===========================================
// POST /auth/mfa/confirm  (auth required)
// ===========================================

authMfaRouter.post(
  "/confirm",
  requireAuth,
  asyncHandler(
    async (
      req: Request,
      res: Response<ApiResponse<{ recoveryCodes: string[] }>>,
    ) => {
      if (!req.user) throw new UnauthorizedError("Authentication required");

      const validation = validateSchema(mfaConfirmSchema, req.body);
      if (!validation.success) {
        throw new ValidationError("Invalid MFA confirm body", validation.errors);
      }

      try {
        const out = await authService.confirmMfaEnrollment(
          req.user.id,
          validation.data.code,
        );
        void auditActions.mfaEnrolled({
          userId: req.user.id,
          ...getAuthCtx(req),
        });

        res.json({ success: true, data: out });
      } catch (error) {
        if (error instanceof AuthError) {
          if (error.code === "MFA_CODE_INVALID") {
            void auditActions.mfaCodeRejected(
              { userId: req.user.id, ...getAuthCtx(req) },
              "confirm",
            );
            throw new UnauthorizedError("Invalid MFA code");
          }
          if (
            error.code === "MFA_NOT_ENROLLED" ||
            error.code === "MFA_ALREADY_ENROLLED"
          ) {
            throw new ValidationError(error.message);
          }
        }
        throw error;
      }
    },
  ),
);

// ===========================================
// POST /auth/mfa/disable  (auth required)
// ===========================================

authMfaRouter.post(
  "/disable",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ disabled: true }>>) => {
    if (!req.user) throw new UnauthorizedError("Authentication required");

    const validation = validateSchema(mfaDisableSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid MFA disable body", validation.errors);
    }

    try {
      await authService.disableMfa(
        req.user.id,
        validation.data.password,
        validation.data.code,
      );
      void auditActions.mfaDisabled({
        userId: req.user.id,
        ...getAuthCtx(req),
      });

      res.json({ success: true, data: { disabled: true } });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === "INVALID_CREDENTIALS") {
          throw new UnauthorizedError("Invalid password");
        }
        if (error.code === "MFA_CODE_INVALID") {
          void auditActions.mfaCodeRejected(
            { userId: req.user.id, ...getAuthCtx(req) },
            "disable",
          );
          throw new UnauthorizedError("Invalid MFA code");
        }
        if (error.code === "MFA_NOT_ENROLLED") {
          throw new ValidationError(error.message);
        }
      }
      throw error;
    }
  }),
);
