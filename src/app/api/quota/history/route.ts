/**
 * Quota History API Route
 * GET /api/quota/history - Get quota usage history
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization");
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${API_URL}/api/quota/history${searchParams ? `?${searchParams}` : ""}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: token }),
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Quota history GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quota history" },
      { status: 500 }
    );
  }
}
