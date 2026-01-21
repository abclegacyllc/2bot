/**
 * Organization Department Member Quotas API Route (URL-based - Phase 6.7)
 *
 * PUT /api/orgs/:orgId/departments/:deptId/members/:memberId/quotas - Update member quotas
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId/members/:memberId/quotas
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/members/[memberId]/quotas/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string; memberId: string }> }
) {
  try {
    const { orgId, deptId, memberId } = await params;

    const response = await fetch(
      `${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/members/${memberId}/quotas`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
          Authorization: request.headers.get("authorization") || "",
        },
      }
    );

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Org Dept Member Quotas] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch member quotas" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string; memberId: string }> }
) {
  try {
    const { orgId, deptId, memberId } = await params;
    const body = await request.json();

    const response = await fetch(
      `${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/members/${memberId}/quotas`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
          Authorization: request.headers.get("authorization") || "",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Org Dept Member Quotas] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update member quotas" },
      { status: 500 }
    );
  }
}
