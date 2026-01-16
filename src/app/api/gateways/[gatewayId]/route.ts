/**
 * Gateway Detail API Route
 *
 * GET /api/gateways/:gatewayId - Get gateway by ID
 * PUT /api/gateways/:gatewayId - Update gateway
 * DELETE /api/gateways/:gatewayId - Delete gateway
 *
 * @module app/api/gateways/[gatewayId]
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

type Params = Promise<{ gatewayId: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { gatewayId } = await params;
    const response = await fetch(`${BACKEND_URL}/api/gateways/${gatewayId}`, {
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
    console.error("Gateway GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch gateway" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { gatewayId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/gateways/${gatewayId}`, {
      method: "PUT",
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
    console.error("Gateway PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update gateway" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const { gatewayId } = await params;
    const response = await fetch(`${BACKEND_URL}/api/gateways/${gatewayId}`, {
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
    console.error("Gateway DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete gateway" },
      { status: 500 }
    );
  }
}
