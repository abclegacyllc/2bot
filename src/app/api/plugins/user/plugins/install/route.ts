/**
 * Plugin Install API Route
 *
 * POST /api/plugins/user/plugins/install - Install a plugin
 *
 * @module app/api/plugins/user/plugins/install
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/plugins/user/plugins/install`, {
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
    console.error("Plugin install POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to install plugin" },
      { status: 500 }
    );
  }
}
