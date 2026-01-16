/**
 * Alert Config API Route
 *
 * GET /api/alerts/config - Get alert configuration
 * PUT /api/alerts/config - Update alert configuration
 *
 * @module app/api/alerts/config
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/alerts/config`, {
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
    console.error("Alert config GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch alert config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/alerts/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Alert config PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update alert config" },
      { status: 500 }
    );
  }
}
