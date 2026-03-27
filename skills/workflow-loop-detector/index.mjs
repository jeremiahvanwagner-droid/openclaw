/**
 * Workflow Loop Detector — Core Logic
 * OpenClaw GHL Automation Safety Skill
 *
 * Analyzes GHL workflow JSON to detect infinite loops, circular tag triggers,
 * webhook echo patterns, and unbounded wait sequences before deployment.
 *
 * Algorithm:
 *   1. Parse workflow into a directed graph (nodes = actions, edges = transitions)
 *   2. Walk the graph with DFS tracking visited nodes
 *   3. Detect tag-add → tag-trigger cycles across workflow boundaries
 *   4. Detect webhook echo (send webhook → same workflow re-triggers)
 *   5. Sum wait times along all paths
 *   6. Score: safe / warnings / blocked
 */

const DEFAULT_MAX_DEPTH       = 20;
const DEFAULT_MAX_WAIT_HOURS  = 720; // 30 days

// ── Graph builder ──────────────────────────────────────────────────

/**
 * Build an adjacency list from the workflow's action list.
 * Supports linear sequences and if/else branching.
 * @private
 */
function buildGraph(actions) {
  const nodes = new Map();
  const edges = new Map();

  // Validate and assign stable IDs — if duplicate ids exist, append index suffix
  const seenIds = new Set();
  const resolvedIds = actions.map((action, i) => {
    let id = action.id ?? String(i);
    if (seenIds.has(id)) {
      id = `${id}_${i}`;
    }
    seenIds.add(id);
    return id;
  });

  for (let i = 0; i < actions.length; i++) {
    const id = resolvedIds[i];
    nodes.set(id, actions[i]);
    edges.set(id, []);
  }

  // Wire sequential edges (action[i] → action[i+1])
  for (let i = 0; i < actions.length - 1; i++) {
    const from = resolvedIds[i];
    const to   = resolvedIds[i + 1];
    edges.get(from).push(to);
  }

  // Wire branch edges for if/else nodes
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const id = resolvedIds[i];
    if (action.type === 'if' || action.type === 'branch') {
      const trueNext  = action.trueBranchId  ?? action.true_branch_id;
      const falseNext = action.falseBranchId ?? action.false_branch_id;
      if (trueNext  && edges.has(id) && !edges.get(id).includes(trueNext))  edges.get(id).push(trueNext);
      if (falseNext && edges.has(id) && !edges.get(id).includes(falseNext)) edges.get(id).push(falseNext);
    }
  }

  return { nodes, edges, resolvedIds };
}

// ── DFS cycle detection ────────────────────────────────────────────

/**
 * DFS walk that detects back-edges (cycles) and accumulates depth + wait time.
 * @private
 */
function dfsWalk(startId, edges, nodes, opts) {
  const { maxDepth, maxWaitHours, allTagTriggers, webhookOrigin } = opts;
  const issues = [];
  const statistics = {
    total_nodes: nodes.size,
    max_depth: 0,
    total_wait_hours: 0,
    cycle_count: 0,
    tag_additions: [],
    webhook_calls: 0,
  };

  // visited = node ids on the current DFS path (for cycle detection)
  const pathSet = new Set();
  // globalVisited ensures we don't re-report from the same node twice
  const globalVisited = new Set();

  function dfs(nodeId, depth, accumulatedWaitHours) {
    if (!nodes.has(nodeId)) return;
    if (globalVisited.has(nodeId)) return;

    statistics.max_depth = Math.max(statistics.max_depth, depth);

    const action = nodes.get(nodeId);
    const waitHrs = extractWaitHours(action);
    const totalWait = accumulatedWaitHours + waitHrs;

    if (statistics.total_wait_hours < totalWait) {
      statistics.total_wait_hours = totalWait;
    }

    // Back-edge → cycle
    if (pathSet.has(nodeId)) {
      statistics.cycle_count++;
      issues.push({
        severity: 'critical',
        type: 'self_reference',
        description: `Cycle detected — node "${nodeId}" revisited on the current path`,
        path: [...pathSet, nodeId],
        recommendation: 'Add an explicit exit condition or break the cycle with a tag/condition gate.',
      });
      return;
    }

    // Depth warning
    if (depth > maxDepth) {
      issues.push({
        severity: 'warning',
        type: 'deep_nesting',
        description: `Nesting depth ${depth} exceeds limit ${maxDepth}`,
        path: [nodeId],
        recommendation: `Flatten workflow — split into sub-workflows if needed.`,
      });
    }

    // Total wait warning
    if (totalWait > maxWaitHours) {
      issues.push({
        severity: 'warning',
        type: 'infinite_wait',
        description: `Accumulated wait time ${totalWait.toFixed(1)}h exceeds ${maxWaitHours}h limit`,
        path: [nodeId],
        recommendation: 'Reduce wait durations or add an exit condition along this path.',
      });
    }

    // Tag addition detection
    const addedTags = extractAddedTags(action);
    for (const tag of addedTags) {
      if (!statistics.tag_additions.includes(tag)) statistics.tag_additions.push(tag);
      // Check cross-workflow tag trigger loop
      if (allTagTriggers.has(tag)) {
        const triggeredWorkflow = allTagTriggers.get(tag);
        issues.push({
          severity: 'critical',
          type: 'tag_loop',
          description: `Adding tag "${tag}" triggers workflow "${triggeredWorkflow}" — potential tag loop`,
          path: [nodeId],
          recommendation: `Remove the tag addition or guard it with a condition to prevent infinite re-triggering.`,
        });
      }
    }

    // Webhook echo detection
    const webhookUrl = extractWebhookUrl(action);
    if (webhookUrl) {
      statistics.webhook_calls++;
      if (webhookOrigin && webhookUrl.includes(webhookOrigin)) {
        issues.push({
          severity: 'critical',
          type: 'webhook_echo',
          description: `Webhook call to "${webhookUrl}" echoes back to the originating location`,
          path: [nodeId],
          recommendation: 'Use a different endpoint or add a deduplication token to prevent echo loops.',
        });
      }
    }

    // Continue DFS
    pathSet.add(nodeId);
    globalVisited.add(nodeId);
    const children = edges.get(nodeId) ?? [];
    for (const childId of children) {
      dfs(childId, depth + 1, totalWait);
    }
    pathSet.delete(nodeId);
  }

  dfs(startId, 0, 0);

  return { issues, statistics };
}

// ── Action field extractors ────────────────────────────────────────

/** @private */
function extractWaitHours(action) {
  if (!action) return 0;
  if (action.type !== 'wait' && action.type !== 'delay') return 0;
  const value  = action.waitValue   ?? action.wait_value   ?? action.duration ?? 0;
  const unit   = (action.waitUnit   ?? action.wait_unit    ?? 'hours').toLowerCase();
  const map = { minutes: 1 / 60, hours: 1, days: 24, weeks: 168 };
  return value * (map[unit] ?? 1);
}

/** @private */
function extractAddedTags(action) {
  if (!action) return [];
  if (action.type === 'add_tag' || action.type === 'addTag') {
    const tag = action.tag ?? action.tagName ?? action.tag_name;
    return tag ? [tag] : [];
  }
  if (action.type === 'update_contact' || action.type === 'updateContact') {
    const tags = action.tags ?? action.addTags ?? [];
    return Array.isArray(tags) ? tags : [];
  }
  return [];
}

/** @private */
function extractWebhookUrl(action) {
  if (!action) return null;
  if (action.type === 'webhook' || action.type === 'send_webhook' || action.type === 'sendWebhook') {
    return action.url ?? action.webhookUrl ?? action.webhook_url ?? null;
  }
  return null;
}

// ── High-frequency trigger detection ─────────────────────────────

/**
 * Detect triggers that could fire at >1/minute frequency.
 * @private
 */
function checkHighFrequencyTrigger(trigger) {
  if (!trigger) return null;
  const intervalMin = trigger.intervalMinutes ?? trigger.interval_minutes ?? null;
  if (intervalMin !== null && intervalMin < 1) {
    return {
      severity: 'warning',
      type: 'high_frequency',
      description: `Trigger fires every ${intervalMin} minute(s) — potentially too frequent`,
      path: ['trigger'],
      recommendation: 'Increase the trigger interval or add throttle/dedupe logic.',
    };
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Analyze a GHL workflow JSON for loop and safety issues.
 *
 * @param {object} workflow_json  GHL workflow definition
 * @param {{ max_depth?: number, max_wait_total?: number, strict_mode?: boolean }} [opts]
 * @returns {{
 *   workflow_id: string,
 *   workflow_name: string,
 *   verdict: 'safe'|'warnings'|'blocked',
 *   issues: Array,
 *   statistics: object,
 *   analyzed_at: string
 * }}
 */
export function analyzeWorkflow(workflow_json, opts = {}) {
  const maxDepth      = opts.max_depth     ?? DEFAULT_MAX_DEPTH;
  const maxWaitHours  = opts.max_wait_total ?? DEFAULT_MAX_WAIT_HOURS;
  const strictMode    = opts.strict_mode   ?? false;

  const workflowId   = workflow_json.id   ?? workflow_json.workflow_id ?? 'unknown';
  const workflowName = workflow_json.name ?? workflow_json.workflow_name ?? 'Unnamed Workflow';
  const actions      = Array.isArray(workflow_json.actions) ? workflow_json.actions : [];
  const trigger      = workflow_json.trigger ?? workflow_json.triggers?.[0] ?? null;

  // Build tag-trigger index from the provided multi-workflow registry (if any)
  // Single-workflow analysis uses an empty registry
  const allTagTriggers = new Map();

  // Build graph
  const { nodes, edges } = buildGraph(actions);
  const allIssues = [];
  let combinedStats = {
    total_nodes: nodes.size,
    max_depth: 0,
    total_wait_hours: 0,
    cycle_count: 0,
    tag_additions: [],
    webhook_calls: 0,
  };

  // Determine entry nodes (nodes with no incoming edges)
  const hasIncoming = new Set();
  for (const children of edges.values()) {
    for (const c of children) hasIncoming.add(c);
  }
  const entryNodes = [...nodes.keys()].filter(id => !hasIncoming.has(id));
  const startNodes = entryNodes.length > 0 ? entryNodes : (nodes.size > 0 ? [nodes.keys().next().value] : []);

  const webhookOrigin = process.env.OPENCLAW_WEBHOOK_ORIGIN ?? null;

  for (const startId of startNodes) {
    const { issues, statistics } = dfsWalk(startId, edges, nodes, {
      maxDepth,
      maxWaitHours,
      allTagTriggers,
      webhookOrigin,
    });
    allIssues.push(...issues);
    combinedStats.max_depth        = Math.max(combinedStats.max_depth, statistics.max_depth);
    combinedStats.total_wait_hours = Math.max(combinedStats.total_wait_hours, statistics.total_wait_hours);
    combinedStats.cycle_count     += statistics.cycle_count;
    combinedStats.webhook_calls   += statistics.webhook_calls;
    for (const t of statistics.tag_additions) {
      if (!combinedStats.tag_additions.includes(t)) combinedStats.tag_additions.push(t);
    }
  }

  // High-frequency trigger check
  const hfIssue = checkHighFrequencyTrigger(trigger);
  if (hfIssue) allIssues.push(hfIssue);

  // Deduplicate issues by type + description
  const seen = new Set();
  const uniqueIssues = allIssues.filter(iss => {
    const key = `${iss.type}::${iss.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Determine verdict
  const hasCritical = uniqueIssues.some(i => i.severity === 'critical');
  const hasWarning  = uniqueIssues.some(i => i.severity === 'warning');
  let verdict = 'safe';
  if (hasCritical)                        verdict = 'blocked';
  else if (hasWarning && strictMode)      verdict = 'blocked';
  else if (hasWarning)                    verdict = 'warnings';

  return {
    workflow_id:   workflowId,
    workflow_name: workflowName,
    verdict,
    issues:        uniqueIssues,
    statistics:    combinedStats,
    analyzed_at:   new Date().toISOString(),
  };
}

/**
 * Analyze multiple workflows together, enabling cross-workflow tag-loop detection.
 *
 * @param {object[]} workflows   Array of GHL workflow definitions
 * @param {{ max_depth?: number, max_wait_total?: number, strict_mode?: boolean }} [opts]
 * @returns {{ results: Array, summary: { total: number, blocked: number, warnings: number, safe: number } }}
 */
export function analyzeWorkflowSet(workflows, opts = {}) {
  // Build cross-workflow tag-trigger index
  const allTagTriggers = new Map(); // tag → workflow_name
  for (const wf of workflows) {
    const trigger = wf.trigger ?? wf.triggers?.[0] ?? null;
    if (trigger?.type === 'tag' || trigger?.type === 'contact_tag') {
      const tag = trigger.tag ?? trigger.tagFilter ?? trigger.tag_filter;
      if (tag) allTagTriggers.set(tag, wf.name ?? wf.id ?? 'unknown');
    }
  }

  // Inject cross-workflow tag index into each analysis
  const results = [];
  for (const wf of workflows) {
    const maxDepth      = opts.max_depth     ?? DEFAULT_MAX_DEPTH;
    const maxWaitHours  = opts.max_wait_total ?? DEFAULT_MAX_WAIT_HOURS;
    const strictMode    = opts.strict_mode   ?? false;

    const workflowId   = wf.id   ?? wf.workflow_id ?? 'unknown';
    const workflowName = wf.name ?? wf.workflow_name ?? 'Unnamed Workflow';
    const actions      = Array.isArray(wf.actions) ? wf.actions : [];
    const trigger      = wf.trigger ?? wf.triggers?.[0] ?? null;

    const { nodes, edges } = buildGraph(actions);
    const allIssues = [];
    let combinedStats = {
      total_nodes: nodes.size,
      max_depth: 0,
      total_wait_hours: 0,
      cycle_count: 0,
      tag_additions: [],
      webhook_calls: 0,
    };

    const hasIncoming = new Set();
    for (const children of edges.values()) for (const c of children) hasIncoming.add(c);
    const entryNodes = [...nodes.keys()].filter(id => !hasIncoming.has(id));
    const startNodes = entryNodes.length > 0 ? entryNodes : (nodes.size > 0 ? [nodes.keys().next().value] : []);
    const webhookOrigin = process.env.OPENCLAW_WEBHOOK_ORIGIN ?? null;

    for (const startId of startNodes) {
      const { issues, statistics } = dfsWalk(startId, edges, nodes, {
        maxDepth,
        maxWaitHours,
        allTagTriggers,
        webhookOrigin,
      });
      allIssues.push(...issues);
      combinedStats.max_depth        = Math.max(combinedStats.max_depth, statistics.max_depth);
      combinedStats.total_wait_hours = Math.max(combinedStats.total_wait_hours, statistics.total_wait_hours);
      combinedStats.cycle_count     += statistics.cycle_count;
      combinedStats.webhook_calls   += statistics.webhook_calls;
      for (const t of statistics.tag_additions) {
        if (!combinedStats.tag_additions.includes(t)) combinedStats.tag_additions.push(t);
      }
    }

    const hfIssue = checkHighFrequencyTrigger(trigger);
    if (hfIssue) allIssues.push(hfIssue);

    const seen = new Set();
    const uniqueIssues = allIssues.filter(iss => {
      const key = `${iss.type}::${iss.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const hasCritical = uniqueIssues.some(i => i.severity === 'critical');
    const hasWarning  = uniqueIssues.some(i => i.severity === 'warning');
    let verdict = 'safe';
    if (hasCritical)                   verdict = 'blocked';
    else if (hasWarning && strictMode) verdict = 'blocked';
    else if (hasWarning)               verdict = 'warnings';

    results.push({
      workflow_id:   workflowId,
      workflow_name: workflowName,
      verdict,
      issues:        uniqueIssues,
      statistics:    combinedStats,
      analyzed_at:   new Date().toISOString(),
    });
  }

  const summary = {
    total:    results.length,
    blocked:  results.filter(r => r.verdict === 'blocked').length,
    warnings: results.filter(r => r.verdict === 'warnings').length,
    safe:     results.filter(r => r.verdict === 'safe').length,
  };

  return { results, summary };
}
