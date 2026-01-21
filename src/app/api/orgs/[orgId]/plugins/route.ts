/**
 * Organization Plugins API Route (URL-based - Phase 6.7)
 *
 * GET /api/orgs/:orgId/plugins - List organization plugins
 * POST /api/orgs/:orgId/plugins - Install plugin for organization
 *
 * Proxies to Express backend /api/orgs/:orgId/plugins
 *
 * @module app/api/orgs/[orgId]/plugins/route
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
    const url = `${BACKEND_URL}/api/orgs/${orgId}/plugins${searchParams ? `?${searchParams}` : ""}`;

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
    console.error("[Org Plugins] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plugins" },
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

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/plugins`, {
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
    console.error("[Org Plugins] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to install plugin" },
      { status: 500 }
    );
  }
}
