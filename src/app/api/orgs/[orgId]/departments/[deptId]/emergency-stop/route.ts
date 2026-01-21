/**
 * Organization Department Emergency Stop API Route (URL-based - Phase 6.7)
 *
 * POST /api/orgs/:orgId/departments/:deptId/emergency-stop - Emergency stop department
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId/emergency-stop
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/emergency-stop/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string }> }
) {
  try {
    const { orgId, deptId } = await params;

    const response = await fetch(`${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/emergency-stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Org Department Emergency Stop] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to execute emergency stop" },
      { status: 500 }
    );
  }
}
