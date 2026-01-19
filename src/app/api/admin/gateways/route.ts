/**
 * Admin Gateways API Route
 *
 * GET /api/admin/gateways - List all gateways (paginated)
 * Protected by admin role check.
 *
 * @module app/api/admin/gateways/route
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const queryString = url.search;

    const res = await fetch(`${API_URL}/api/admin/gateways${queryString}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error fetching admin gateways:", error);
    return NextResponse.json(
      { error: "Failed to fetch gateways" },
      { status: 500 }
    );
  }
}
