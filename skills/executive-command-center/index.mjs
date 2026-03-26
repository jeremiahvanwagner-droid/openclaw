/**
 * Executive Command Center — Core Logic
 * OpenClaw Phase 2 Intelligence Skill
 *
 * Aggregates data from all Phase 1 + Phase 2 skills into a single
 * portfolio briefing with bottleneck identification, risk surfacing,
 * and recommended next actions per business.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Config loading (cached) ────────────────────────────────────

let _businessRegistry = null;

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
}

function businessRegistry() {
  if (!_businessRegistry) _businessRegistry = loadJson('data/business-registry.json');
  return _businessRegistry;
}

export function resetCache() {
  _businessRegistry = null;
}

// ── Supabase client ────────────────────────────────────────────

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Generate a comprehensive portfolio briefing across all businesses.
 * Pulls from: daily_kpis, revenue_anomalies, compliance_scorecards,
 * integration_health_log, journey_scores, scope_violations_log.
 */
export async function generatePortfolioBriefing() {
  const sb = supabase();
  const registry = businessRegistry();
  const today = new Date().toISOString().slice(0, 10);
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

  // Parallel data fetching from all Phase 1 + Phase 2 tables
  const [
    kpisResult,
    anomaliesResult,
    complianceResult,
    integrationResult,
    journeyResult,
    violationsResult,
  ] = await Promise.all([
    sb.from('daily_kpis').select('*').eq('date', today),
    sb.from('revenue_anomalies').select('*').eq('resolved', false).gte('created_at', oneDayAgo),
    sb.from('compliance_scorecards').select('*').order('created_at', { ascending: false }).limit(10),
    sb.from('integration_health_log').select('*').gte('checked_at', oneDayAgo),
    sb.from('journey_scores').select('*').gte('scored_at', oneDayAgo),
    sb.from('scope_violations_log').select('*').gte('attempted_at', oneDayAgo),
  ]);

  const kpis = kpisResult.data || [];
  const anomalies = anomaliesResult.data || [];
  const scorecards = complianceResult.data || [];
  const healthLogs = integrationResult.data || [];
  const journeyScores = journeyResult.data || [];
  const violations = violationsResult.data || [];

  // Revenue summary per business
  const revenueByBusiness = {};
  for (const kpi of kpis) {
    revenueByBusiness[kpi.business_id] = {
      revenue: Number(kpi.revenue),
      leads: kpi.leads,
      conversions: kpi.conversions,
      appointments: kpi.appointments,
      churn: Number(kpi.churn),
      aov: Number(kpi.aov),
    };
  }

  // Totals
  const totals = kpis.reduce((acc, k) => ({
    total_revenue: acc.total_revenue + Number(k.revenue),
    total_leads: acc.total_leads + k.leads,
    total_conversions: acc.total_conversions + k.conversions,
  }), { total_revenue: 0, total_leads: 0, total_conversions: 0 });

  // Integration health summary
  const providerHealth = {};
  for (const log of healthLogs) {
    if (!providerHealth[log.provider]) {
      providerHealth[log.provider] = { checks: 0, healthy: 0, avg_latency: 0 };
    }
    providerHealth[log.provider].checks++;
    if (log.status === 'healthy') providerHealth[log.provider].healthy++;
    providerHealth[log.provider].avg_latency += (log.latency_ms || 0);
  }
  for (const p of Object.values(providerHealth)) {
    p.avg_latency = p.checks > 0 ? Math.round(p.avg_latency / p.checks) : 0;
    p.uptime_pct = p.checks > 0 ? Math.round((p.healthy / p.checks) * 100) : 0;
  }

  // Compliance summary by business
  const complianceByBusiness = {};
  for (const sc of scorecards) {
    if (!complianceByBusiness[sc.location_id]) {
      complianceByBusiness[sc.location_id] = sc;
    }
  }

  // Journey intelligence summary
  const highIntentCount = journeyScores.filter(s => s.intent_score >= 80).length;
  const avgIntentScore = journeyScores.length > 0
    ? Math.round(journeyScores.reduce((s, j) => s + j.intent_score, 0) / journeyScores.length)
    : 0;

  return {
    date: today,
    generated_at: new Date().toISOString(),
    portfolio: {
      ...totals,
      businesses_reporting: kpis.length,
      revenue_by_business: revenueByBusiness,
    },
    anomalies: {
      total: anomalies.length,
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      items: anomalies.slice(0, 10),
    },
    compliance: {
      scorecards: complianceByBusiness,
      avg_score: scorecards.length > 0
        ? Math.round(scorecards.reduce((s, c) => s + c.overall_score, 0) / scorecards.length)
        : 0,
    },
    integrations: {
      provider_health: providerHealth,
    },
    journey: {
      high_intent_contacts: highIntentCount,
      avg_intent_score: avgIntentScore,
      scores_today: journeyScores.length,
    },
    security: {
      scope_violations: violations.length,
      violations: violations.slice(0, 5),
    },
  };
}

/**
 * Identify the biggest bottlenecks across all businesses.
 */
export async function identifyBottlenecks() {
  const sb = supabase();
  const today = new Date().toISOString().slice(0, 10);
  const bottlenecks = [];

  // Check for businesses with 0 conversions but positive leads
  const { data: kpis } = await sb
    .from('daily_kpis')
    .select('*')
    .eq('date', today);

  for (const kpi of (kpis || [])) {
    if (kpi.leads > 0 && kpi.conversions === 0) {
      bottlenecks.push({
        type: 'conversion_blockage',
        business_id: kpi.business_id,
        severity: 'critical',
        detail: `${kpi.leads} leads, 0 conversions — funnel may be broken`,
      });
    }
    if (kpi.appointments > 0 && Number(kpi.revenue) === 0) {
      bottlenecks.push({
        type: 'close_rate_issue',
        business_id: kpi.business_id,
        severity: 'warning',
        detail: `${kpi.appointments} appointments but $0 revenue`,
      });
    }
  }

  // Check integration health for degraded providers
  const { data: integrations } = await sb
    .from('integration_health_log')
    .select('*')
    .gte('checked_at', new Date(Date.now() - 3600000).toISOString())
    .neq('status', 'healthy');

  for (const log of (integrations || [])) {
    bottlenecks.push({
      type: 'integration_degraded',
      provider: log.provider,
      severity: 'warning',
      detail: `${log.provider} endpoint degraded: ${log.error || 'unknown error'}`,
    });
  }

  return bottlenecks;
}

/**
 * Surface risks aggregated from all skills.
 */
export async function surfaceRisks() {
  const sb = supabase();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const risks = [];

  // Critical anomalies
  const { data: anomalies } = await sb
    .from('revenue_anomalies')
    .select('*')
    .eq('severity', 'critical')
    .eq('resolved', false);

  for (const a of (anomalies || [])) {
    risks.push({
      source: 'revenue_ops',
      type: 'critical_anomaly',
      business_id: a.business_id,
      detail: `${a.kpi_name}: expected ${a.expected_value}, got ${a.actual_value} (z=${a.z_score})`,
    });
  }

  // Low compliance scores
  const { data: scorecards } = await sb
    .from('compliance_scorecards')
    .select('*')
    .lt('overall_score', 70);

  for (const sc of (scorecards || [])) {
    risks.push({
      source: 'compliance',
      type: 'low_compliance',
      business_id: sc.location_id,
      detail: `Compliance score: ${sc.overall_score}/100`,
    });
  }

  // Scope violations
  const { data: violations } = await sb
    .from('scope_violations_log')
    .select('*')
    .gte('attempted_at', oneDayAgo);

  if ((violations || []).length > 0) {
    risks.push({
      source: 'scope_governor',
      type: 'scope_violations',
      detail: `${violations.length} scope violation(s) in last 24h`,
    });
  }

  return risks;
}

/**
 * Recommend top 3 actions for a business based on all available data.
 */
export async function recommendNextActions(businessId) {
  const sb = supabase();
  const today = new Date().toISOString().slice(0, 10);
  const actions = [];

  // Get KPIs
  const { data: kpi } = await sb
    .from('daily_kpis')
    .select('*')
    .eq('business_id', businessId)
    .eq('date', today)
    .single();

  // Get anomalies
  const { data: anomalies } = await sb
    .from('revenue_anomalies')
    .select('*')
    .eq('business_id', businessId)
    .eq('resolved', false);

  // Get high-intent contacts
  const { data: highIntent } = await sb
    .from('journey_scores')
    .select('*')
    .eq('business_id', businessId)
    .gte('intent_score', 80)
    .gte('scored_at', new Date(Date.now() - 86400000).toISOString());

  // Generate recommendations
  if ((anomalies || []).some(a => a.severity === 'critical')) {
    actions.push({
      priority: 1,
      action: 'Resolve critical anomaly',
      detail: `${anomalies.filter(a => a.severity === 'critical').length} critical anomaly(ies) need attention`,
      impact: 'high',
    });
  }

  if ((highIntent || []).length > 0) {
    actions.push({
      priority: 2,
      action: 'Engage high-intent contacts',
      detail: `${highIntent.length} contact(s) with intent score 80+`,
      impact: 'high',
    });
  }

  if (kpi && kpi.leads > 0 && kpi.conversions === 0) {
    actions.push({
      priority: 3,
      action: 'Investigate conversion funnel',
      detail: `${kpi.leads} leads but 0 conversions today`,
      impact: 'medium',
    });
  }

  // Fill remaining slots
  if (actions.length < 3 && kpi) {
    actions.push({
      priority: actions.length + 1,
      action: 'Review daily KPIs',
      detail: `Revenue: $${kpi.revenue}, Leads: ${kpi.leads}, Conversions: ${kpi.conversions}`,
      impact: 'low',
    });
  }

  return actions.slice(0, 3);
}

/**
 * Deliver briefing via the specified channel.
 */
export async function deliverBriefing(channel) {
  const briefing = await generatePortfolioBriefing();

  if (channel === 'telegram') {
    // Format for Telegram (summarized)
    const summary = [
      `📊 *OpenClaw Daily Briefing* — ${briefing.date}`,
      ``,
      `💰 Revenue: $${briefing.portfolio.total_revenue.toLocaleString()}`,
      `👥 Leads: ${briefing.portfolio.total_leads}`,
      `🔄 Conversions: ${briefing.portfolio.total_conversions}`,
      `📈 Businesses: ${briefing.portfolio.businesses_reporting}`,
      ``,
      `⚠️ Anomalies: ${briefing.anomalies.total} (${briefing.anomalies.critical} critical)`,
      `🛡️ Compliance avg: ${briefing.compliance.avg_score}/100`,
      `🎯 High-intent contacts: ${briefing.journey.high_intent_contacts}`,
      `🔒 Scope violations: ${briefing.security.scope_violations}`,
    ].join('\n');

    return { channel: 'telegram', delivered: true, summary };
  }

  // Dashboard channel returns full briefing
  return { channel: 'dashboard', delivered: true, briefing };
}
