#!/usr/bin/env node

import {
  evaluatePlatformOperation,
  loadPlatformOpsBundle,
  validatePlatformOpsBundle,
} from "../../lib/platform-ops-governance.mjs";

async function main() {
  const bundle = await loadPlatformOpsBundle();
  const validation = validatePlatformOpsBundle(bundle);

  const samples = [
    {
      id: "ghl-read-safe",
      request: {
        lane: "ghl",
        action: "contact_read",
        agentId: "d8_crm_ops",
        source: "ghl",
        payload: { contact_id: "contact-001" },
      },
      expectedStatus: "approved_auto",
    },
    {
      id: "social-publish-gated",
      request: {
        lane: "social",
        action: "post_publish",
        agentId: "d1_cmo",
        source: "social",
        payload: {
          platform: "instagram",
          content: "Sample",
          media_urls: ["https://example.com/asset.jpg"],
          approved_by: "operator",
          content_hash: "hash-001",
        },
      },
      expectedStatus: "approval_required",
    },
    {
      id: "skool-read-safe",
      request: {
        lane: "skool",
        action: "community_read",
        agentId: "d8_community_manager",
        source: "skool",
        payload: { community_id: "community-001" },
      },
      expectedStatus: "approved_auto",
    },
    {
      id: "substack-critical-gated",
      request: {
        lane: "substack",
        action: "issue_publish",
        agentId: "d5_publisher",
        source: "substack",
        payload: {
          draft_id: "draft-001",
          qa_passed: true,
          approved_by: "operator",
          publish_at: "2026-03-30T12:00:00.000Z",
        },
      },
      expectedStatus: "approval_required",
    },
  ];

  const sampleResults = [];
  for (const sample of samples) {
    const decision = await evaluatePlatformOperation(sample.request, { bundle, persist: false });
    sampleResults.push({
      id: sample.id,
      expected_status: sample.expectedStatus,
      actual_status: decision.status,
      ok: decision.status === sample.expectedStatus,
      reason: decision.reason || null,
    });
  }

  const sampleFailures = sampleResults.filter((entry) => !entry.ok);

  const report = {
    action: "validate-platform-ops-foundation",
    timestamp: new Date().toISOString(),
    validation,
    sample_results: sampleResults,
    ok: validation.ok && sampleFailures.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "validate-platform-ops-foundation",
        ok: false,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
