/**
 * Organization Quota API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/quota - Get organization quota status
 *
 * Proxies to Express backend /api/orgs/:orgId/quota
 *
 * @module app/api/orgs/[orgId]/quota/route
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/quota`, {
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
    console.error("[Org Quota] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quota status" },
      { status: 500 }
    );
  }
}
