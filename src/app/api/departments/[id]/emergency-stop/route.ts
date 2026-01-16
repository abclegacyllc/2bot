/**
 * Department Emergency Stop API Route
 *
 * POST /api/departments/:id/emergency-stop
 *
 * Proxies emergency stop request to Express server.
 *
 * @module app/api/departments/[id]/emergency-stop/route
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deptId } = await params;
    const authHeader = request.headers.get("authorization");

    const response = await fetch(
      `${API_URL}/api/departments/${deptId}/emergency-stop`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader && { Authorization: authHeader }),
          "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Emergency stop proxy error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
