/**
 * Billing Resume API Route
 *
 * POST /api/billing/resume - Resume canceled subscription
 *
 * @module app/api/billing/resume
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/billing/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Billing resume POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resume subscription" },
      { status: 500 }
    );
  }
}
