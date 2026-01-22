/**
 * Usage API Route
 *
 * GET /api/usage - Get comprehensive usage data for dashboard
 *
 * @module app/api/usage
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/usage`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Usage GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch usage data" },
      { status: 500 }
    );
  }
}
