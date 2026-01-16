/**
 * Plugin Detail API Route
 *
 * GET /api/plugins/:slug - Get plugin by slug (public)
 *
 * @module app/api/plugins/[slug]
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ slug: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { slug } = await params;
    const response = await fetch(`${BACKEND_URL}/api/plugins/${slug}`, {
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
    console.error("Plugin detail GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plugin" },
      { status: 500 }
    );
  }
}
