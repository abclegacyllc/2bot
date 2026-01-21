/**
 * User Organizations API Route (URL-based - Phase 6.7)
 *
 * GET /api/user/organizations - List user's organizations
 * POST /api/user/organizations - Create new organization
 *
 * Proxies to Express backend /api/user/organizations
 *
 * @module app/api/user/organizations/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/user/organizations${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[User Organizations] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/user/organizations`, {
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
    console.error("[User Organizations] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
