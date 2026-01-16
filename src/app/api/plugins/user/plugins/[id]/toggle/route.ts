/**
 * Plugin Toggle API Route
 *
 * POST /api/plugins/user/plugins/:id/toggle - Enable/disable plugin
 *
 * @module app/api/plugins/user/plugins/[id]/toggle
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/plugins/user/plugins/${id}/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Plugin toggle POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to toggle plugin" },
      { status: 500 }
    );
  }
}
