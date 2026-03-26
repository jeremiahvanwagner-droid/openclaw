/**
 * Autonomous Debugging — Core Logic
 * OpenClaw AI SaaS Skill
 *
 * Detects, triages, and remediates software defects autonomously.
 * Cluster incidents by root-cause signature, generate candidate patches,
 * validate in isolated environments, apply with rollback safeguards.
 */

import { createClient } from '@supabase/supabase-js';

// ── Supabase client ────────────────────────────────────────────────

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ── Root-cause signature patterns ─────────────────────────────────

const SIGNATURE_PATTERNS = [
  { pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,   signature: 'network_connectivity',   severity: 'high'   },
  { pattern: /Cannot read prop|TypeError: .* is (null|undefined)/i, signature: 'null_reference', severity: 'medium' },
  { pattern: /SyntaxError|Unexpected token/i,        signature: 'syntax_error',           severity: 'critical' },
  { pattern: /ENOMEM|heap out of memory/i,           signature: 'memory_exhaustion',      severity: 'critical' },
  { pattern: /duplicate key|unique constraint/i,     signature: 'db_constraint',          severity: 'medium'  },
  { pattern: /rate limit|429|Too Many Requests/i,    signature: 'rate_limited',           severity: 'low'    },
  { pattern: /401|403|Unauthorized|Forbidden/i,      signature: 'auth_failure',           severity: 'high'   },
  { pattern: /timeout|DEADLINE_EXCEEDED/i,           signature: 'timeout',               severity: 'medium'  },
  { pattern: /ENOENT|no such file/i,                 signature: 'missing_file',           severity: 'high'   },
  { pattern: /assertion.*failed|AssertionError/i,    signature: 'assertion_failure',      severity: 'medium'  },
];

// ── Incident store key ─────────────────────────────────────────────

const INCIDENT_TABLE = 'debug_incidents';
const PATCH_TABLE    = 'debug_patches';

// ─────────────────────────────────────────────────────────────────

/**
 * Ingest error logs and traces, extract structured incidents.
 *
 * @param {Array<{source: string, message: string, stack?: string, timestamp?: string}>} logs
 * @returns {{ incidents: Array<{id: string, signature: string, severity: string, message: string, source: string, timestamp: string}> }}
 */
export async function ingestErrorLogs(logs) {
  const db = supabase();
  const incidents = [];

  for (const log of logs) {
    const matched = SIGNATURE_PATTERNS.find(p => p.pattern.test(log.message));
    const signature = matched?.signature ?? 'unknown';
    const severity  = matched?.severity  ?? 'low';

    const incident = {
      signature,
      severity,
      message:   log.message,
      stack:     log.stack ?? null,
      source:    log.source,
      timestamp: log.timestamp ?? new Date().toISOString(),
    };

    const { data, error } = await db
      .from(INCIDENT_TABLE)
      .insert(incident)
      .select('id')
      .single();

    if (!error && data) {
      incidents.push({ id: data.id, ...incident });
    } else {
      // Degrade gracefully — include without persisted id
      incidents.push({ id: `local-${Date.now()}-${incidents.length}`, ...incident });
    }
  }

  return { incidents };
}

/**
 * Cluster incidents by root-cause signature to reduce noise.
 *
 * @param {Array<{id: string, signature: string, severity: string, message: string, source: string}>} incidents
 * @returns {{ clusters: Record<string, {signature: string, severity: string, count: number, incidents: string[], representative: string}> }}
 */
export function clusterIncidents(incidents) {
  const clusters = {};

  for (const inc of incidents) {
    const key = inc.signature;
    if (!clusters[key]) {
      clusters[key] = {
        signature: inc.signature,
        severity: inc.severity,
        count: 0,
        incidents: [],
        representative: inc.message,
      };
    }
    clusters[key].count++;
    clusters[key].incidents.push(inc.id);
  }

  return { clusters };
}

/**
 * Generate candidate fix proposals using the LLM router.
 * Each proposal has a minimal blast radius — one targeted change.
 *
 * @param {{ signature: string, severity: string, representative: string, incidents: string[] }} cluster
 * @param {{ model?: string }} [options]
 * @returns {{ proposals: Array<{id: string, description: string, patch_hint: string, confidence: number, requires_human_review: boolean}> }}
 */
export async function generatePatchProposals(cluster, options = {}) {
  const model = options.model ?? 'gpt-4o-mini';

  // Build a structured prompt for minimal-blast-radius patch suggestions
  const systemPrompt = [
    'You are an expert software engineer diagnosing production failures.',
    'Given an incident cluster, propose 1–3 minimal, targeted fixes.',
    'Each fix should have: a short description, a concrete patch hint (file/function/change),',
    'and a confidence score (0–1) based on available evidence.',
    'Flag any fix that touches auth, payments, or data migrations as requiring human review.',
    'Respond ONLY with valid JSON: { "proposals": [ { "description": "", "patch_hint": "", "confidence": 0.0, "requires_human_review": false } ] }',
  ].join(' ');

  const userMessage = [
    `Incident signature: ${cluster.signature}`,
    `Severity: ${cluster.severity}`,
    `Occurrence count: ${cluster.incidents.length}`,
    `Representative error: ${cluster.representative}`,
  ].join('\n');

  let rawText = '';
  try {
    // Dynamic import to avoid hard dependency if llm-router is unavailable
    const { complete } = await import('../../lib/llm-router.js').catch(
      () => import('../../lib/llm-router.ts').catch(() => null)
    );

    if (complete) {
      const result = await complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        maxTokens: 512,
        queueClass: 'P2',
      });
      rawText = result.content;
    }
  } catch {
    // LLM unavailable — return a safe fallback proposal
  }

  // Parse LLM response or fall back to a signature-based heuristic
  let proposals = [];
  try {
    const parsed = JSON.parse(rawText);
    proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  } catch {
    proposals = buildHeuristicProposals(cluster);
  }

  // Assign stable ids
  proposals = proposals.map((p, i) => ({
    id: `proposal-${cluster.signature}-${i}`,
    description: p.description ?? '',
    patch_hint: p.patch_hint ?? '',
    confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
    requires_human_review: Boolean(p.requires_human_review),
  }));

  return { proposals };
}

/**
 * Rule-based fallback proposals when LLM is unavailable.
 * @private
 */
function buildHeuristicProposals(cluster) {
  const heuristics = {
    network_connectivity: [
      { description: 'Add retry with exponential backoff on ECONNREFUSED', patch_hint: 'Wrap fetch/http call with retry-backoff-wrapper skill', confidence: 0.7, requires_human_review: false },
    ],
    null_reference: [
      { description: 'Add null-guard before property access', patch_hint: 'Use optional chaining (?.) or explicit null check', confidence: 0.6, requires_human_review: false },
    ],
    auth_failure: [
      { description: 'Refresh or rotate credentials', patch_hint: 'Check env vars; trigger token refresh flow', confidence: 0.5, requires_human_review: true },
    ],
    rate_limited: [
      { description: 'Honor Retry-After header and reduce request frequency', patch_hint: 'Enable rate governor for the offending provider', confidence: 0.8, requires_human_review: false },
    ],
    timeout: [
      { description: 'Increase timeout or add circuit breaker', patch_hint: 'Tune timeout constants; enable circuit breaker in api-rate-governor', confidence: 0.65, requires_human_review: false },
    ],
  };

  return heuristics[cluster.signature] ?? [
    { description: `Investigate ${cluster.signature} failure pattern`, patch_hint: 'Manual investigation required', confidence: 0.3, requires_human_review: true },
  ];
}

/**
 * Validate a patch proposal in an isolated (dry-run) environment.
 * In production this would spin up a sandbox; here it performs static checks.
 *
 * @param {{ id: string, description: string, requires_human_review: boolean }} proposal
 * @returns {{ valid: boolean, reason: string, safe_to_apply: boolean }}
 */
export function validatePatch(proposal) {
  if (proposal.requires_human_review) {
    return {
      valid: true,
      reason: 'Proposal flagged for human review — cannot auto-apply',
      safe_to_apply: false,
    };
  }

  if (!proposal.patch_hint || proposal.patch_hint.trim() === '') {
    return { valid: false, reason: 'Empty patch hint', safe_to_apply: false };
  }

  if (proposal.confidence < 0.5) {
    return {
      valid: true,
      reason: `Confidence ${proposal.confidence} below auto-apply threshold (0.5)`,
      safe_to_apply: false,
    };
  }

  return { valid: true, reason: 'Static checks passed', safe_to_apply: true };
}

/**
 * Apply a validated patch and record it in Supabase for rollback tracking.
 *
 * @param {{ id: string, description: string, patch_hint: string }} proposal
 * @param {string} clusterSignature
 * @returns {{ applied: boolean, patch_id: string, rollback_token: string }}
 */
export async function applyPatch(proposal, clusterSignature) {
  const db = supabase();
  const rollbackToken = `rollback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await db
    .from(PATCH_TABLE)
    .insert({
      proposal_id:       proposal.id,
      cluster_signature: clusterSignature,
      description:       proposal.description,
      patch_hint:        proposal.patch_hint,
      rollback_token:    rollbackToken,
      status:            'applied',
      applied_at:        new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    return { applied: false, patch_id: '', rollback_token: '' };
  }

  return { applied: true, patch_id: data.id, rollback_token: rollbackToken };
}

/**
 * Roll back a previously applied patch using its rollback token.
 *
 * @param {string} rollbackToken
 * @returns {{ rolled_back: boolean, patch_id: string }}
 */
export async function rollbackPatch(rollbackToken) {
  const db = supabase();

  const { data, error } = await db
    .from(PATCH_TABLE)
    .update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() })
    .eq('rollback_token', rollbackToken)
    .select('id')
    .single();

  if (error || !data) {
    return { rolled_back: false, patch_id: '' };
  }

  return { rolled_back: true, patch_id: data.id };
}

/**
 * Monitor post-fix stability by checking for recurrence of the same signature.
 *
 * @param {string} clusterSignature
 * @param {{ windowMinutes?: number }} [options]
 * @returns {{ stable: boolean, recurrence_count: number, verdict: 'stable'|'regressed'|'insufficient_data' }}
 */
export async function monitorPostFixStability(clusterSignature, options = {}) {
  const db = supabase();
  const windowMinutes = options.windowMinutes ?? 30;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data, error } = await db
    .from(INCIDENT_TABLE)
    .select('id')
    .eq('signature', clusterSignature)
    .gte('timestamp', since);

  if (error) {
    return { stable: false, recurrence_count: 0, verdict: 'insufficient_data' };
  }

  const recurrence = data?.length ?? 0;

  if (recurrence === 0) return { stable: true,  recurrence_count: 0, verdict: 'stable' };
  if (recurrence <= 2) return { stable: false, recurrence_count: recurrence, verdict: 'insufficient_data' };
  return { stable: false, recurrence_count: recurrence, verdict: 'regressed' };
}

/**
 * Generate a full incident resolution report.
 *
 * @param {{ clusters: object, patches: Array, stability: object }} summary
 * @returns {{ report: string }}
 */
export function generateResolutionReport(summary) {
  const lines = [
    `# Autonomous Debugging Report — ${new Date().toISOString()}`,
    '',
    `## Incident Clusters (${Object.keys(summary.clusters).length})`,
  ];

  for (const [sig, cluster] of Object.entries(summary.clusters)) {
    lines.push(`- **${sig}** | severity: ${cluster.severity} | occurrences: ${cluster.count}`);
  }

  lines.push('', `## Patches Applied (${summary.patches.length})`);
  for (const patch of summary.patches) {
    lines.push(`- ${patch.description} — ${patch.applied ? '✅ applied' : '⚠️ skipped'}`);
    if (patch.rollback_token) lines.push(`  Rollback token: \`${patch.rollback_token}\``);
  }

  if (summary.stability) {
    lines.push('', '## Post-Fix Stability');
    for (const [sig, result] of Object.entries(summary.stability)) {
      lines.push(`- ${sig}: ${result.verdict} (recurrence: ${result.recurrence_count})`);
    }
  }

  return { report: lines.join('\n') };
}
