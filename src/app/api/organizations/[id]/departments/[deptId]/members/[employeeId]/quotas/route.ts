/**
 * Employee Quotas API Route
 * 
 * GET /api/organizations/:orgId/departments/:deptId/members/:employeeId/quotas - Get employee quotas
 * PUT /api/organizations/:orgId/departments/:deptId/members/:employeeId/quotas - Update employee quotas
 * 
 * Proxies to Express backend /api/departments/:deptId/members/:employeeId/quotas
 * 
 * @module app/api/organizations/[id]/departments/[deptId]/members/[employeeId]/quotas/route
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deptId: string; employeeId: string }> }
) {
  try {
    const { deptId, employeeId } = await params;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const res = await fetch(
      `${API_URL}/api/departments/${deptId}/members/${employeeId}/quotas`,
      {
        method: "GET",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error fetching employee quotas:", error);
    return NextResponse.json(
      { error: "Failed to fetch quotas" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deptId: string; employeeId: string }> }
) {
  try {
    const { deptId, employeeId } = await params;
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const res = await fetch(
      `${API_URL}/api/departments/${deptId}/members/${employeeId}/quotas`,
      {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error updating employee quotas:", error);
    return NextResponse.json(
      { error: "Failed to update quotas" },
      { status: 500 }
    );
  }
}
