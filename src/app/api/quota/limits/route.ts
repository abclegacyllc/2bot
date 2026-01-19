/**
 * Quota Limits API Route
 * GET /api/quota/limits - Get effective quota limits
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization");

    const response = await fetch(`${API_URL}/api/quota/limits`, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: token }),
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Quota limits GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quota limits" },
      { status: 500 }
    );
  }
}
