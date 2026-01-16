/**
 * User Plugin Detail API Route
 *
 * GET /api/plugins/user/plugins/:id - Get user plugin by ID
 * PUT /api/plugins/user/plugins/:id/config - Update plugin config
 * DELETE /api/plugins/user/plugins/:id - Uninstall plugin
 *
 * @module app/api/plugins/user/plugins/[id]
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/api/plugins/user/plugins/${id}`, {
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
    console.error("User plugin GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user plugin" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/api/plugins/user/plugins/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("User plugin DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to uninstall plugin" },
      { status: 500 }
    );
  }
}
