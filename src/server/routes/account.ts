/**
 * Account Routes (Wave 2.2 — GDPR)
 *
 *   GET  /account/export                — stream the user's data as JSONL
 *   POST /account/delete                — schedule deletion (30-day grace)
 *   POST /account/cancel-deletion       — undo a pending deletion
 *
 * All routes require authentication. The destructive endpoints
 * additionally re-verify the password (and TOTP if MFA is on) so a
 * stolen session cookie alone cannot trigger them.
 *
 * @module server/routes/account
 */

import { auditActions } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { accountService } from "@/modules/account";
import { isMfaEnabled, verifyTotp } from "@/modules/auth/mfa.service";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const accountRouter = Router();
accountRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Body for the destructive endpoints — proves the caller still holds the credentials. */
const destructiveAuthSchema = z.object({
  password: z.string().min(1, "Password is required"),
  /** Required when the account has MFA enrolled. Ignored otherwise. */
  mfaCode: z.string().min(6).max(20).optional(),
});

function getAuthCtx(req: Request) {
  return {
    userId: req.user?.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

async function reauthenticate(
  userId: string,
  body: z.infer<typeof destructiveAuthSchema>,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError("Account not found");

  const passwordOk = await verifyPassword(body.password, user.passwordHash);
  if (!passwordOk) throw new UnauthorizedError("Invalid password");

  if (isMfaEnabled(user)) {
    if (!body.mfaCode) {
      throw new ValidationError("MFA code is required for this account");
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, body.mfaCode)) {
      throw new UnauthorizedError("Invalid MFA code");
    }
  }
}

// ---------------------------------------------------------------------------
// GET /account/export
// ---------------------------------------------------------------------------
//
// Streams the user's data as application/jsonl. We bypass `res.json` and
// write chunks directly so the response can be larger than memory.

accountRouter.get(
  "/export",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Authentication required");

    res.setHeader("Content-Type", "application/jsonl; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="2bot-account-export-${req.user.id}.jsonl"`,
    );
    // Disable buffering caches that some proxies apply by default.
    res.setHeader("X-Accel-Buffering", "no");

    void auditActions.accountExportRequested(getAuthCtx(req));

    for await (const chunk of accountService.exportUserData(req.user.id)) {
      res.write(`${JSON.stringify(chunk)}\n`);
    }
    res.end();
  }),
);

// ---------------------------------------------------------------------------
// POST /account/delete
// ---------------------------------------------------------------------------

accountRouter.post(
  "/delete",
  asyncHandler(
    async (
      req: Request,
      res: Response<ApiResponse<{ scheduledFor: string }>>,
    ) => {
      if (!req.user) throw new UnauthorizedError("Authentication required");

      const parsed = destructiveAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid request body");
      }

      await reauthenticate(req.user.id, parsed.data);

      const { scheduledFor } = await accountService.requestDeletion(req.user.id);
      void auditActions.accountDeletionRequested(getAuthCtx(req), scheduledFor);

      // Invalidate every existing session — the account is now inactive,
      // so the in-flight session bearer should not keep working.
      await prisma.session.deleteMany({ where: { userId: req.user.id } });

      res.json({
        success: true,
        data: { scheduledFor: scheduledFor.toISOString() },
      });
    },
  ),
);

// ---------------------------------------------------------------------------
// POST /account/cancel-deletion
// ---------------------------------------------------------------------------
//
// This route is special: the user is already inactive (login is blocked
// by `requestDeletion`) so they cannot reach this endpoint via the
// normal login flow. The intended UX is a one-time recovery link sent
// at deletion-request time; that flow is not in scope for this turn,
// but the endpoint stands ready. For now we keep the requireAuth gate
// so admins or test fixtures can still hit it.

accountRouter.post(
  "/cancel-deletion",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ cancelled: true }>>) => {
    if (!req.user) throw new UnauthorizedError("Authentication required");

    // Sanity: only the account owner (or an admin) can cancel.
    if (req.user.id !== req.body?.userId && req.body?.userId !== undefined) {
      throw new ForbiddenError("Cannot cancel deletion on another user's behalf");
    }

    await accountService.cancelDeletion(req.user.id);
    void auditActions.accountDeletionCancelled(getAuthCtx(req));

    res.json({ success: true, data: { cancelled: true } });
  }),
);
