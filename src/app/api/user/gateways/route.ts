/**
 * User Gateways API Route (URL-based - Phase 6.7)
 *
 * GET /api/user/gateways - List personal gateways
 * POST /api/user/gateways - Create personal gateway
 *
 * Proxies to Express backend /api/user/gateways
 *
 * @module app/api/user/gateways/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/user/gateways${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[User Gateways] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch gateways" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/user/gateways`, {
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
    console.error("[User Gateways] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create gateway" },
      { status: 500 }
    );
  }
}
