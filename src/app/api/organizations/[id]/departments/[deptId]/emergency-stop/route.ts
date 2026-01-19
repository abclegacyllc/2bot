/**
 * Department Emergency Stop API Route
 * 
 * POST /api/organizations/:orgId/departments/:deptId/emergency-stop
 * 
 * Proxies to Express backend /api/departments/:deptId/emergency-stop
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deptId: string }> }
) {
  try {
    const { deptId } = await params;
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_URL}/api/departments/${deptId}/emergency-stop`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error triggering emergency stop:", error);
    return NextResponse.json(
      { error: "Failed to trigger emergency stop" },
      { status: 500 }
    );
  }
}
