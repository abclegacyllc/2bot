/**
 * Organization Department Member Emergency Stop API Route (URL-based - Phase 6.7)
 *
 * POST /api/orgs/:orgId/departments/:deptId/members/:memberId/emergency-stop - Emergency stop member
 *
 * Proxies to Express backend /api/orgs/:orgId/departments/:deptId/members/:memberId/emergency-stop
 *
 * @module app/api/orgs/[orgId]/departments/[deptId]/members/[memberId]/emergency-stop/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; deptId: string; memberId: string }> }
) {
  try {
    const { orgId, deptId, memberId } = await params;

    const response = await fetch(
      `${BACKEND_URL}/api/orgs/${orgId}/departments/${deptId}/members/${memberId}/emergency-stop`,
      {
        method: "POST",
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
    console.error("[Org Dept Member Emergency Stop] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to execute emergency stop" },
      { status: 500 }
    );
  }
}
