/**
 * Department Quotas API Route
 * 
 * GET /api/organizations/:orgId/departments/:deptId/quotas - Get department quotas
 * PUT /api/organizations/:orgId/departments/:deptId/quotas - Update department quotas
 * 
 * Proxies to Express backend /api/departments/:deptId/quotas
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function GET(
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

    const res = await fetch(`${API_URL}/api/departments/${deptId}/quotas`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error fetching department quotas:", error);
    return NextResponse.json(
      { error: "Failed to fetch department quotas" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deptId: string }> }
) {
  try {
    const { deptId } = await params;
    const authHeader = request.headers.get("Authorization");
    const body = await request.json();

    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_URL}/api/departments/${deptId}/quotas`, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error updating department quotas:", error);
    return NextResponse.json(
      { error: "Failed to update department quotas" },
      { status: 500 }
    );
  }
}
