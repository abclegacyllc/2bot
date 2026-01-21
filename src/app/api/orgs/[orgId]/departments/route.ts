/**
 * Organization Departments API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/departments - List organization departments
 * POST /api/orgs/:orgId/departments - Create organization department
 *
 * Proxies to Express backend /api/orgs/:orgId/departments
 *
 * @module app/api/orgs/[orgId]/departments/route
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
    const url = `${BACKEND_URL}/api/orgs/${orgId}/departments${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[Org Departments] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch departments" },
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments`, {
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
    console.error("[Org Departments] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create department" },
      { status: 500 }
    );
  }
}
