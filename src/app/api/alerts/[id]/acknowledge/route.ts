/**
 * Alert Acknowledge API Route
 *
 * POST /api/alerts/[id]/acknowledge - Acknowledge an alert
 *
 * @module app/api/alerts/[id]/acknowledge
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(`${BACKEND_URL}/api/alerts/${id}/acknowledge`, {
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
    console.error("Alert acknowledge error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to acknowledge alert" },
      { status: 500 }
    );
  }
}
