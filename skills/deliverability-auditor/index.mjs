import { supabase } from '../../lib/agent-memory.js';

const AUDIT_TABLE    = 'deliverability_audits';
const SUPPRESS_TABLE = 'deliverability_suppressions';

function calcHealthScore(metrics) {
  const deliveryScore = Math.max(0, Math.min(100, (metrics.delivery_rate - 0.90) / (0.98 - 0.90) * 100)) * 0.30;
  const openScore     = Math.max(0, Math.min(100, (metrics.open_rate - 0.05) / (0.25 - 0.05) * 100)) * 0.25;
  const bounceScore   = Math.max(0, Math.min(100, (0.05 - metrics.bounce_rate) / (0.05 - 0.01) * 100)) * 0.20;
  const complaintScore = Math.max(0, Math.min(100, (0.005 - metrics.complaint_rate) / (0.005 - 0.0005) * 100)) * 0.15;
  const unsubScore    = Math.max(0, Math.min(100, (0.02 - metrics.unsubscribe_rate) / (0.02 - 0.002) * 100)) * 0.10;
  return Math.round(deliveryScore + openScore + bounceScore + complaintScore + unsubScore);
}

function riskLevel(score) {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

function buildRecommendations(metrics, risk) {
  const recs = [];
  if (metrics.bounce_rate > 0.02) recs.push('Suppress hard bounces immediately and validate list before next send');
  if (metrics.complaint_rate > 0.001) recs.push('Review recent campaign content for spam triggers and reduce send frequency');
  if (metrics.open_rate < 0.10) recs.push('Segment cold contacts and run re-engagement sequence before sunsetting');
  if (risk === 'critical') recs.push('Pause all campaigns and perform full list audit before resuming');
  if (risk === 'at_risk') recs.push('Reduce campaign frequency to 1x/week and focus on engaged segment only');
  return recs;
}

export async function auditDeliverability(locationId, campaignStats, options = {}) {
  const { autoSuppress = false, bounceThreshold = 2.0, complaintThreshold = 0.1, days = 30 } = options;
  const totalSent = campaignStats.reduce((s, c) => s + (c.sent ?? 0), 0);
  const metrics = {
    total_sent: totalSent,
    delivery_rate: totalSent > 0 ? campaignStats.reduce((s, c) => s + (c.delivered ?? 0), 0) / totalSent : 0,
    open_rate: totalSent > 0 ? campaignStats.reduce((s, c) => s + (c.opened ?? 0), 0) / totalSent : 0,
    bounce_rate: totalSent > 0 ? campaignStats.reduce((s, c) => s + (c.bounced ?? 0), 0) / totalSent : 0,
    complaint_rate: totalSent > 0 ? campaignStats.reduce((s, c) => s + (c.complained ?? 0), 0) / totalSent : 0,
    unsubscribe_rate: totalSent > 0 ? campaignStats.reduce((s, c) => s + (c.unsubscribed ?? 0), 0) / totalSent : 0,
  };

  const healthScore = calcHealthScore(metrics);
  const risk = riskLevel(healthScore);
  const worstCampaigns = [...campaignStats].sort((a, b) => (b.bounce_rate ?? 0) + (b.complaint_rate ?? 0) - ((a.bounce_rate ?? 0) + (a.complaint_rate ?? 0))).slice(0, 5);

  const suppressed = { hard_bounces: 0, soft_bounces_3x: 0, complaints: 0, cold_90d: 0 };
  if (autoSuppress) {
    suppressed.hard_bounces = campaignStats.reduce((s, c) => s + (c.hard_bounces ?? 0), 0);
    suppressed.complaints = campaignStats.reduce((s, c) => s + (c.complaints ?? 0), 0);
    if (suppressed.hard_bounces + suppressed.complaints > 0) {
      await supabase.from(SUPPRESS_TABLE).insert({ location_id: locationId, ...suppressed, suppressed_at: new Date().toISOString() });
    }
  }

  const report = { location_id: locationId, health_score: healthScore, risk_level: risk, metrics, suppressed_contacts: suppressed, campaigns_analyzed: campaignStats.length, worst_campaigns: worstCampaigns.map(c => ({ campaign_id: c.id, name: c.name, bounce_rate: c.bounce_rate ?? 0, complaint_rate: c.complaint_rate ?? 0 })), recommendations: buildRecommendations(metrics, risk), audited_at: new Date().toISOString() };
  await supabase.from(AUDIT_TABLE).insert(report);
  return report;
}

export async function getAuditHistory(locationId, limit = 10) {
  const { data } = await supabase.from(AUDIT_TABLE).select('health_score, risk_level, audited_at').eq('location_id', locationId).order('audited_at', { ascending: false }).limit(limit);
  return { location_id: locationId, history: data ?? [] };
}
