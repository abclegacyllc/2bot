/**
 * Organization Members API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/members - List organization members
 * POST /api/orgs/:orgId/members - Invite member to organization
 *
 * Proxies to Express backend /api/orgs/:orgId/members
 *
 * @module app/api/orgs/[orgId]/members/route
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
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/orgs/${orgId}/members${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[Org Members] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/members`, {
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
    console.error("[Org Members] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to invite member" },
      { status: 500 }
    );
  }
}
