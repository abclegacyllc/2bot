/**
 * Department Members API Route
 * 
 * GET /api/organizations/:orgId/departments/:deptId/members - List department members
 * POST /api/organizations/:orgId/departments/:deptId/members - Add member to department
 * 
 * Proxies to Express backend /api/departments/:deptId/members
 * 
 * @module app/api/organizations/[id]/departments/[deptId]/members/route
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

    const res = await fetch(
      `${API_URL}/api/departments/${deptId}/members`,
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
    console.error("Error fetching department members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();

    const res = await fetch(
      `${API_URL}/api/departments/${deptId}/members`,
      {
        method: "POST",
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
    console.error("Error adding department member:", error);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    );
  }
}
