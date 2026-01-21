/**
 * Organization Details API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId - Get organization details
 * PUT /api/orgs/:orgId - Update organization
 * DELETE /api/orgs/:orgId - Delete organization
 *
 * Proxies to Express backend /api/orgs/:orgId
 *
 * @module app/api/orgs/[orgId]/route
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
    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}`, {
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
    console.error("[Orgs] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}`, {
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
    console.error("[Orgs] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}`, {
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
    console.error("[Orgs] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
