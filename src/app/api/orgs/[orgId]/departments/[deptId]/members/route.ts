/**
 * Organization Department Members API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/departments/:deptId/members - List department members
 * POST /api/orgs/:orgId/departments/:deptId/members - Add member to department
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId/members
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/members/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string }> }
) {
  try {
    const { orgId, deptId } = await params;
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/members${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[Org Department Members] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string }> }
) {
  try {
    const { orgId, deptId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/members`, {
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
    console.error("[Org Department Members] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add member" },
      { status: 500 }
    );
  }
}
