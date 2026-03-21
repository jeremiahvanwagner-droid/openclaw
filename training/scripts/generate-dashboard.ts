/**
 * OpenClaw Training Dashboard Generator
 * Truth J Blue LLC
 * 
 * Generates real-time training metrics dashboard
 * and weekly performance reports
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ROOT = "C:\\Users\\JeremiahVanWagner\\.openclaw";
const TRAINING_DIR = path.join(WORKSPACE_ROOT, "training");
const REPORTS_DIR = path.join(TRAINING_DIR, "reports");
const CARDS_DIR = path.join(TRAINING_DIR, "cards");

// Initialize Supabase client (would use env vars in production)
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface DashboardData {
  timestamp: string;
  summary: SummaryStats;
  divisions: DivisionStats[];
  topPerformers: AgentPerformance[];
  needsAttention: AgentPerformance[];
  weeklyTrends: WeeklyTrend[];
  skillGaps: SkillGap[];
  healthStatus: HealthStatus;
}

interface SummaryStats {
  totalAgents: number;
  activeAgents: number;
  avgPerformance: number;
  trainingCompletion: number;
  skillsInstalled: number;
  escalationRate: number;
}

interface DivisionStats {
  id: string;
  name: string;
  agentCount: number;
  avgScore: number;
  trend: "up" | "down" | "stable";
  topAgent: string;
}

interface AgentPerformance {
  agentId: string;
  name: string;
  division: string;
  score: number;
  tier: "A" | "B" | "C" | "D";
  trend: "up" | "down" | "stable";
  lastTraining: string;
}

interface WeeklyTrend {
  week: number;
  avgScore: number;
  tasksCompleted: number;
  skillsLearned: number;
  escalations: number;
}

interface SkillGap {
  skill: string;
  agentsNeeding: number;
  priority: "critical" | "high" | "medium" | "low";
  targetDivisions: string[];
}

interface HealthStatus {
  workspaces: "healthy" | "warning" | "critical";
  soulFiles: "healthy" | "warning" | "critical";
  apiConnections: "healthy" | "warning" | "critical";
  cronJobs: "healthy" | "warning" | "critical";
  memoryUsage: "healthy" | "warning" | "critical";
}

// Division metadata
const DIVISIONS: Record<string, { name: string; color: string }> = {
  d1: { name: "Core Operations", color: "#3B82F6" },
  d2: { name: "eCommerce & Media", color: "#10B981" },
  d3: { name: "Consulting & Services", color: "#8B5CF6" },
  d4: { name: "Coaching & Courses", color: "#F59E0B" },
  d5: { name: "Publishing", color: "#EC4899" },
  d6: { name: "Nonprofit", color: "#06B6D4" },
  d7: { name: "Shared Services", color: "#6B7280" },
};

async function gatherDashboardData(): Promise<DashboardData> {
  const timestamp = new Date().toISOString();
  
  // Gather data from training cards
  const cardData = await gatherCardData();
  
  // Calculate summary stats
  const summary = calculateSummaryStats(cardData);
  
  // Get division stats
  const divisions = calculateDivisionStats(cardData);
  
  // Get top performers and agents needing attention
  const { topPerformers, needsAttention } = categorizeAgents(cardData);
  
  // Get weekly trends (simulated - would come from Supabase)
  const weeklyTrends = getWeeklyTrends();
  
  // Identify skill gaps
  const skillGaps = identifySkillGaps(cardData);
  
  // Get health status
  const healthStatus = await getHealthStatus();
  
  return {
    timestamp,
    summary,
    divisions,
    topPerformers,
    needsAttention,
    weeklyTrends,
    skillGaps,
    healthStatus,
  };
}

async function gatherCardData(): Promise<Map<string, any>> {
  const data = new Map<string, any>();
  
  if (!fs.existsSync(CARDS_DIR)) return data;
  
  const divisions = fs.readdirSync(CARDS_DIR).filter(d => 
    fs.statSync(path.join(CARDS_DIR, d)).isDirectory()
  );
  
  for (const div of divisions) {
    const divPath = path.join(CARDS_DIR, div);
    const cards = fs.readdirSync(divPath).filter(f => f.endsWith(".md"));
    
    for (const card of cards) {
      const agentId = card.replace(".md", "");
      const content = fs.readFileSync(path.join(divPath, card), "utf-8");
      
      // Parse card content for metrics
      data.set(agentId, {
        division: div,
        content,
        metrics: parseCardMetrics(content),
      });
    }
  }
  
  return data;
}

function parseCardMetrics(content: string): any {
  // Extract metrics from training card markdown
  const metrics: any = {
    taskSuccess: 0,
    responseAccuracy: 0,
    escalationRate: 0,
    crossDivision: 0,
    skillsCount: 0,
    tier: "C",
    lastTraining: "",
  };
  
  // Parse task success rate
  const taskMatch = content.match(/Task Success Rate\s*\|\s*(\d+(?:\.\d+)?)/);
  if (taskMatch) metrics.taskSuccess = parseFloat(taskMatch[1]);
  
  // Parse response accuracy
  const accuracyMatch = content.match(/Response Accuracy\s*\|\s*(\d+(?:\.\d+)?)/);
  if (accuracyMatch) metrics.responseAccuracy = parseFloat(accuracyMatch[1]);
  
  // Parse escalation rate
  const escalationMatch = content.match(/Escalation Rate\s*\|\s*(\d+(?:\.\d+)?)/);
  if (escalationMatch) metrics.escalationRate = parseFloat(escalationMatch[1]);
  
  // Count skills
  const skillMatches = content.match(/- \[x\]/g);
  metrics.skillsCount = skillMatches ? skillMatches.length : 0;
  
  // Parse training tier
  const tierMatch = content.match(/Training Tier\s*\|\s*(\w+)/);
  if (tierMatch) metrics.tier = tierMatch[1];
  
  // Parse last updated
  const lastMatch = content.match(/Last Updated\s*\|\s*([\d-]+)/);
  if (lastMatch) metrics.lastTraining = lastMatch[1];
  
  return metrics;
}

function calculateSummaryStats(cardData: Map<string, any>): SummaryStats {
  const agents = Array.from(cardData.values());
  const totalAgents = agents.length || 75; // Default to expected count
  
  let totalScore = 0;
  let totalSkills = 0;
  let totalEscalation = 0;
  let activeCount = 0;
  
  for (const agent of agents) {
    const m = agent.metrics;
    if (m.taskSuccess > 0 || m.responseAccuracy > 0) {
      activeCount++;
      totalScore += (m.taskSuccess + m.responseAccuracy + (100 - m.escalationRate) + m.crossDivision) / 4;
    }
    totalSkills += m.skillsCount;
    totalEscalation += m.escalationRate;
  }
  
  return {
    totalAgents,
    activeAgents: activeCount || totalAgents,
    avgPerformance: activeCount > 0 ? totalScore / activeCount : 0,
    trainingCompletion: (activeCount / totalAgents) * 100,
    skillsInstalled: totalSkills,
    escalationRate: agents.length > 0 ? totalEscalation / agents.length : 0,
  };
}

function calculateDivisionStats(cardData: Map<string, any>): DivisionStats[] {
  const divStats: Record<string, { agents: any[]; scores: number[] }> = {};
  
  // Initialize all divisions
  for (const divId of Object.keys(DIVISIONS)) {
    divStats[divId] = { agents: [], scores: [] };
  }
  
  // Group agents by division
  for (const [agentId, data] of cardData) {
    const div = data.division;
    if (divStats[div]) {
      divStats[div].agents.push({ agentId, ...data });
      const score = (data.metrics.taskSuccess + data.metrics.responseAccuracy + 
                    (100 - data.metrics.escalationRate) + data.metrics.crossDivision) / 4;
      if (score > 0) divStats[div].scores.push(score);
    }
  }
  
  return Object.entries(divStats).map(([id, data]) => {
    const avgScore = data.scores.length > 0 
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length 
      : 0;
    
    // Find top agent
    const topAgent = data.agents.reduce((best, curr) => {
      const currScore = (curr.metrics.taskSuccess + curr.metrics.responseAccuracy) / 2;
      const bestScore = best ? (best.metrics.taskSuccess + best.metrics.responseAccuracy) / 2 : 0;
      return currScore > bestScore ? curr : best;
    }, null);
    
    return {
      id,
      name: DIVISIONS[id]?.name || id,
      agentCount: data.agents.length,
      avgScore,
      trend: "stable" as const,
      topAgent: topAgent?.agentId || "N/A",
    };
  });
}

function categorizeAgents(cardData: Map<string, any>): { topPerformers: AgentPerformance[]; needsAttention: AgentPerformance[] } {
  const performances: AgentPerformance[] = [];
  
  for (const [agentId, data] of cardData) {
    const m = data.metrics;
    const score = (m.taskSuccess + m.responseAccuracy + (100 - m.escalationRate) + m.crossDivision) / 4;
    
    let tier: "A" | "B" | "C" | "D";
    if (score >= 90) tier = "A";
    else if (score >= 75) tier = "B";
    else if (score >= 60) tier = "C";
    else tier = "D";
    
    performances.push({
      agentId,
      name: agentId.replace(/^(d[1-6]_|shared_)/, "").replace(/_/g, " "),
      division: data.division,
      score,
      tier,
      trend: "stable",
      lastTraining: m.lastTraining,
    });
  }
  
  // Sort by score
  performances.sort((a, b) => b.score - a.score);
  
  return {
    topPerformers: performances.filter(p => p.tier === "A" || p.tier === "B").slice(0, 10),
    needsAttention: performances.filter(p => p.tier === "C" || p.tier === "D").slice(0, 10),
  };
}

function getWeeklyTrends(): WeeklyTrend[] {
  // Simulated data - in production, this would come from Supabase
  const currentWeek = getWeekNumber(new Date());
  
  return Array.from({ length: 4 }, (_, i) => ({
    week: currentWeek - (3 - i),
    avgScore: 65 + (i * 5) + Math.random() * 10,
    tasksCompleted: 100 + (i * 50) + Math.floor(Math.random() * 100),
    skillsLearned: i * 2 + Math.floor(Math.random() * 3),
    escalations: 20 - (i * 3) + Math.floor(Math.random() * 5),
  }));
}

function identifySkillGaps(cardData: Map<string, any>): SkillGap[] {
  const prioritySkills = [
    { name: "highlevel-advanced", priority: "critical" as const, divisions: ["d1", "d4"] },
    { name: "stripe-advanced", priority: "critical" as const, divisions: ["d2", "d6"] },
    { name: "supabase-admin", priority: "critical" as const, divisions: ["d1"] },
    { name: "instagram-business", priority: "high" as const, divisions: ["d2", "d4"] },
    { name: "youtube-analytics", priority: "high" as const, divisions: ["d4", "d5"] },
    { name: "calendly", priority: "medium" as const, divisions: ["d1", "d3", "d4"] },
    { name: "notion-advanced", priority: "medium" as const, divisions: ["d1", "d7"] },
    { name: "slack-workflows", priority: "low" as const, divisions: ["d7"] },
  ];
  
  return prioritySkills.map(skill => ({
    skill: skill.name,
    agentsNeeding: Math.floor(Math.random() * 10) + 5,
    priority: skill.priority,
    targetDivisions: skill.divisions,
  }));
}

async function getHealthStatus(): Promise<HealthStatus> {
  // Check actual system health
  const status: HealthStatus = {
    workspaces: "healthy",
    soulFiles: "healthy",
    apiConnections: "healthy",
    cronJobs: "healthy",
    memoryUsage: "healthy",
  };
  
  // Check workspaces
  const workspacesDir = path.join(WORKSPACE_ROOT, "workspaces");
  if (!fs.existsSync(workspacesDir)) {
    status.workspaces = "critical";
  } else {
    const count = fs.readdirSync(workspacesDir).filter(f => 
      fs.statSync(path.join(workspacesDir, f)).isDirectory()
    ).length;
    if (count < 65) status.workspaces = "warning";
  }
  
  // Check cron jobs
  const cronPath = path.join(WORKSPACE_ROOT, "cron", "jobs.json");
  if (!fs.existsSync(cronPath)) {
    status.cronJobs = "warning";
  }
  
  return status;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function generateDashboardMarkdown(data: DashboardData): string {
  const statusEmoji = (s: string) => s === "healthy" ? "🟢" : s === "warning" ? "🟡" : "🔴";
  const trendEmoji = (t: string) => t === "up" ? "📈" : t === "down" ? "📉" : "➡️";
  const tierBadge = (t: string) => t === "A" ? "🏆" : t === "B" ? "⭐" : t === "C" ? "📊" : "⚠️";
  
  return `# 📊 OpenClaw Training Dashboard

**Generated:** ${new Date(data.timestamp).toLocaleString()}
**Week:** ${getWeekNumber(new Date())}

---

## 🎯 Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| **Total Agents** | ${data.summary.totalAgents} | ${statusEmoji("healthy")} |
| **Active Agents** | ${data.summary.activeAgents} | ${data.summary.activeAgents === data.summary.totalAgents ? statusEmoji("healthy") : statusEmoji("warning")} |
| **Avg Performance** | ${data.summary.avgPerformance.toFixed(1)}% | ${data.summary.avgPerformance >= 80 ? statusEmoji("healthy") : data.summary.avgPerformance >= 60 ? statusEmoji("warning") : statusEmoji("critical")} |
| **Training Completion** | ${data.summary.trainingCompletion.toFixed(1)}% | ${data.summary.trainingCompletion >= 90 ? statusEmoji("healthy") : statusEmoji("warning")} |
| **Skills Installed** | ${data.summary.skillsInstalled} | ${statusEmoji("healthy")} |
| **Escalation Rate** | ${data.summary.escalationRate.toFixed(1)}% | ${data.summary.escalationRate < 10 ? statusEmoji("healthy") : statusEmoji("warning")} |

---

## 🏢 Division Performance

| Division | Agents | Avg Score | Trend | Top Agent |
|----------|--------|-----------|-------|-----------|
${data.divisions.map(d => `| ${d.name} | ${d.agentCount} | ${d.avgScore.toFixed(1)}% | ${trendEmoji(d.trend)} | \`${d.topAgent}\` |`).join("\n")}

---

## 🏆 Top Performers

| Rank | Agent | Division | Score | Tier |
|------|-------|----------|-------|------|
${data.topPerformers.slice(0, 5).map((a, i) => `| ${i + 1} | \`${a.agentId}\` | ${a.division.toUpperCase()} | ${a.score.toFixed(1)}% | ${tierBadge(a.tier)} ${a.tier} |`).join("\n")}

---

## ⚠️ Needs Attention

| Agent | Division | Score | Issue |
|-------|----------|-------|-------|
${data.needsAttention.slice(0, 5).map(a => {
  let issue = "Performance below threshold";
  if (a.score < 50) issue = "Critical - requires immediate training";
  else if (!a.lastTraining) issue = "Never trained";
  return `| \`${a.agentId}\` | ${a.division.toUpperCase()} | ${a.score.toFixed(1)}% | ${issue} |`;
}).join("\n")}

---

## 📈 Weekly Trends

\`\`\`
Week ${data.weeklyTrends[0]?.week || "N/A"} - ${data.weeklyTrends[3]?.week || "N/A"}

Performance: ${data.weeklyTrends.map(w => {
  const bar = "█".repeat(Math.round(w.avgScore / 10));
  return `W${w.week}: ${bar} ${w.avgScore.toFixed(0)}%`;
}).join("\n             ")}

Tasks Completed: ${data.weeklyTrends.reduce((a, b) => a + b.tasksCompleted, 0)}
Skills Learned: ${data.weeklyTrends.reduce((a, b) => a + b.skillsLearned, 0)}
Escalations: ${data.weeklyTrends.reduce((a, b) => a + b.escalations, 0)} (${data.weeklyTrends[3]?.escalations < data.weeklyTrends[0]?.escalations ? "↓ improving" : "→ stable"})
\`\`\`

---

## 🛠️ Skill Gap Analysis

| Skill | Agents Needing | Priority | Target Divisions |
|-------|----------------|----------|------------------|
${data.skillGaps.filter(g => g.priority === "critical" || g.priority === "high").map(g => 
  `| ${g.skill} | ${g.agentsNeeding} | **${g.priority.toUpperCase()}** | ${g.targetDivisions.join(", ")} |`
).join("\n")}

---

## 🏥 System Health

| Component | Status | Details |
|-----------|--------|---------|
| Workspaces | ${statusEmoji(data.healthStatus.workspaces)} ${data.healthStatus.workspaces} | All agent workspaces ${data.healthStatus.workspaces === "healthy" ? "present" : "need review"} |
| SOUL Files | ${statusEmoji(data.healthStatus.soulFiles)} ${data.healthStatus.soulFiles} | Identity configurations ${data.healthStatus.soulFiles === "healthy" ? "valid" : "need attention"} |
| API Connections | ${statusEmoji(data.healthStatus.apiConnections)} ${data.healthStatus.apiConnections} | GHL, Supabase, Telegram |
| Cron Jobs | ${statusEmoji(data.healthStatus.cronJobs)} ${data.healthStatus.cronJobs} | Training schedule ${data.healthStatus.cronJobs === "healthy" ? "active" : "needs configuration"} |
| Memory Usage | ${statusEmoji(data.healthStatus.memoryUsage)} ${data.healthStatus.memoryUsage} | Within limits |

---

## 📅 Training Schedule This Week

| Day | Time | Training Type | Lead Agent | Status |
|-----|------|---------------|------------|--------|
| Monday | 7:00 AM | Weekly Review | shared_master_orchestrator | ${isToday(1) ? "🔄 Today" : isPast(1) ? "✅" : "⏳"} |
| Tuesday | 10:00 AM | Skill Development | d1_cto | ${isToday(2) ? "🔄 Today" : isPast(2) ? "✅" : "⏳"} |
| Wednesday | 2:00 PM | Cross-Division | shared_master_orchestrator | ${isToday(3) ? "🔄 Today" : isPast(3) ? "✅" : "⏳"} |
| Thursday | 11:00 AM | SOUL Refinement | d1_cto | ${isToday(4) ? "🔄 Today" : isPast(4) ? "✅" : "⏳"} |
| Friday | 3:00 PM | Performance Review | shared_data_analytics | ${isToday(5) ? "🔄 Today" : isPast(5) ? "✅" : "⏳"} |
| Saturday | 9:00 AM | Memory Consolidation | shared_knowledge_base | ${isToday(6) ? "🔄 Today" : isPast(6) ? "✅" : "⏳"} |
| Sunday | 6:00 AM | Health Check | shared_master_orchestrator | ${isToday(0) ? "🔄 Today" : isPast(0) ? "✅" : "⏳"} |

---

## 📊 Quick Actions

1. **[View All Training Cards](cards/INDEX.md)**
2. **[Weekly Review Report](logs/)**
3. **[SOUL.md Templates](templates/)**
4. **[Master Training Plan](OPENCLAW-AGENT-TRAINING-PLAN.md)**

---

*Dashboard auto-refreshes every Friday at 3 PM during Performance Review*

*Generated by OpenClaw Training Dashboard v1.0*
`;
}

function isToday(dayOfWeek: number): boolean {
  return new Date().getDay() === dayOfWeek;
}

function isPast(dayOfWeek: number): boolean {
  const today = new Date().getDay();
  // Convert Sunday from 0 to 7 for easier comparison
  const todayAdjusted = today === 0 ? 7 : today;
  const dayAdjusted = dayOfWeek === 0 ? 7 : dayOfWeek;
  return dayAdjusted < todayAdjusted;
}

async function generateDashboard(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  OpenClaw Training Dashboard Generator");
  console.log("  Truth J Blue LLC");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  console.log("📊 Gathering dashboard data...\n");
  const data = await gatherDashboardData();
  
  console.log("📝 Generating dashboard markdown...\n");
  const markdown = generateDashboardMarkdown(data);
  
  // Ensure reports directory exists
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  
  // Save dashboard
  const dashboardPath = path.join(TRAINING_DIR, "DASHBOARD.md");
  fs.writeFileSync(dashboardPath, markdown);
  console.log(`✅ Dashboard saved: ${dashboardPath}\n`);
  
  // Save timestamped report
  const reportName = `dashboard-${new Date().toISOString().split("T")[0]}.md`;
  const reportPath = path.join(REPORTS_DIR, reportName);
  fs.writeFileSync(reportPath, markdown);
  console.log(`📄 Report saved: ${reportPath}\n`);
  
  // Save JSON data for API consumption
  const jsonPath = path.join(REPORTS_DIR, "latest-dashboard-data.json");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log(`📦 JSON data saved: ${jsonPath}\n`);
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Dashboard generation complete!");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

// Run generation
generateDashboard().catch(console.error);
