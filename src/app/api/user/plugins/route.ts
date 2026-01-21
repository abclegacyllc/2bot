/**
 * User Plugins API Route (URL-based - Phase 6.7)
 *
 * GET /api/user/plugins - List personal installed plugins
 * POST /api/user/plugins - Install plugin for personal use
 *
 * Proxies to Express backend /api/user/plugins
 *
 * @module app/api/user/plugins/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/user/plugins${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[User Plugins] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plugins" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/user/plugins`, {
      method: "POST",
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
    console.error("[User Plugins] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to install plugin" },
      { status: 500 }
    );
  }
}
