import { NextResponse } from "next/server";

import { buildPortfolioSummary, loadBusinessRegistry } from "../../../../../lib/business-registry.mjs";

export async function GET() {
  try {
    const registry = loadBusinessRegistry();
    const summary = buildPortfolioSummary(registry);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load portfolio summary" },
      { status: 500 },
    );
  }
}
