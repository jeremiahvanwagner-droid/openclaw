import { NextResponse } from "next/server";

// Portfolio data is loaded from the local filesystem (data/business-registry.json)
// which is only available in the self-hosted environment, not on Vercel.
// This route returns a not-available response when deployed to Vercel.

export async function GET() {
  return NextResponse.json(
    { error: "Portfolio API is not available in this deployment. Use the self-hosted gateway." },
    { status: 503 },
  );
}
