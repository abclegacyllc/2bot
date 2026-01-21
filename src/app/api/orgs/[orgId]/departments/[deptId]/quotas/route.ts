/**
 * Organization Department Quotas API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/departments/:deptId/quotas - Get department quotas
 * PUT /api/orgs/:orgId/departments/:deptId/quotas - Update department quotas
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId/quotas
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/quotas/route
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/quotas`, {
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
    console.error("[Org Department Quotas] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch department quotas" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string }> }
) {
  try {
    const { orgId, deptId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/quotas`, {
      method: "PUT",
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
    console.error("[Org Department Quotas] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update department quotas" },
      { status: 500 }
    );
  }
}
