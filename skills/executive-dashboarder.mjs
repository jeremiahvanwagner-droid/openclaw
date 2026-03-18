#!/usr/bin/env node
/**
 * Executive Dashboarder
 * Compile portfolio-level business and SaaS metrics into a daily summary.
 *
 * Usage: node executive-dashboarder.mjs <command> [args...]
 *
 * Commands:
 *   generate [--days <1>]           Generate executive summary
 *   compare --period_a "<p>" --period_b "<p>"  Compare two periods
 *   deliver --channel "<telegram|sms>"         Send latest summary
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import {
  buildPortfolioSummary,
  loadBusinessRegistry,
} from "../lib/business-registry.mjs";

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || "", ".openclaw");
const TOKENS_PATH = join(OPENCLAW_ROOT, "credentials", "ghl-oauth-tokens.json");
const INSTANCES_PATH = join(OPENCLAW_ROOT, "data", "saas-instances.json");
const REPORTS_PATH = join(OPENCLAW_ROOT, "reports", "executive-dashboards.json");
const GHL_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      const key = args[index].slice(2);
      result[key] =
        index + 1 < args.length && !args[index + 1].startsWith("--")
          ? args[++index]
          : true;
    }
  }
  return result;
}

function loadReports() {
  if (!existsSync(REPORTS_PATH)) return { dashboards: [] };
  return JSON.parse(readFileSync(REPORTS_PATH, "utf-8"));
}

function saveReports(data) {
  const dir = dirname(REPORTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REPORTS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function loadInstances() {
  if (!existsSync(INSTANCES_PATH)) return { instances: [] };
  return JSON.parse(readFileSync(INSTANCES_PATH, "utf-8"));
}

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) return null;
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  for (const entry of Object.values(tokens.instances || {})) {
    if (entry.location_id === locationId) return entry.access_token;
  }
  return null;
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) {
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, MIN_CALL_SPACING_MS - elapsed),
    );
  }

  lastCallAt = Date.now();

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${GHL_BASE}${endpoint}`, options);
  if (!response.ok) return null;
  return response.json();
}

function resolveBusinessLocation(business, instances) {
  const directLocation = business.ghl_location_id || business.ghl?.location_id;
  if (directLocation) return directLocation;

  if (!business.saas_instance_id) return null;
  const instance = (instances.instances || []).find(
    (candidate) => candidate.saas_instance_id === business.saas_instance_id,
  );

  return instance?.ghl_location_id || instance?.sub_accounts?.[0]?.location_id || null;
}

async function collectBusinessTelemetry(business, instances, days) {
  const telemetry = {
    business_id: business.business_id,
    business_name: business.business_name,
    brand_name: business.brand_name,
    scope_type: business.resolved_ghl_scope_type,
    scope_family: business.scope_family,
    rollout_wave: business.rollout_wave,
    automation_target_rate: business.automation_target_rate,
    blueprint_coverage_rate: business.automation_blueprint_summary.coverage,
    contacts: 0,
    opportunities: 0,
    appointments: 0,
    telemetry_status: "not_configured",
  };

  const locationId = resolveBusinessLocation(business, instances);
  if (!locationId) {
    return telemetry;
  }

  const token = findTokenForLocation(locationId);
  if (!token) {
    return {
      ...telemetry,
      telemetry_status: "missing_token",
    };
  }

  telemetry.telemetry_status = "live";

  const contacts = await apiCall(
    "GET",
    `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`,
    token,
  );
  if (contacts) {
    telemetry.contacts = contacts.meta?.total || contacts.total || 0;
  }

  const pipelines = await apiCall(
    "GET",
    `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
    token,
  );
  if (pipelines?.pipelines) {
    for (const pipeline of pipelines.pipelines) {
      const opportunities = await apiCall(
        "GET",
        `/opportunities/?locationId=${encodeURIComponent(locationId)}&pipelineId=${pipeline.id}&limit=1`,
        token,
      );
      if (opportunities) {
        telemetry.opportunities += opportunities.meta?.total || 0;
      }
    }
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 86400000).toISOString();
  const calendars = await apiCall(
    "GET",
    `/calendars/?locationId=${encodeURIComponent(locationId)}`,
    token,
  );
  if (calendars?.calendars) {
    for (const calendar of calendars.calendars) {
      const appointments = await apiCall(
        "GET",
        `/calendars/${calendar.id}/appointments?locationId=${encodeURIComponent(locationId)}&startDate=${startDate}&endDate=${now.toISOString()}`,
        token,
      );
      if (appointments?.appointments) {
        telemetry.appointments += appointments.appointments.length;
      }
    }
  }

  return telemetry;
}

function formatSummary(metrics, days) {
  const lines = [
    `EXECUTIVE DASHBOARD (${days}d)`,
    "------------------------",
    `Business scopes: ${metrics.total_businesses}`,
    `Dedicated / Shared / Internal: ${metrics.dedicated_scopes} / ${metrics.shared_scopes} / ${metrics.internal_scopes}`,
    `Automation target: ${(metrics.automation_target_rate * 100).toFixed(1)}%`,
    `Blueprint coverage: ${(metrics.blueprint_coverage_rate * 100).toFixed(1)}%`,
    `Live telemetry scopes: ${metrics.live_telemetry_scopes}/${metrics.total_businesses}`,
    `Total contacts: ${metrics.total_contacts.toLocaleString()}`,
    `Pipeline opportunities: ${metrics.total_opportunities.toLocaleString()}`,
    `Appointments booked: ${metrics.appointments_booked.toLocaleString()}`,
    "",
    "BUSINESS SCOPES:",
    ...metrics.per_business.map(
      (business) =>
        `- ${business.business_name} [${business.scope_type}] ` +
        `telemetry=${business.telemetry_status} contacts=${business.contacts} ` +
        `opps=${business.opportunities} appts=${business.appointments}`,
    ),
  ];

  if (metrics.saas_instances > 0) {
    lines.push("");
    lines.push(`SaaS instances tracked: ${metrics.saas_instances}`);
  }

  return lines.join("\n");
}

async function generateDashboard(args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || "1", 10);
  const registry = loadBusinessRegistry();
  const instances = loadInstances();
  const summary = buildPortfolioSummary(registry);
  const portfolioMetrics = {
    ...summary,
    saas_instances: instances.instances?.length || 0,
    live_telemetry_scopes: 0,
    total_contacts: 0,
    total_opportunities: 0,
    appointments_booked: 0,
    per_business: [],
  };

  for (const business of registry.businesses) {
    const telemetry = await collectBusinessTelemetry(business, instances, days);
    if (telemetry.telemetry_status === "live") {
      portfolioMetrics.live_telemetry_scopes += 1;
    }
    portfolioMetrics.total_contacts += telemetry.contacts;
    portfolioMetrics.total_opportunities += telemetry.opportunities;
    portfolioMetrics.appointments_booked += telemetry.appointments;
    portfolioMetrics.per_business.push(telemetry);
  }

  const dashboard = {
    generated_at: new Date().toISOString(),
    period_days: days,
    portfolio: portfolioMetrics,
    summary: formatSummary(portfolioMetrics, days),
  };

  const reports = loadReports();
  reports.dashboards.push(dashboard);
  if (reports.dashboards.length > 90) {
    reports.dashboards = reports.dashboards.slice(-90);
  }
  saveReports(reports);

  console.log(JSON.stringify(dashboard, null, 2));
}

function comparePeriods(args) {
  const opts = parseArgs(args);
  if (!opts.period_a || !opts.period_b) {
    throw new Error('Required: --period_a "<date>" --period_b "<date>"');
  }

  const reports = loadReports();
  const first = reports.dashboards.find((report) =>
    report.generated_at.startsWith(opts.period_a),
  );
  const second = reports.dashboards.find((report) =>
    report.generated_at.startsWith(opts.period_b),
  );

  if (!first || !second) {
    throw new Error("One or both periods not found in dashboard history");
  }

  const delta = (a, b) =>
    b !== 0 ? `${(((a - b) / b) * 100).toFixed(1)}%` : "N/A";

  console.log(
    JSON.stringify(
      {
        action: "compare",
        period_a: opts.period_a,
        period_b: opts.period_b,
        contacts: {
          a: first.portfolio.total_contacts,
          b: second.portfolio.total_contacts,
          change: delta(first.portfolio.total_contacts, second.portfolio.total_contacts),
        },
        opportunities: {
          a: first.portfolio.total_opportunities,
          b: second.portfolio.total_opportunities,
          change: delta(
            first.portfolio.total_opportunities,
            second.portfolio.total_opportunities,
          ),
        },
        appointments: {
          a: first.portfolio.appointments_booked,
          b: second.portfolio.appointments_booked,
          change: delta(
            first.portfolio.appointments_booked,
            second.portfolio.appointments_booked,
          ),
        },
        live_telemetry_scopes: {
          a: first.portfolio.live_telemetry_scopes,
          b: second.portfolio.live_telemetry_scopes,
          change: delta(
            first.portfolio.live_telemetry_scopes,
            second.portfolio.live_telemetry_scopes,
          ),
        },
      },
      null,
      2,
    ),
  );
}

function deliverSummary(args) {
  const opts = parseArgs(args);
  if (!opts.channel) {
    throw new Error('Required: --channel "<telegram|sms>"');
  }

  const reports = loadReports();
  const latest = reports.dashboards[reports.dashboards.length - 1];
  if (!latest) {
    throw new Error("No dashboard generated yet - run generate first");
  }

  console.log(
    JSON.stringify(
      {
        action: "deliver",
        channel: opts.channel,
        event: "alert/telegram",
        payload: {
          message: latest.summary,
          priority: "normal",
          source: "d8_integration_engineer",
        },
        status: "queued",
      },
      null,
      2,
    ),
  );
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    console.log("Usage: node executive-dashboarder.mjs <command> [args...]");
    console.log("Commands: generate, compare, deliver");
    process.exit(1);
  }

  try {
    switch (command) {
      case "generate":
        await generateDashboard(args);
        break;
      case "compare":
        comparePeriods(args);
        break;
      case "deliver":
        deliverSummary(args);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
