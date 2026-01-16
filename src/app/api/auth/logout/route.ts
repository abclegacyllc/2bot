/**
 * Logout API Route
 *
 * Proxies logout requests to Express server.
 */

import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    const response = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader && { Authorization: authHeader }),
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Logout proxy error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
