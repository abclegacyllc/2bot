/**
 * Quota Realtime API Route
 * GET /api/quota/realtime - Get realtime quota usage
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization");

    const response = await fetch(`${API_URL}/api/quota/realtime`, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: token }),
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Quota realtime GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch realtime quota" },
      { status: 500 }
    );
  }
}
