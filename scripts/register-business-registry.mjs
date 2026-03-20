#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import { loadBusinessRegistry } from "../lib/business-registry.mjs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://aagqvfwuixpxtdcrdxmv.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is required");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose") || args.includes("-v");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function log(message) {
  console.log(message);
}

function logVerbose(message) {
  if (verbose) {
    console.log(`  ${message}`);
  }
}

function mapBusinessToRow(business) {
  return {
    business_id: business.business_id,
    pod_id: business.pod_id,
    business_name: business.business_name,
    brand_name: business.brand_name,
    legal_entity: business.legal_entity,
    domain: business.domain,
    offer_model: business.offer_model,
    vertical: business.vertical,
    status: business.status,
    ghl_scope_type: business.resolved_ghl_scope_type,
    owner_pod: business.owner_pod,
    payment_provider: business.payment_provider,
    calendar_model: business.calendar_model,
    pipeline_set: business.pipeline_set,
    membership_config: business.membership,
    approval_policy: business.approval_policy,
    kpi_targets: business.kpi_targets,
    tenancy: {
      inputs: business.tenancy_inputs,
      reasons: business.tenancy_reasons,
      scope_family: business.scope_family,
    },
    automation_blueprint: business.automation_blueprint,
    rollout: {
      wave: business.rollout_wave,
      automation_target_rate: business.automation_target_rate,
    },
    metadata: {
      owner_lane_map: business.owner_lane_map,
      saas_instance_id: business.saas_instance_id || null,
    },
  };
}

async function main() {
  const registry = loadBusinessRegistry();
  const rows = registry.businesses.map(mapBusinessToRow);

  log(`Preparing ${rows.length} business registry rows`);

  for (const row of rows) {
    logVerbose(`${row.business_id} -> ${row.ghl_scope_type}`);
  }

  if (dryRun) {
    log(JSON.stringify({ dry_run: true, rows }, null, 2));
    return;
  }

  const { error } = await supabase
    .from("business_registry")
    .upsert(rows, { onConflict: "business_id" });

  if (error) {
    console.error(`Failed to upsert business registry: ${error.message}`);
    process.exit(1);
  }

  log(`Upserted ${rows.length} business registry rows`);
}

main();
