/**
 * Organization Department Detail API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/departments/:deptId - Get department details
 * PUT /api/orgs/:orgId/departments/:deptId - Update department
 * DELETE /api/orgs/:orgId/departments/:deptId - Delete department
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/route
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}`, {
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
    console.error("[Org Department] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch department" },
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}`, {
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
    console.error("[Org Department] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update department" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string }> }
) {
  try {
    const { orgId, deptId } = await params;

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Org Department] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete department" },
      { status: 500 }
    );
  }
}
