/**
 * Department Member API Route
 * 
 * PUT /api/organizations/:orgId/departments/:deptId/members/:employeeId - Update member role
 * DELETE /api/organizations/:orgId/departments/:deptId/members/:employeeId - Remove member
 * 
 * Proxies to Express backend /api/departments/:deptId/members/:userId
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deptId: string; employeeId: string }> }
) {
  try {
    const { deptId, employeeId } = await params;
    const authHeader = request.headers.get("Authorization");
    const body = await request.json();

    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_URL}/api/departments/${deptId}/members/${employeeId}`, {
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
    console.error("Error updating department member:", error);
    return NextResponse.json(
      { error: "Failed to update department member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const res = await fetch(`${API_URL}/api/departments/${deptId}/members/${employeeId}`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error removing department member:", error);
    return NextResponse.json(
      { error: "Failed to remove department member" },
      { status: 500 }
    );
  }
}
