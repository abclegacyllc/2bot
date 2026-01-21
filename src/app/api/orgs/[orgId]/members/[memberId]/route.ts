/**
 * Organization Member Detail API Route (URL-based - Phase 6.7)
 *
 * PUT /api/orgs/:orgId/members/:memberId - Update member role
 * DELETE /api/orgs/:orgId/members/:memberId - Remove member from organization
 *
 * Proxies to Express backend /api/orgs/:orgId/members/:memberId
 *
 * @module app/api/orgs/[orgId]/members/[memberId]/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/members/${memberId}`, {
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
    console.error("[Org Member] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params;

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/members/${memberId}`, {
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
    console.error("[Org Member] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
