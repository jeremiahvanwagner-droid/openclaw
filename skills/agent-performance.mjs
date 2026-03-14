#!/usr/bin/env node
/**
 * OpenClaw Agent Performance Monitor
 * 
 * Tracks performance metrics for each OpenClaw agent:
 *   - Response times
 *   - Task completion rates
 *   - Error rates
 *   - Message volumes
 *   - Session durations
 *   - Cron job reliability
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const AGENTS_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'agents');
const PERFORMANCE_FILE = path.join(DATA_DIR, 'agent-performance.json');

// Performance targets
const PERFORMANCE_TARGETS = {
  responseTime: 5000,      // ms - target response time
  successRate: 95,         // % - target success rate
  cronReliability: 99,     // % - cron job reliability
  errorRate: 2             // % - max error rate
};

// Agent definitions
const AGENTS = ['main', 'marketing', 'sales', 'support'];

/**
 * Load performance data
 */
async function loadPerformanceData() {
  try {
    const data = await fs.readFile(PERFORMANCE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      agents: {},
      cronJobs: {},
      dailyMetrics: [],
      lastUpdated: null
    };
  }
}

/**
 * Save performance data
 */
async function savePerformanceData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PERFORMANCE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get agent session stats from OpenClaw
 */
async function getAgentSessions(agentId) {
  const sessionsFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  
  try {
    const data = await fs.readFile(sessionsFile, 'utf8');
    const sessions = JSON.parse(data);
    return Object.values(sessions);
  } catch {
    return [];
  }
}

/**
 * Analyze session performance
 */
function analyzeSession(session) {
  const turns = session.turns || [];
  let totalResponseTime = 0;
  let turnCount = 0;
  let errors = 0;
  
  for (const turn of turns) {
    if (turn.startMs && turn.endMs) {
      totalResponseTime += (turn.endMs - turn.startMs);
      turnCount++;
    }
    
    if (turn.error || turn.status === 'error') {
      errors++;
    }
  }
  
  return {
    sessionKey: session.sessionKey,
    label: session.label || 'Unknown',
    turns: turnCount,
    avgResponseTime: turnCount > 0 ? Math.round(totalResponseTime / turnCount) : 0,
    errors,
    successRate: turnCount > 0 ? ((turnCount - errors) / turnCount * 100).toFixed(1) : 100,
    lastActivity: session.updatedAt || session.createdAt
  };
}

/**
 * Get cron job stats
 */
async function getCronStats() {
  try {
    const { stdout } = await execAsync('openclaw cron list --json 2>&1');
    const lines = stdout.split('\n').filter(line => line.trim().startsWith('{') || line.trim().startsWith('['));
    
    if (lines.length === 0) return [];
    
    // Try to find JSON in output
    let cronJobs = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          cronJobs = parsed;
          break;
        }
      } catch {
        continue;
      }
    }
    
    return cronJobs;
  } catch {
    return [];
  }
}

/**
 * Collect agent performance metrics
 */
async function collectMetrics() {
  console.log('⏳ Collecting agent performance metrics...\n');
  
  const perfData = await loadPerformanceData();
  const timestamp = new Date().toISOString();
  
  const snapshot = {
    timestamp,
    agents: {}
  };
  
  for (const agentId of AGENTS) {
    console.log(`📊 Analyzing ${agentId} agent...`);
    
    const sessions = await getAgentSessions(agentId);
    const recentSessions = sessions.filter(s => {
      const lastActivity = new Date(s.updatedAt || s.createdAt).getTime();
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // Last 7 days
      return lastActivity > cutoff;
    });
    
    const sessionAnalysis = recentSessions.map(analyzeSession);
    
    const totalTurns = sessionAnalysis.reduce((sum, s) => sum + s.turns, 0);
    const totalErrors = sessionAnalysis.reduce((sum, s) => sum + s.errors, 0);
    const avgResponses = sessionAnalysis.filter(s => s.avgResponseTime > 0);
    const overallAvgResponse = avgResponses.length > 0
      ? Math.round(avgResponses.reduce((sum, s) => sum + s.avgResponseTime, 0) / avgResponses.length)
      : 0;
    
    snapshot.agents[agentId] = {
      sessions: recentSessions.length,
      turns: totalTurns,
      errors: totalErrors,
      avgResponseTime: overallAvgResponse,
      successRate: totalTurns > 0 ? ((totalTurns - totalErrors) / totalTurns * 100).toFixed(1) : 100,
      errorRate: totalTurns > 0 ? (totalErrors / totalTurns * 100).toFixed(1) : 0
    };
    
    console.log(`   Sessions: ${recentSessions.length}, Turns: ${totalTurns}, Errors: ${totalErrors}`);
  }
  
  // Collect cron stats
  const cronJobs = await getCronStats();
  snapshot.cronJobs = cronJobs.length;
  
  // Update stored data
  if (!perfData.agents) perfData.agents = {};
  for (const [agentId, metrics] of Object.entries(snapshot.agents)) {
    perfData.agents[agentId] = metrics;
  }
  
  perfData.dailyMetrics.unshift(snapshot);
  perfData.dailyMetrics = perfData.dailyMetrics.slice(0, 30); // Keep last 30 days
  perfData.lastUpdated = timestamp;
  
  await savePerformanceData(perfData);
  
  return snapshot;
}

/**
 * Generate performance report
 */
async function generateReport() {
  const perfData = await loadPerformanceData();
  
  console.log('\n' + '═'.repeat(70));
  console.log('🤖 OPENCLAW AGENT PERFORMANCE REPORT');
  console.log('═'.repeat(70));
  console.log(`Generated: ${new Date().toLocaleString()}`);
  console.log(`Last Data Update: ${perfData.lastUpdated || 'Never'}`);
  console.log('─'.repeat(70));
  
  // If no data, collect first
  if (!perfData.agents || Object.keys(perfData.agents).length === 0) {
    console.log('\n⚠️ No performance data found. Collecting now...\n');
    await collectMetrics();
    return generateReport();
  }
  
  // Agent Overview
  console.log('\n📊 AGENT OVERVIEW (Last 7 Days)\n');
  console.log('Agent'.padEnd(12) + 'Sessions'.padStart(10) + 'Turns'.padStart(10) + 'Errors'.padStart(8) + 'Success'.padStart(10) + 'Avg Time'.padStart(12) + 'Status'.padStart(8));
  console.log('─'.repeat(70));
  
  for (const agentId of AGENTS) {
    const metrics = perfData.agents[agentId] || { sessions: 0, turns: 0, errors: 0, successRate: '100', avgResponseTime: 0 };
    
    const successRate = parseFloat(metrics.successRate);
    const avgTime = metrics.avgResponseTime;
    
    let status = '✅';
    if (successRate < PERFORMANCE_TARGETS.successRate) status = '⚠️';
    if (successRate < 80) status = '❌';
    if (avgTime > PERFORMANCE_TARGETS.responseTime) status = '⚠️';
    
    console.log(
      agentId.padEnd(12) +
      metrics.sessions.toString().padStart(10) +
      metrics.turns.toString().padStart(10) +
      metrics.errors.toString().padStart(8) +
      (metrics.successRate + '%').padStart(10) +
      (avgTime + 'ms').padStart(12) +
      status.padStart(8)
    );
  }
  
  // Performance vs Targets
  console.log('\n🎯 PERFORMANCE VS TARGETS\n');
  
  for (const agentId of AGENTS) {
    const metrics = perfData.agents[agentId] || {};
    const successRate = parseFloat(metrics.successRate || 100);
    const avgTime = metrics.avgResponseTime || 0;
    const errorRate = parseFloat(metrics.errorRate || 0);
    
    console.log(`  ${agentId.toUpperCase()}`);
    console.log(`    Response Time: ${avgTime}ms ${avgTime <= PERFORMANCE_TARGETS.responseTime ? '✅' : '⚠️'} (target: ${PERFORMANCE_TARGETS.responseTime}ms)`);
    console.log(`    Success Rate: ${successRate}% ${successRate >= PERFORMANCE_TARGETS.successRate ? '✅' : '⚠️'} (target: ${PERFORMANCE_TARGETS.successRate}%)`);
    console.log(`    Error Rate: ${errorRate}% ${errorRate <= PERFORMANCE_TARGETS.errorRate ? '✅' : '⚠️'} (max: ${PERFORMANCE_TARGETS.errorRate}%)`);
    console.log('');
  }
  
  // Workload Distribution
  console.log('📈 WORKLOAD DISTRIBUTION\n');
  
  const totalTurns = AGENTS.reduce((sum, a) => sum + (perfData.agents[a]?.turns || 0), 0);
  
  for (const agentId of AGENTS) {
    const turns = perfData.agents[agentId]?.turns || 0;
    const pct = totalTurns > 0 ? ((turns / totalTurns) * 100).toFixed(1) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    
    console.log(`  ${agentId.padEnd(10)} ${bar} ${pct}% (${turns} turns)`);
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS\n');
  
  let recommendations = [];
  
  for (const agentId of AGENTS) {
    const metrics = perfData.agents[agentId] || {};
    
    if (parseFloat(metrics.successRate || 100) < 90) {
      recommendations.push(`⚠️ ${agentId} has low success rate (${metrics.successRate}%). Review error logs.`);
    }
    
    if (metrics.avgResponseTime > PERFORMANCE_TARGETS.responseTime * 2) {
      recommendations.push(`🐌 ${agentId} is slow (${metrics.avgResponseTime}ms avg). Consider optimizing prompts.`);
    }
    
    if ((metrics.turns || 0) === 0) {
      recommendations.push(`🔇 ${agentId} has no activity. Check agent configuration.`);
    }
  }
  
  if (recommendations.length === 0) {
    console.log('  ✅ All agents performing within targets!');
  } else {
    for (const rec of recommendations) {
      console.log(`  ${rec}`);
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  
  return perfData;
}

/**
 * Get agent health status
 */
async function getHealthStatus() {
  const perfData = await loadPerformanceData();
  
  const health = {};
  
  for (const agentId of AGENTS) {
    const metrics = perfData.agents[agentId] || {};
    const successRate = parseFloat(metrics.successRate || 100);
    const avgTime = metrics.avgResponseTime || 0;
    
    let status = 'healthy';
    let issues = [];
    
    if (successRate < PERFORMANCE_TARGETS.successRate) {
      status = 'degraded';
      issues.push(`Low success rate: ${successRate}%`);
    }
    
    if (avgTime > PERFORMANCE_TARGETS.responseTime) {
      status = 'degraded';
      issues.push(`Slow responses: ${avgTime}ms`);
    }
    
    if (successRate < 80 || avgTime > PERFORMANCE_TARGETS.responseTime * 3) {
      status = 'critical';
    }
    
    health[agentId] = {
      status,
      successRate,
      avgResponseTime: avgTime,
      issues
    };
  }
  
  return health;
}

/**
 * Record a performance event
 */
async function recordEvent(agentId, eventType, durationMs, success = true) {
  const perfData = await loadPerformanceData();
  
  if (!perfData.agents[agentId]) {
    perfData.agents[agentId] = { sessions: 0, turns: 0, errors: 0, avgResponseTime: 0, successRate: '100' };
  }
  
  perfData.agents[agentId].turns++;
  if (!success) {
    perfData.agents[agentId].errors++;
  }
  
  // Update rolling average
  const currentAvg = perfData.agents[agentId].avgResponseTime || 0;
  const turns = perfData.agents[agentId].turns;
  perfData.agents[agentId].avgResponseTime = Math.round(((currentAvg * (turns - 1)) + durationMs) / turns);
  
  // Recalculate success rate
  const errors = perfData.agents[agentId].errors;
  perfData.agents[agentId].successRate = ((turns - errors) / turns * 100).toFixed(1);
  perfData.agents[agentId].errorRate = (errors / turns * 100).toFixed(1);
  
  perfData.lastUpdated = new Date().toISOString();
  
  await savePerformanceData(perfData);
}

/**
 * Get trend data
 */
async function getTrends(days = 7) {
  const perfData = await loadPerformanceData();
  
  const recentMetrics = perfData.dailyMetrics.slice(0, days);
  
  if (recentMetrics.length < 2) {
    console.log('Not enough data for trend analysis.');
    return null;
  }
  
  console.log(`\n📈 PERFORMANCE TRENDS (Last ${days} snapshots)\n`);
  
  for (const agentId of AGENTS) {
    const oldest = recentMetrics[recentMetrics.length - 1]?.agents?.[agentId];
    const newest = recentMetrics[0]?.agents?.[agentId];
    
    if (!oldest || !newest) continue;
    
    const turnsDiff = (newest.turns || 0) - (oldest.turns || 0);
    const successDiff = parseFloat(newest.successRate || 0) - parseFloat(oldest.successRate || 0);
    const timeDiff = (newest.avgResponseTime || 0) - (oldest.avgResponseTime || 0);
    
    console.log(`  ${agentId.toUpperCase()}`);
    console.log(`    Turns: ${turnsDiff >= 0 ? '+' : ''}${turnsDiff}`);
    console.log(`    Success Rate: ${successDiff >= 0 ? '+' : ''}${successDiff.toFixed(1)}%`);
    console.log(`    Avg Response: ${timeDiff >= 0 ? '+' : ''}${timeDiff}ms`);
    console.log('');
  }
  
  return { recentMetrics };
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'collect':
    collectMetrics();
    break;
    
  case 'report':
    generateReport();
    break;
    
  case 'health':
    getHealthStatus().then(health => {
      console.log('\n🏥 AGENT HEALTH STATUS\n');
      for (const [agent, status] of Object.entries(health)) {
        const emoji = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
        console.log(`  ${emoji} ${agent}: ${status.status.toUpperCase()}`);
        if (status.issues.length > 0) {
          for (const issue of status.issues) {
            console.log(`      └─ ${issue}`);
          }
        }
      }
    });
    break;
    
  case 'trends':
    getTrends(parseInt(args[0]) || 7);
    break;
    
  case 'record':
    if (args.length < 3) {
      console.log('Usage: agent-performance.mjs record <agentId> <eventType> <durationMs> [success]');
      process.exit(1);
    }
    recordEvent(args[0], args[1], parseInt(args[2]), args[3] !== 'false');
    break;
    
  default:
    console.log(`
Agent Performance Monitor

Usage:
  agent-performance.mjs collect           - Collect metrics from all agents
  agent-performance.mjs report            - Generate performance report
  agent-performance.mjs health            - Show agent health status
  agent-performance.mjs trends [days]     - Show performance trends
  agent-performance.mjs record <agent> <event> <ms> [success]
`);
}

export {
  collectMetrics,
  generateReport,
  getHealthStatus,
  recordEvent,
  getTrends,
  PERFORMANCE_TARGETS
};
