/**
 * Plugin Analytics API Route
 *
 * GET /api/plugins/user/plugins/:id/analytics - Get analytics data
 *
 * @module app/api/plugins/user/plugins/[id]/analytics
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/api/plugins/user/plugins/${id}/analytics`, {
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
    console.error("Plugin analytics GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plugin analytics" },
      { status: 500 }
    );
  }
}
