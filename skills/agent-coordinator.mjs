#!/usr/bin/env node
/**
 * OpenClaw Agent Coordinator
 * 
 * Central orchestration layer for 72-agent task routing and load balancing
 * 
 * Architecture:
 *   - 8 Divisions: Foundation, Research, Content, Distribution, Marketing, Sales, Support, Analytics
 *   - 72 Specialized Agents
 *   - Task queue with priority
 *   - Load balancing across agents
 *   - Health monitoring
 *   - Automatic failover
 * 
 * Usage: node agent-coordinator.mjs <command> [args...]
 * 
 * Commands:
 *   dispatch <division> <task> [data]  Dispatch task to division
 *   status                             Show agent status
 *   queue                              Show task queue
 *   health                             Health check all agents
 *   assign <agentId> <task>            Assign task to specific agent
 *   metrics                            Show performance metrics
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  buildApprovalPreview,
  classifyApprovalCandidate,
  createHumanApprovalRequest,
  markHumanApprovalExecuting,
  waitForHumanApproval,
} from '../lib/human-approval.mjs';

const execAsync = promisify(exec);

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'task-queue.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents-registry.json');
const METRICS_FILE = path.join(DATA_DIR, 'agent-metrics.json');

// 72-Agent Architecture Definition
const AGENT_ARCHITECTURE = {
  foundation: {
    name: 'Foundation Tier',
    agentCount: 12,
    agents: {
      'ORCHESTRATOR': { role: 'Central coordinator', priority: 1, skills: ['task-delegation', 'priority-management'] },
      'SCHEDULER': { role: 'Cron job management', priority: 2, skills: ['timing-optimization', 'schedule-planning'] },
      'MONITOR': { role: 'System health', priority: 1, skills: ['error-detection', 'alerting', 'health-checks'] },
      'BACKUP': { role: 'Data redundancy', priority: 3, skills: ['disaster-recovery', 'backup-management'] },
      'SECURITY': { role: 'Credential management', priority: 1, skills: ['access-control', 'token-rotation'] },
      'INTEGRATOR': { role: 'API connections', priority: 2, skills: ['webhook-routing', 'api-management'] },
      'BROWSER-PRIMARY': { role: 'Main browser automation', priority: 2, skills: ['puppeteer', 'web-automation'] },
      'BROWSER-SECONDARY': { role: 'Parallel browser ops', priority: 3, skills: ['puppeteer', 'web-automation'] },
      'DRIVE-MANAGER': { role: 'Google Drive ops', priority: 2, skills: ['file-management', 'organization'] },
      'MEDIA-PROCESSOR': { role: 'Media processing', priority: 3, skills: ['video-processing', 'image-editing'] },
      'QUEUE-MANAGER': { role: 'Task queue processing', priority: 1, skills: ['prioritization', 'queue-management'] },
      'REPORTER': { role: 'Cross-division reporting', priority: 3, skills: ['dashboard-generation', 'reporting'] }
    }
  },
  
  research: {
    name: 'Research Division',
    agentCount: 8,
    agents: {
      'MARKET-ANALYST': { role: 'Market research', priority: 2, skills: ['trend-identification', 'opportunity-scoring'] },
      'COMPETITOR-TRACKER': { role: 'Competitive intelligence', priority: 2, skills: ['product-monitoring', 'pricing-analysis'] },
      'AUDIENCE-RESEARCHER': { role: 'Customer insights', priority: 2, skills: ['demographics', 'pain-point-analysis'] },
      'KEYWORD-SPECIALIST': { role: 'SEO research', priority: 2, skills: ['keyword-research', 'search-trends'] },
      'TREND-SPOTTER': { role: 'Emerging trends', priority: 2, skills: ['social-listening', 'viral-detection'] },
      'DATA-COLLECTOR': { role: 'Information gathering', priority: 3, skills: ['web-scraping', 'data-aggregation'] },
      'REPORT-WRITER': { role: 'Research synthesis', priority: 3, skills: ['analysis', 'insight-generation'] },
      'BRIEFING-AGENT': { role: 'Research distribution', priority: 3, skills: ['communication', 'cross-division-delivery'] }
    }
  },
  
  content: {
    name: 'Content Division',
    agentCount: 12,
    agents: {
      'CONTENT-STRATEGIST': { role: 'Editorial planning', priority: 1, skills: ['content-calendar', 'topic-selection'] },
      'WRITER-LONG': { role: 'Long-form content', priority: 2, skills: ['ebook-writing', 'course-creation', 'guides'] },
      'WRITER-SHORT': { role: 'Short-form content', priority: 2, skills: ['social-posts', 'emails', 'captions'] },
      'WRITER-SALES': { role: 'Sales copy', priority: 2, skills: ['landing-pages', 'ad-copy', 'sequences'] },
      'VIDEO-SCRIPTER': { role: 'Video content', priority: 2, skills: ['scripts', 'outlines', 'hooks'] },
      'EDITOR-CHIEF': { role: 'Quality control', priority: 1, skills: ['review', 'feedback', 'approval'] },
      'GRAPHIC-DESIGNER': { role: 'Visual assets', priority: 2, skills: ['images', 'thumbnails', 'graphics'] },
      'VIDEO-PRODUCER': { role: 'Video creation', priority: 2, skills: ['editing', 'assembly', 'effects'] },
      'FORMATTER': { role: 'Content packaging', priority: 3, skills: ['ebook-formatting', 'course-structuring'] },
      'PUBLISHER': { role: 'Multi-platform publishing', priority: 2, skills: ['upload', 'schedule', 'distribute'] },
      'REPURPOSER': { role: 'Content multiplication', priority: 3, skills: ['format-conversion', 'adaptation'] },
      'ARCHIVIST': { role: 'Content organization', priority: 3, skills: ['drive-management', 'version-control'] }
    }
  },
  
  distribution: {
    name: 'Distribution Division',
    agentCount: 8,
    agents: {
      'SCHEDULER-MASTER': { role: 'Timing optimization', priority: 1, skills: ['best-times', 'frequency-management'] },
      'YOUTUBE-MANAGER': { role: 'YouTube operations', priority: 2, skills: ['upload', 'seo', 'community'] },
      'INSTAGRAM-MANAGER': { role: 'IG operations', priority: 2, skills: ['posts', 'stories', 'reels', 'dms'] },
      'FACEBOOK-MANAGER': { role: 'FB operations', priority: 2, skills: ['posts', 'groups', 'ads'] },
      'TIKTOK-MANAGER': { role: 'TikTok operations', priority: 2, skills: ['videos', 'trends', 'sounds'] },
      'EMAIL-DISPATCHER': { role: 'Email delivery', priority: 2, skills: ['campaigns', 'sequences', 'broadcasts'] },
      'SMS-DISPATCHER': { role: 'SMS delivery', priority: 2, skills: ['campaigns', 'alerts', 'follow-ups'] },
      'TELEGRAM-BROADCASTER': { role: 'Telegram operations', priority: 3, skills: ['community', 'alerts'] }
    }
  },
  
  marketing: {
    name: 'Marketing Division',
    agentCount: 10,
    agents: {
      'CAMPAIGN-MANAGER': { role: 'Campaign orchestration', priority: 1, skills: ['multi-channel', 'coordination'] },
      'AD-SPECIALIST': { role: 'Paid advertising', priority: 2, skills: ['fb-ads', 'google-ads', 'management'] },
      'FUNNEL-BUILDER': { role: 'Sales funnel creation', priority: 2, skills: ['ghl-funnels', 'optimization'] },
      'LANDING-PAGE-AGENT': { role: 'Landing page ops', priority: 2, skills: ['ab-testing', 'conversion-optimization'] },
      'LEAD-MAGNET-CREATOR': { role: 'Lead generation', priority: 2, skills: ['free-offers', 'opt-in-incentives'] },
      'LEAD-NURTURE-AGENT': { role: 'Lead warming', priority: 2, skills: ['drip-sequences', 'engagement'] },
      'TRAFFIC-DIRECTOR': { role: 'Traffic routing', priority: 2, skills: ['utm-tracking', 'source-optimization'] },
      'RETARGETING-AGENT': { role: 'Remarketing', priority: 2, skills: ['pixel-audiences', 'retargeting'] },
      'AFFILIATE-MANAGER': { role: 'Partnership management', priority: 3, skills: ['recruitment', 'payouts'] },
      'PROMO-AGENT': { role: 'Promotional campaigns', priority: 2, skills: ['flash-sales', 'launches', 'events'] }
    }
  },
  
  sales: {
    name: 'Sales Division',
    agentCount: 10,
    agents: {
      'SALES-COMMANDER': { role: 'Pipeline management', priority: 1, skills: ['deal-tracking', 'forecasting'] },
      'QUALIFIER-AGENT': { role: 'Lead qualification', priority: 1, skills: ['discovery', 'fit-assessment'] },
      'PRESENTER-AGENT': { role: 'Sales presentations', priority: 2, skills: ['demos', 'value-articulation'] },
      'OBJECTION-HANDLER': { role: 'Objection responses', priority: 1, skills: ['pattern-matching', 'counter-responses'] },
      'CLOSER-AGENT': { role: 'Deal closing', priority: 1, skills: ['closing-sequences', 'urgency-creation'] },
      'FOLLOW-UP-AGENT': { role: 'Post-pitch follow-up', priority: 2, skills: ['sequence-management', 're-engagement'] },
      'HIGH-TICKET-AGENT': { role: 'Premium sales', priority: 1, skills: ['consultative-selling', 'high-value-deals'] },
      'UPSELL-AGENT': { role: 'Expansion revenue', priority: 2, skills: ['cross-sells', 'upgrades', 'add-ons'] },
      'RECOVERY-AGENT': { role: 'Lost deal recovery', priority: 2, skills: ['win-back', 'reactivation'] },
      'PAYMENT-AGENT': { role: 'Transaction handling', priority: 2, skills: ['stripe', 'payment-plans'] }
    }
  },
  
  support: {
    name: 'Support Division',
    agentCount: 8,
    agents: {
      'SUPPORT-COMMANDER': { role: 'Ticket management', priority: 1, skills: ['triage', 'routing', 'escalation'] },
      'FAQ-AGENT': { role: 'Common questions', priority: 2, skills: ['instant-responses', 'knowledge-base'] },
      'ONBOARDING-AGENT': { role: 'New customer setup', priority: 1, skills: ['welcome-sequences', 'quick-wins'] },
      'TECHNICAL-AGENT': { role: 'Technical issues', priority: 2, skills: ['troubleshooting', 'access-problems'] },
      'SUCCESS-AGENT': { role: 'Customer success', priority: 2, skills: ['milestone-tracking', 'check-ins'] },
      'RETENTION-AGENT': { role: 'Churn prevention', priority: 1, skills: ['risk-detection', 'save-attempts'] },
      'REFUND-AGENT': { role: 'Refund handling', priority: 2, skills: ['policy-enforcement', 'saves'] },
      'ESCALATION-AGENT': { role: 'Complex cases', priority: 1, skills: ['human-intervention', 'vip-handling'] }
    }
  },
  
  analytics: {
    name: 'Analytics Division',
    agentCount: 4,
    agents: {
      'METRICS-COLLECTOR': { role: 'Data aggregation', priority: 2, skills: ['cross-platform', 'data-collection'] },
      'ANALYST-AGENT': { role: 'Performance analysis', priority: 2, skills: ['trend-identification', 'insights'] },
      'OPTIMIZER-AGENT': { role: 'System optimization', priority: 2, skills: ['ab-testing', 'improvements'] },
      'EXECUTIVE-REPORTER': { role: 'Leadership reporting', priority: 2, skills: ['daily-weekly-monthly', 'summaries'] }
    }
  }
};

// Task queue
let taskQueue = [];
let agentRegistry = {};
let metrics = {};

/**
 * Initialize directories and files
 */
async function initFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(QUEUE_FILE, 'utf8');
    taskQueue = JSON.parse(data);
  } catch {
    taskQueue = [];
  }
  
  try {
    const data = await fs.readFile(AGENTS_FILE, 'utf8');
    agentRegistry = JSON.parse(data);
  } catch {
    agentRegistry = initAgentRegistry();
    await saveAgentRegistry();
  }
  
  try {
    const data = await fs.readFile(METRICS_FILE, 'utf8');
    metrics = JSON.parse(data);
  } catch {
    metrics = initMetrics();
  }
}

/**
 * Initialize agent registry from architecture
 */
function initAgentRegistry() {
  const registry = {};
  
  for (const [divisionKey, division] of Object.entries(AGENT_ARCHITECTURE)) {
    for (const [agentId, agentDef] of Object.entries(division.agents)) {
      const fullId = `${divisionKey.toUpperCase()}.${agentId}`;
      registry[fullId] = {
        id: fullId,
        shortId: agentId,
        division: divisionKey,
        divisionName: division.name,
        ...agentDef,
        status: 'idle',
        currentTask: null,
        lastActive: null,
        tasksCompleted: 0,
        tasksInProgress: 0,
        avgDuration: 0,
        errorCount: 0
      };
    }
  }
  
  return registry;
}

/**
 * Initialize metrics
 */
function initMetrics() {
  return {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    avgResponseTime: 0,
    tasksByDivision: {},
    tasksByPriority: { 1: 0, 2: 0, 3: 0 },
    hourlyActivity: Array(24).fill(0),
    dailyStats: {}
  };
}

/**
 * Save task queue
 */
async function saveQueue() {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(taskQueue, null, 2));
}

/**
 * Save agent registry
 */
async function saveAgentRegistry() {
  await fs.writeFile(AGENTS_FILE, JSON.stringify(agentRegistry, null, 2));
}

/**
 * Save metrics
 */
async function saveMetrics() {
  await fs.writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

/**
 * Create task
 */
function createTask(division, taskType, data, priority = 2) {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    division,
    taskType,
    data,
    priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
    assignedTo: null,
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    approvalId: null,
    approvalStatus: null,
    retries: 0,
    maxRetries: 3
  };
}

async function enforceApprovalGate(task, sourceAgent = 'agent-coordinator', targetAgent = null) {
  const payload = task.data && typeof task.data === 'object' ? task.data : {};
  const classification = classifyApprovalCandidate({
    taskType: task.taskType,
    actionFamily: payload.actionFamily || payload.action_family,
    payload,
  });

  if (!classification.requiresApproval || !classification.actionFamily) {
    return { approved: true, gated: false, actionFamily: null };
  }

  task.status = 'awaiting_approval';
  task.approvalStatus = 'pending';
  await saveQueue();

  const approval = await createHumanApprovalRequest({
    requestType: 'agent_action',
    actionFamily: classification.actionFamily,
    sourceAgent,
    targetAgent,
    correlationId: task.id,
    payloadPreview: buildApprovalPreview({
      division: task.division,
      taskType: task.taskType,
      data: task.data,
    }),
    fullPayload: {
      taskId: task.id,
      division: task.division,
      taskType: task.taskType,
      data: task.data,
      priority: task.priority,
    },
    requestedBy: sourceAgent,
  });

  task.approvalId = approval.id;
  task.approvalStatus = approval.status;
  await saveQueue();

  const resolution = await waitForHumanApproval(approval.id);
  task.approvalStatus = resolution.status;

  if (resolution.status !== 'approved' && resolution.status !== 'executing') {
    task.status = resolution.status === 'rejected' ? 'rejected' : 'expired';
    task.error = `Human approval ${resolution.status}`;
    await saveQueue();
    return {
      approved: false,
      gated: true,
      actionFamily: classification.actionFamily,
      status: resolution.status,
    };
  }

  const executingApproval = resolution.status === 'executing'
    ? resolution.approval
    : await markHumanApprovalExecuting(approval.id);

  if (!executingApproval) {
    task.status = 'blocked';
    task.error = 'Approval could not transition to executing';
    await saveQueue();
    return {
      approved: false,
      gated: true,
      actionFamily: classification.actionFamily,
      status: 'blocked',
    };
  }

  task.approvalStatus = executingApproval.status;
  task.status = 'pending';
  await saveQueue();

  return {
    approved: true,
    gated: true,
    actionFamily: classification.actionFamily,
    status: executingApproval.status,
  };
}

/**
 * Get best agent for task
 */
function getBestAgent(division, taskType) {
  const divisionAgents = Object.values(agentRegistry)
    .filter(a => a.division === division && a.status === 'idle')
    .sort((a, b) => {
      // Priority by: 1) skill match, 2) lower error rate, 3) lower avg duration
      const aHasSkill = a.skills.some(s => taskType.toLowerCase().includes(s) || s.includes(taskType.toLowerCase()));
      const bHasSkill = b.skills.some(s => taskType.toLowerCase().includes(s) || s.includes(taskType.toLowerCase()));
      
      if (aHasSkill && !bHasSkill) return -1;
      if (!aHasSkill && bHasSkill) return 1;
      
      const aErrorRate = a.errorCount / Math.max(a.tasksCompleted, 1);
      const bErrorRate = b.errorCount / Math.max(b.tasksCompleted, 1);
      
      if (aErrorRate !== bErrorRate) return aErrorRate - bErrorRate;
      
      return a.avgDuration - b.avgDuration;
    });
  
  return divisionAgents[0] || null;
}

/**
 * Dispatch task to division
 */
async function dispatchTask(division, taskType, data, priority = 2) {
  const task = createTask(division, taskType, data, priority);

  taskQueue.push(task);
  taskQueue.sort((a, b) => a.priority - b.priority);
  await saveQueue();

  metrics.totalTasks++;
  metrics.tasksByDivision[division] = (metrics.tasksByDivision[division] || 0) + 1;
  metrics.tasksByPriority[priority]++;
  metrics.hourlyActivity[new Date().getHours()]++;
  
  const approval = await enforceApprovalGate(task);
  if (!approval.approved) {
    metrics.failedTasks++;
    await saveMetrics();
    console.log(`Task dispatched: ${task.id} -> ${division}`);
    console.log(`  Blocked by human approval: ${approval.status}`);
    return task;
  }

  // Try to assign immediately
  const agent = getBestAgent(division, taskType);

  if (agent) {
    task.assignedTo = agent.id;
    task.status = 'assigned';
    task.startedAt = new Date().toISOString();
    agent.status = 'busy';
    agent.currentTask = task.id;
    agent.tasksInProgress++;
    await saveAgentRegistry();
  } else {
    task.status = 'pending';
  }

  await saveQueue();
  await saveMetrics();

  console.log(`Task dispatched: ${task.id} -> ${division}`);
  if (agent) {
    console.log(`  Assigned to: ${agent.id}`);
  } else {
    console.log(`  Queued (no available agents)`);
  }
  
  return task;
}

/**
 * Assign task to specific agent
 */
async function assignTask(agentId, task) {
  const agent = agentRegistry[agentId];
  if (!agent) {
    return { success: false, error: `Agent not found: ${agentId}` };
  }
  
  if (agent.status !== 'idle') {
    return { success: false, error: `Agent is busy: ${agent.status}` };
  }
  
  const taskObj = typeof task === 'string' ? { id: task, taskType: task } : task;
  const approvalProbe = {
    id: taskObj.id || `direct-${Date.now()}`,
    division: agent.division,
    taskType: taskObj.taskType,
    data: taskObj.data || {},
    priority: 2,
    status: 'pending',
    approvalId: null,
    approvalStatus: null,
  };
  const approval = await enforceApprovalGate(approvalProbe, 'agent-coordinator', agentId);
  if (!approval.approved) {
    return { success: false, error: `Human approval ${approval.status || 'blocked'}` };
  }
  
  agent.status = 'busy';
  agent.currentTask = taskObj.id || taskObj.taskType;
  agent.lastActive = new Date().toISOString();
  agent.tasksInProgress++;
  
  await saveAgentRegistry();
  
  console.log(`Task assigned: ${taskObj.id || taskObj.taskType} -> ${agentId}`);
  return { success: true, agent: agentId, task: taskObj };
}

/**
 * Complete task
 */
async function completeTask(taskId, result, success = true) {
  const taskIndex = taskQueue.findIndex(t => t.id === taskId);
  
  if (taskIndex !== -1) {
    const task = taskQueue[taskIndex];
    task.status = success ? 'completed' : 'failed';
    task.completedAt = new Date().toISOString();
    task.result = result;
    
    // Update agent stats
    if (task.assignedTo) {
      const agent = agentRegistry[task.assignedTo];
      if (agent) {
        agent.status = 'idle';
        agent.currentTask = null;
        agent.tasksInProgress--;
        agent.tasksCompleted++;
        
        if (!success) {
          agent.errorCount++;
        }
        
        // Update avg duration
        const duration = new Date(task.completedAt) - new Date(task.startedAt || task.createdAt);
        agent.avgDuration = (agent.avgDuration * (agent.tasksCompleted - 1) + duration) / agent.tasksCompleted;
        
        await saveAgentRegistry();
      }
    }
    
    // Update metrics
    if (success) {
      metrics.completedTasks++;
    } else {
      metrics.failedTasks++;
    }
    
    await saveQueue();
    await saveMetrics();
  }
  
  return { success: true, taskId };
}

/**
 * Process pending queue
 */
async function processQueue() {
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');
  let assigned = 0;
  
  for (const task of pendingTasks) {
    if (task.approvalId && !['approved', 'executing'].includes(task.approvalStatus || '')) {
      continue;
    }

    if (!task.approvalId) {
      const approval = await enforceApprovalGate(task, 'agent-coordinator', null);
      if (!approval.approved) {
        continue;
      }
    }

    const agent = getBestAgent(task.division, task.taskType);
    
    if (agent) {
      task.assignedTo = agent.id;
      task.status = 'assigned';
      task.startedAt = new Date().toISOString();
      
      agent.status = 'busy';
      agent.currentTask = task.id;
      agent.lastActive = new Date().toISOString();
      agent.tasksInProgress++;
      
      assigned++;
    }
  }
  
  if (assigned > 0) {
    await saveQueue();
    await saveAgentRegistry();
    console.log(`Processed queue: ${assigned} tasks assigned`);
  }
  
  return assigned;
}

/**
 * Get agent status
 */
function getAgentStatus() {
  const byDivision = {};
  
  for (const [divKey, division] of Object.entries(AGENT_ARCHITECTURE)) {
    const agents = Object.values(agentRegistry).filter(a => a.division === divKey);
    byDivision[division.name] = {
      total: agents.length,
      idle: agents.filter(a => a.status === 'idle').length,
      busy: agents.filter(a => a.status === 'busy').length,
      error: agents.filter(a => a.status === 'error').length,
      agents: agents.map(a => ({
        id: a.shortId,
        status: a.status,
        currentTask: a.currentTask,
        completed: a.tasksCompleted,
        errors: a.errorCount
      }))
    };
  }
  
  return byDivision;
}

/**
 * Health check all agents
 */
async function healthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    healthy: 0,
    unhealthy: 0,
    agents: {}
  };
  
  for (const agent of Object.values(agentRegistry)) {
    const errorRate = agent.errorCount / Math.max(agent.tasksCompleted, 1);
    const isHealthy = agent.status !== 'error' && errorRate < 0.3;
    
    results.agents[agent.id] = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      currentStatus: agent.status,
      errorRate: (errorRate * 100).toFixed(1) + '%',
      tasksCompleted: agent.tasksCompleted,
      avgDuration: (agent.avgDuration / 1000).toFixed(1) + 's'
    };
    
    if (isHealthy) {
      results.healthy++;
    } else {
      results.unhealthy++;
    }
  }
  
  results.summary = `${results.healthy}/${results.healthy + results.unhealthy} agents healthy`;
  return results;
}

/**
 * Get metrics
 */
function getMetrics() {
  return {
    ...metrics,
    successRate: metrics.totalTasks > 0 
      ? ((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1) + '%' 
      : 'N/A',
    queueLength: taskQueue.filter(t => t.status === 'pending').length,
    inProgress: taskQueue.filter(t => t.status === 'assigned').length
  };
}

/**
 * Get queue status
 */
function getQueueStatus() {
  return {
    pending: taskQueue.filter(t => t.status === 'pending').length,
    assigned: taskQueue.filter(t => t.status === 'assigned').length,
    awaitingApproval: taskQueue.filter(t => t.status === 'awaiting_approval').length,
    completed: taskQueue.filter(t => t.status === 'completed').length,
    failed: taskQueue.filter(t => ['failed', 'rejected', 'expired', 'blocked'].includes(t.status)).length,
    tasks: taskQueue.slice(-20).map(t => ({
      id: t.id.substring(0, 20),
      division: t.division,
      type: t.taskType,
      status: t.status,
      assignedTo: t.assignedTo?.split('.')[1] || null
    }))
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initFiles();
  
  try {
    switch (command) {
      case 'dispatch': {
        const division = args[0];
        const taskType = args[1];
        const data = args[2] ? JSON.parse(args[2]) : {};
        const priority = parseInt(args[3]) || 2;
        
        if (!division || !taskType) {
          console.error('Usage: dispatch <division> <taskType> [data] [priority]');
          console.error('Divisions:', Object.keys(AGENT_ARCHITECTURE).join(', '));
          process.exit(1);
        }
        
        const result = await dispatchTask(division, taskType, data, priority);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'assign': {
        const agentId = args[0];
        const task = args[1];
        if (!agentId || !task) {
          console.error('Usage: assign <agentId> <task>');
          process.exit(1);
        }
        const result = await assignTask(agentId, task);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'complete': {
        const taskId = args[0];
        const result = args[1] || 'completed';
        const success = args[2] !== 'false';
        const res = await completeTask(taskId, result, success);
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      
      case 'process': {
        const assigned = await processQueue();
        console.log(`Processed: ${assigned} tasks assigned`);
        break;
      }
      
      case 'status': {
        const status = getAgentStatus();
        console.log('Agent Status by Division');
        console.log('='.repeat(50));
        for (const [name, data] of Object.entries(status)) {
          console.log(`\n${name} (${data.idle}/${data.total} available)`);
          for (const agent of data.agents) {
            const status = agent.status === 'idle' ? '' : ` [${agent.status}]`;
            const task = agent.currentTask ? ` -> ${agent.currentTask}` : '';
            console.log(`  ${agent.id}${status}${task} (${agent.completed} done, ${agent.errors} err)`);
          }
        }
        break;
      }
      
      case 'queue': {
        const queue = getQueueStatus();
        console.log('Task Queue Status');
        console.log('='.repeat(50));
        console.log(`Pending: ${queue.pending} | Awaiting Approval: ${queue.awaitingApproval} | In Progress: ${queue.assigned} | Completed: ${queue.completed} | Failed: ${queue.failed}`);
        console.log('\nRecent Tasks:');
        for (const task of queue.tasks) {
          console.log(`  ${task.id}... [${task.status}] ${task.division}/${task.type} ${task.assignedTo ? '-> ' + task.assignedTo : ''}`);
        }
        break;
      }
      
      case 'health': {
        const health = await healthCheck();
        console.log('Health Check:', health.summary);
        console.log('='.repeat(50));
        for (const [id, data] of Object.entries(health.agents)) {
          const icon = data.status === 'healthy' ? '' : '';
          console.log(`${icon} ${id.padEnd(30)} ${data.status} (${data.errorRate} errors, ${data.avgDuration} avg)`);
        }
        break;
      }
      
      case 'metrics': {
        const m = getMetrics();
        console.log('Performance Metrics');
        console.log('='.repeat(50));
        console.log(`Total Tasks:    ${m.totalTasks}`);
        console.log(`Completed:      ${m.completedTasks}`);
        console.log(`Failed:         ${m.failedTasks}`);
        console.log(`Success Rate:   ${m.successRate}`);
        console.log(`Queue Length:   ${m.queueLength}`);
        console.log(`In Progress:    ${m.inProgress}`);
        console.log('\nTasks by Division:');
        for (const [div, count] of Object.entries(m.tasksByDivision)) {
          console.log(`  ${div}: ${count}`);
        }
        break;
      }
      
      case 'agents': {
        console.log('72-Agent Architecture');
        console.log('='.repeat(50));
        let total = 0;
        for (const [key, div] of Object.entries(AGENT_ARCHITECTURE)) {
          const count = Object.keys(div.agents).length;
          total += count;
          console.log(`\n${div.name} (${count} agents):`);
          for (const [agentId, agent] of Object.entries(div.agents)) {
            console.log(`  ${agentId.padEnd(20)} - ${agent.role}`);
          }
        }
        console.log(`\nTotal: ${total} agents`);
        break;
      }
      
      case 'test': {
        console.log('Agent Coordinator Module');
        console.log('========================');
        console.log('Architecture: 72 agents across 8 divisions');
        console.log('\nDivisions:');
        for (const [key, div] of Object.entries(AGENT_ARCHITECTURE)) {
          console.log(`  ${key}: ${div.name} (${div.agentCount} agents)`);
        }
        console.log('\nCommands:');
        console.log('  dispatch <div> <task>  - Dispatch task');
        console.log('  assign <agent> <task>  - Assign to agent');
        console.log('  complete <taskId>      - Complete task');
        console.log('  process                - Process queue');
        console.log('  status                 - Agent status');
        console.log('  queue                  - Queue status');
        console.log('  health                 - Health check');
        console.log('  metrics                - Performance metrics');
        console.log('  agents                 - List all agents');
        break;
      }
      
      default:
        console.log('Agent Coordinator - OpenClaw');
        console.log('Run with "test" to see available commands');
        console.log('Run with "agents" to see the 72-agent architecture');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  dispatchTask,
  assignTask,
  completeTask,
  processQueue,
  getAgentStatus,
  healthCheck,
  getMetrics,
  getQueueStatus,
  getBestAgent,
  AGENT_ARCHITECTURE
};

// Run CLI
main().catch(console.error);
