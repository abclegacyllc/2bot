/**
 * Gateway Test API Route
 *
 * POST /api/gateways/:gatewayId/test - Test gateway connection
 *
 * @module app/api/gateways/[gatewayId]/test
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ gatewayId: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { gatewayId } = await params;
    const response = await fetch(`${BACKEND_URL}/api/gateways/${gatewayId}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
        Authorization: request.headers.get("authorization") || "",
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Gateway test POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to test gateway" },
      { status: 500 }
    );
  }
}
