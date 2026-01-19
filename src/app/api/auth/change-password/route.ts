/**
 * Change Password API Route
 * 
 * POST /api/auth/change-password - Change user password
 * 
 * @module api/auth/change-password
 */

import { authService } from "@/modules/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Change user password
 */
export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 401 }
      );
    }

    // Validate session and get user
    const user = await authService.validateSession(token);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    // Change password
    await authService.changePassword(user.id, currentPassword, newPassword);

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    // Handle specific auth errors
    if (error instanceof Error) {
      const statusMap: Record<string, number> = {
        INVALID_PASSWORD: 400,
        PASSWORD_WEAK: 400,
        USER_NOT_FOUND: 404,
      };

      // Check if error has a code property (AuthError)
      const errorCode = (error as { code?: string }).code;
      const status = errorCode ? statusMap[errorCode] || 400 : 400;

      return NextResponse.json(
        { error: error.message },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}
