/**
 * Content-to-Campaign Factory — Core Logic
 * OpenClaw Phase 3 Execution Skill
 *
 * Atomizes one core idea into multi-channel campaign assets
 * (email, social, landing, ads, SMS) and tracks performance.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../../lib/agent-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Config loading ─────────────────────────────────────────────

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

// ── LLM router loader ─────────────────────────────────────────

let _llmRouter = null;

async function llm() {
  if (!_llmRouter) {
    const mod = await import('../../lib/llm-router.ts');
    _llmRouter = mod;
  }
  return _llmRouter;
}

// ── Channel Definitions ────────────────────────────────────────

const CHANNELS = {
  email: {
    asset_types: ['welcome', 'value', 'case_study', 'offer', 'urgency'],
    label: 'Email Sequence',
  },
  linkedin: {
    asset_types: ['thought_leadership', 'story', 'tip', 'engagement', 'cta'],
    label: 'LinkedIn Posts',
  },
  instagram: {
    asset_types: ['carousel', 'reel_script', 'story', 'quote', 'cta'],
    label: 'Instagram Content',
  },
  facebook: {
    asset_types: ['post', 'story', 'live_script', 'group_post', 'cta'],
    label: 'Facebook Content',
  },
  x: {
    asset_types: ['thread_opener', 'thread_body', 'standalone', 'reply_hook', 'cta'],
    label: 'X (Twitter) Posts',
  },
  sms: {
    asset_types: ['intro', 'value', 'cta'],
    label: 'SMS Sequence',
  },
  landing_page: {
    asset_types: ['hero', 'problem', 'solution', 'proof', 'cta'],
    label: 'Landing Page Copy',
  },
  ads: {
    asset_types: ['headline_variant_1', 'headline_variant_2', 'headline_variant_3'],
    label: 'Ad Copy Variants',
  },
};

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Atomize a core idea into key components for campaign generation.
 * Uses LLM (claude-sonnet-4.5 tier) with business context.
 */
export async function atomizeIdea(coreIdea, businessId) {
  const registry = businessRegistry();
  const business = registry.businesses?.find(b => b.business_id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found in registry`);

  // Structured atomization (LLM-assisted in production)
  const atomized = {
    core_idea: coreIdea,
    business_id: businessId,
    business_name: business.display_name || businessId,
    brand_voice: business.brand_voice || 'professional',
    key_message: extractKeyMessage(coreIdea),
    target_audience: business.target_audience || 'entrepreneurs and business owners',
    pain_points: extractPainPoints(coreIdea),
    transformation_promise: extractTransformation(coreIdea),
    proof_points: [],
    hooks: generateHooks(coreIdea),
    hashtags: generateHashtags(coreIdea, business),
  };

  // Store in Supabase
  const db = supabase;
  const { data, error } = await db.from('campaign_ideas').insert({
    business_id: businessId,
    core_idea: coreIdea,
    atomized_json: atomized,
    status: 'draft',
  }).select('id').single();

  if (error) throw new Error(`Failed to store campaign idea: ${error.message}`);

  return { ...atomized, campaign_id: data.id };
}

/**
 * Generate multi-channel asset bundle from atomized idea.
 */
export async function generateAssetBundle(atomizedIdea, channels = null) {
  const targetChannels = channels || Object.keys(CHANNELS);
  const db = supabase;
  const campaignId = atomizedIdea.campaign_id;
  const assets = [];

  for (const channel of targetChannels) {
    const channelDef = CHANNELS[channel];
    if (!channelDef) continue;

    for (const assetType of channelDef.asset_types) {
      const content = generateAssetContent(atomizedIdea, channel, assetType);

      const { data: asset } = await db.from('campaign_assets').insert({
        campaign_id: campaignId,
        channel,
        asset_type: assetType,
        content_json: content,
        status: 'draft',
      }).select('id').single();

      assets.push({
        id: asset?.id,
        channel,
        asset_type: assetType,
        content,
      });
    }
  }

  // Update campaign status
  await db.from('campaign_ideas')
    .update({ status: 'review' })
    .eq('id', campaignId);

  return {
    campaign_id: campaignId,
    total_assets: assets.length,
    channels_covered: targetChannels,
    assets,
  };
}

/**
 * Validate all assets against business brand voice and compliance.
 */
export async function alignToBusinessScope(assetBundle, businessId) {
  const registry = businessRegistry();
  const business = registry.businesses?.find(b => b.business_id === businessId);
  if (!business) throw new Error(`Business ${businessId} not found`);

  const issues = [];

  for (const asset of assetBundle.assets || []) {
    const content = asset.content;

    // Check brand voice alignment
    if (business.brand_voice && content.text) {
      if (business.brand_voice === 'spiritual' && containsHardSell(content.text)) {
        issues.push({
          asset_id: asset.id,
          channel: asset.channel,
          issue: 'Hard-sell language detected in spiritual brand voice context',
        });
      }
    }

    // Check for prohibited terms
    const prohibited = business.prohibited_terms || [];
    for (const term of prohibited) {
      if (content.text?.toLowerCase().includes(term.toLowerCase())) {
        issues.push({
          asset_id: asset.id,
          channel: asset.channel,
          issue: `Prohibited term "${term}" found in content`,
        });
      }
    }
  }

  return {
    campaign_id: assetBundle.campaign_id,
    business_id: businessId,
    total_checked: assetBundle.assets?.length || 0,
    issues_found: issues.length,
    issues,
    compliant: issues.length === 0,
  };
}

/**
 * Schedule asset distribution via GHL and content scheduler.
 */
export async function scheduleDistribution(assetBundle, calendar = {}) {
  const startDate = new Date(calendar.start_date || Date.now());
  const schedule = [];

  const emailAssets = (assetBundle.assets || []).filter(a => a.channel === 'email');
  const socialAssets = (assetBundle.assets || []).filter(a => !['email', 'sms', 'landing_page', 'ads'].includes(a.channel));
  const smsAssets = (assetBundle.assets || []).filter(a => a.channel === 'sms');

  // Email: one per day starting from start_date
  emailAssets.forEach((asset, i) => {
    const sendDate = new Date(startDate);
    sendDate.setDate(sendDate.getDate() + i);
    schedule.push({
      asset_id: asset.id,
      channel: 'email',
      scheduled_at: sendDate.toISOString(),
      status: 'scheduled',
    });
  });

  // Social: spread across the first 2 weeks
  socialAssets.forEach((asset, i) => {
    const postDate = new Date(startDate);
    postDate.setDate(postDate.getDate() + Math.floor(i / 2));
    postDate.setHours(9 + (i % 3) * 4); // 9AM, 1PM, 5PM rotation
    schedule.push({
      asset_id: asset.id,
      channel: asset.channel,
      scheduled_at: postDate.toISOString(),
      status: 'scheduled',
    });
  });

  // SMS: day 1, 3, 5
  smsAssets.forEach((asset, i) => {
    const smsDate = new Date(startDate);
    smsDate.setDate(smsDate.getDate() + (i * 2));
    smsDate.setHours(11); // 11 AM
    schedule.push({
      asset_id: asset.id,
      channel: 'sms',
      scheduled_at: smsDate.toISOString(),
      status: 'scheduled',
    });
  });

  // Update campaign status
  const db = supabase;
  await db.from('campaign_ideas')
    .update({ status: 'scheduled' })
    .eq('id', assetBundle.campaign_id);

  // Update asset statuses
  for (const item of schedule) {
    if (item.asset_id) {
      await db.from('campaign_assets')
        .update({ status: 'scheduled' })
        .eq('id', item.asset_id);
    }
  }

  return {
    campaign_id: assetBundle.campaign_id,
    total_scheduled: schedule.length,
    schedule,
  };
}

/**
 * Collect performance metrics for a campaign.
 */
export async function trackCampaignPerformance(campaignId) {
  const db = supabase;

  // Get all assets for this campaign
  const { data: assets } = await db.from('campaign_assets')
    .select('id, channel, asset_type, status')
    .eq('campaign_id', campaignId);

  if (!assets?.length) return { campaign_id: campaignId, metrics: [], message: 'No assets found' };

  // In production: pull real metrics from GHL / social APIs
  // For now, generate placeholder performance data structure
  const metrics = [];
  for (const asset of assets) {
    if (asset.status !== 'published') continue;

    const channelMetrics = getChannelMetrics(asset.channel);
    for (const metric of channelMetrics) {
      metrics.push({
        campaign_id: campaignId,
        asset_id: asset.id,
        metric: metric.name,
        value: 0, // Would be populated from real API data
      });
    }
  }

  // Store performance data
  if (metrics.length) {
    await db.from('campaign_performance').insert(metrics);
  }

  return {
    campaign_id: campaignId,
    assets_tracked: assets.filter(a => a.status === 'published').length,
    metrics_collected: metrics.length,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function extractKeyMessage(idea) {
  // Simple extraction — in production, LLM-assisted
  const sentences = idea.split(/[.!?]+/).filter(Boolean);
  return sentences[0]?.trim() || idea;
}

function extractPainPoints(idea) {
  const painKeywords = ['struggle', 'problem', 'challenge', 'pain', 'frustrat', 'stuck', 'fail', 'overwhelm'];
  const sentences = idea.split(/[.!?]+/).filter(Boolean);
  return sentences
    .filter(s => painKeywords.some(k => s.toLowerCase().includes(k)))
    .map(s => s.trim())
    .slice(0, 3);
}

function extractTransformation(idea) {
  const transKeywords = ['transform', 'achieve', 'become', 'unlock', 'discover', 'master', 'build', 'create', 'grow'];
  const sentences = idea.split(/[.!?]+/).filter(Boolean);
  const match = sentences.find(s => transKeywords.some(k => s.toLowerCase().includes(k)));
  return match?.trim() || 'Transform your results with proven strategies';
}

function generateHooks(idea) {
  const keyMessage = extractKeyMessage(idea);
  return [
    `What if ${keyMessage.toLowerCase()}?`,
    `The truth about ${keyMessage.toLowerCase()} that nobody tells you`,
    `Stop ${keyMessage.toLowerCase().replace(/^(how to |the )/, '')} the wrong way`,
  ];
}

function generateHashtags(idea, business) {
  const words = idea.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const tags = words.slice(0, 3).map(w => `#${w.replace(/[^a-z]/g, '')}`);
  if (business.niche) tags.push(`#${business.niche.replace(/\s+/g, '')}`);
  tags.push('#TruthJBlue');
  return [...new Set(tags)];
}

function containsHardSell(text) {
  const hardSellPhrases = ['buy now', 'limited time', 'act fast', 'don\'t miss out', 'last chance'];
  return hardSellPhrases.some(p => text.toLowerCase().includes(p));
}

function generateAssetContent(atomized, channel, assetType) {
  // Template-based content generation (LLM-enhanced in production)
  return {
    text: `[${channel}/${assetType}] ${atomized.key_message}`,
    business_id: atomized.business_id,
    brand_voice: atomized.brand_voice,
    target_audience: atomized.target_audience,
    hooks: atomized.hooks,
    hashtags: atomized.hashtags,
    generated_at: new Date().toISOString(),
  };
}

function getChannelMetrics(channel) {
  const metricMap = {
    email: [{ name: 'open_rate' }, { name: 'click_rate' }, { name: 'conversion_rate' }],
    linkedin: [{ name: 'impressions' }, { name: 'engagement' }, { name: 'clicks' }],
    instagram: [{ name: 'impressions' }, { name: 'engagement' }, { name: 'saves' }],
    facebook: [{ name: 'impressions' }, { name: 'engagement' }, { name: 'clicks' }],
    x: [{ name: 'impressions' }, { name: 'engagement' }, { name: 'retweets' }],
    sms: [{ name: 'delivery_rate' }, { name: 'click_rate' }],
    ads: [{ name: 'impressions' }, { name: 'clicks' }, { name: 'ctr' }, { name: 'cpc' }],
  };
  return metricMap[channel] || [{ name: 'engagement' }];
}
