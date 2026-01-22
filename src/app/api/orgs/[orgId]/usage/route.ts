/**
 * Organization Usage API Route
 *
 * GET /api/orgs/:orgId/usage - Get comprehensive organization usage data
 *
 * Proxies to Express backend /api/orgs/:orgId/usage
 *
 * @module app/api/orgs/[orgId]/usage/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/usage`, {
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
    console.error("[Orgs Usage] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization usage" },
      { status: 500 }
    );
  }
}
