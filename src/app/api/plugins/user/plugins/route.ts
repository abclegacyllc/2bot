/**
 * User Plugins API Route
 *
 * GET /api/plugins/user/plugins - List user's installed plugins
 *
 * @module app/api/plugins/user/plugins
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/plugins/user/plugins${searchParams ? `?${searchParams}` : ""}`;

    const response = await fetch(url, {
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
    console.error("User plugins GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user plugins" },
      { status: 500 }
    );
  }
}
