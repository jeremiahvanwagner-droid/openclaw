#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadBusinessRegistry } from '../lib/business-registry.mjs';
import { buildPortfolioWorkflowWebhookPlan } from '../lib/ghl-workflow-blueprint.mjs';
import {
  DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH,
  loadWorkflowWebhookRegistry,
  saveWorkflowWebhookRegistry,
  upsertWorkflowWebhookEntries,
} from '../lib/workflow-webhook-registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_PLAN_PATH = join(
  process.env.USERPROFILE || process.env.HOME || ROOT_DIR,
  '.openclaw',
  'data',
  'generated-ghl-workflow-webhook-plan.json',
);

function parseArgs(args) {
  const result = { business: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = index + 1 < args.length && !args[index + 1].startsWith('--')
      ? args[++index]
      : true;

    if (key === 'business') {
      result.business.push(value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function filterRegistry(registry, opts) {
  const wantedBusinesses = new Set((opts.business || []).filter(Boolean));
  const wave = opts.wave ? Number(opts.wave) : null;

  const businesses = registry.businesses.filter(business => {
    if (wantedBusinesses.size > 0 && !wantedBusinesses.has(business.business_id)) {
      return false;
    }
    if (wave !== null && business.rollout_wave !== wave) {
      return false;
    }
    return true;
  });

  return {
    ...registry,
    businesses,
  };
}

async function writePlan(planPath, plan) {
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = opts['base-url'] || process.env.OPENCLAW_PUBLIC_WEBHOOK_BASE_URL || process.env.OPENCLAW_GHL_WEBHOOK_BASE_URL || 'http://127.0.0.1:8788';
  const handlerPath = opts['handler-path'] || '/webhook/ghl';
  const authMode = opts['auth-mode'] || 'bearer';
  const writePlanFile = opts['write-plan'] !== false;
  const planPath = opts['plan-path'] || DEFAULT_PLAN_PATH;
  const registerMapped = Boolean(opts['register-mapped']);
  const registryPath = opts['registry-path'] || DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH;

  const registry = filterRegistry(loadBusinessRegistry(), opts);
  const plan = buildPortfolioWorkflowWebhookPlan(registry, {
    baseUrl,
    handlerPath,
    authMode,
  });

  if (writePlanFile) {
    await writePlan(planPath, plan);
  }

  let registeredEntries = 0;
  if (registerMapped) {
    const mappedEntries = plan.outbound_webhooks.filter(
      entry => entry.location_mapping_status === 'mapped',
    );
    const mappedBusinessIds = Array.from(new Set(mappedEntries.map(entry => entry.business_id)));
    const existing = loadWorkflowWebhookRegistry(registryPath);
    const nextRegistry = upsertWorkflowWebhookEntries(existing, mappedEntries, {
      replaceBusinessIds: mappedBusinessIds,
      replaceSource: 'portfolio_bootstrap',
    });
    saveWorkflowWebhookRegistry(nextRegistry, registryPath);
    registeredEntries = mappedEntries.length;
  }

  console.log(JSON.stringify({
    action: 'bootstrap-ghl-workflow-webhooks',
    baseUrl,
    handlerPath,
    authMode,
    businessesSelected: registry.businesses.length,
    totalOutboundWebhooks: plan.total_outbound_webhooks,
    mappedBusinesses: plan.mapped_businesses,
    pendingLocationMappingBusinesses: plan.pending_location_mapping_businesses,
    mappedOutboundWebhooks: plan.mapped_outbound_webhooks,
    registeredEntries,
    wrotePlan: writePlanFile,
    planPath: writePlanFile ? planPath : null,
    registryPath: registerMapped ? registryPath : null,
  }, null, 2));
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
