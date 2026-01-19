/**
 * Quota Status API Route
 *
 * GET /api/quota/status - Get current quota status
 *
 * @module app/api/quota/status
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/quota/status`, {
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
    console.error("Quota status GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quota status" },
      { status: 500 }
    );
  }
}
