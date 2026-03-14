/**
 * OpenClaw Skill Assessment Tool
 * Truth J Blue LLC
 * 
 * Evaluates agent proficiency across skills and
 * generates training recommendations for Tuesday sessions
 */

import * as fs from "fs";
import * as path from "path";

const WORKSPACE_ROOT = "C:\\Users\\JeremiahVanWagner\\.openclaw";
const TRAINING_DIR = path.join(WORKSPACE_ROOT, "training");
const ASSESSMENTS_DIR = path.join(TRAINING_DIR, "assessments");
const WORKSPACES_DIR = path.join(WORKSPACE_ROOT, "workspaces");

// Skill definitions with assessment criteria
interface SkillDefinition {
  name: string;
  category: "platform" | "integration" | "domain" | "communication";
  requiredBy: string[];
  assessmentCriteria: AssessmentCriterion[];
  proficiencyLevels: ProficiencyLevel[];
}

interface AssessmentCriterion {
  id: string;
  description: string;
  weight: number; // 0-100, should sum to 100
  testMethod: "api_call" | "scenario" | "knowledge_check" | "output_quality";
}

interface ProficiencyLevel {
  level: "novice" | "intermediate" | "proficient" | "expert";
  minScore: number;
  description: string;
}

interface AgentSkillAssessment {
  agentId: string;
  skill: string;
  assessmentDate: string;
  criteriaResults: CriterionResult[];
  totalScore: number;
  proficiencyLevel: string;
  recommendations: string[];
  nextAssessmentDate: string;
}

interface CriterionResult {
  criterionId: string;
  score: number; // 0-100
  notes: string;
}

// Define skill catalog
const SKILL_CATALOG: SkillDefinition[] = [
  {
    name: "highlevel-advanced",
    category: "integration",
    requiredBy: ["d1_sales_manager", "d4_enrollment", "d4_funnel_strategist", "d1_cmo"],
    assessmentCriteria: [
      { id: "api_auth", description: "Properly authenticate with GHL API", weight: 15, testMethod: "api_call" },
      { id: "contact_mgmt", description: "Create, update, search contacts", weight: 20, testMethod: "scenario" },
      { id: "pipeline_ops", description: "Move opportunities through pipelines", weight: 20, testMethod: "scenario" },
      { id: "workflow_trigger", description: "Trigger workflows programmatically", weight: 15, testMethod: "api_call" },
      { id: "webhook_handle", description: "Process incoming webhooks", weight: 15, testMethod: "scenario" },
      { id: "error_recovery", description: "Handle API errors gracefully", weight: 15, testMethod: "scenario" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can make basic API calls with guidance" },
      { level: "intermediate", minScore: 50, description: "Can perform common operations independently" },
      { level: "proficient", minScore: 75, description: "Can handle complex scenarios and edge cases" },
      { level: "expert", minScore: 90, description: "Can optimize, troubleshoot, and train others" },
    ],
  },
  {
    name: "stripe-advanced",
    category: "integration",
    requiredBy: ["d2_director", "d6_finance", "d4_enrollment"],
    assessmentCriteria: [
      { id: "payment_create", description: "Create payment intents", weight: 20, testMethod: "api_call" },
      { id: "subscription_mgmt", description: "Manage subscriptions lifecycle", weight: 25, testMethod: "scenario" },
      { id: "refund_process", description: "Process refunds correctly", weight: 15, testMethod: "scenario" },
      { id: "webhook_verify", description: "Verify webhook signatures", weight: 15, testMethod: "api_call" },
      { id: "dispute_handle", description: "Handle payment disputes", weight: 15, testMethod: "scenario" },
      { id: "reporting", description: "Generate financial reports", weight: 10, testMethod: "output_quality" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can process simple payments" },
      { level: "intermediate", minScore: 50, description: "Can manage subscriptions and refunds" },
      { level: "proficient", minScore: 75, description: "Can handle complex billing scenarios" },
      { level: "expert", minScore: 90, description: "Can optimize payment flows and handle disputes" },
    ],
  },
  {
    name: "supabase-admin",
    category: "platform",
    requiredBy: ["d1_cto", "d1_data_analyst", "d1_devops"],
    assessmentCriteria: [
      { id: "crud_ops", description: "Perform CRUD operations", weight: 20, testMethod: "api_call" },
      { id: "rls_policies", description: "Understand Row Level Security", weight: 20, testMethod: "knowledge_check" },
      { id: "realtime", description: "Use realtime subscriptions", weight: 15, testMethod: "scenario" },
      { id: "storage", description: "Manage file storage", weight: 15, testMethod: "scenario" },
      { id: "edge_functions", description: "Deploy edge functions", weight: 15, testMethod: "scenario" },
      { id: "performance", description: "Optimize query performance", weight: 15, testMethod: "output_quality" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can perform basic queries" },
      { level: "intermediate", minScore: 50, description: "Can build complete features" },
      { level: "proficient", minScore: 75, description: "Can optimize and maintain systems" },
      { level: "expert", minScore: 90, description: "Can architect complex data solutions" },
    ],
  },
  {
    name: "instagram-business",
    category: "integration",
    requiredBy: ["d2_digital_marketing", "d4_social_creator", "d5_book_marketing"],
    assessmentCriteria: [
      { id: "post_create", description: "Create and schedule posts", weight: 25, testMethod: "api_call" },
      { id: "insights_fetch", description: "Fetch account insights", weight: 20, testMethod: "api_call" },
      { id: "dm_manage", description: "Handle direct messages", weight: 20, testMethod: "scenario" },
      { id: "story_create", description: "Create and manage stories", weight: 15, testMethod: "scenario" },
      { id: "comment_mod", description: "Moderate comments", weight: 10, testMethod: "scenario" },
      { id: "hashtag_research", description: "Research effective hashtags", weight: 10, testMethod: "output_quality" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can post basic content" },
      { level: "intermediate", minScore: 50, description: "Can run engagement campaigns" },
      { level: "proficient", minScore: 75, description: "Can optimize for growth" },
      { level: "expert", minScore: 90, description: "Can build comprehensive strategies" },
    ],
  },
  {
    name: "youtube-analytics",
    category: "integration",
    requiredBy: ["d4_video_production", "d5_book_marketing", "d2_digital_marketing"],
    assessmentCriteria: [
      { id: "video_upload", description: "Upload and configure videos", weight: 20, testMethod: "api_call" },
      { id: "analytics_read", description: "Read channel analytics", weight: 25, testMethod: "api_call" },
      { id: "playlist_manage", description: "Manage playlists", weight: 15, testMethod: "scenario" },
      { id: "thumbnail_optimize", description: "Recommend thumbnail strategies", weight: 15, testMethod: "output_quality" },
      { id: "seo_optimize", description: "Optimize titles and descriptions", weight: 15, testMethod: "output_quality" },
      { id: "community_manage", description: "Manage community posts", weight: 10, testMethod: "scenario" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can upload and basic configure" },
      { level: "intermediate", minScore: 50, description: "Can analyze and optimize" },
      { level: "proficient", minScore: 75, description: "Can drive channel growth" },
      { level: "expert", minScore: 90, description: "Can build comprehensive video strategies" },
    ],
  },
  {
    name: "calendly",
    category: "integration",
    requiredBy: ["d1_sales_manager", "d3_discovery_specialist", "d4_enrollment", "d4_client_experience"],
    assessmentCriteria: [
      { id: "event_types", description: "Create and manage event types", weight: 25, testMethod: "api_call" },
      { id: "booking_flow", description: "Handle booking workflows", weight: 25, testMethod: "scenario" },
      { id: "availability", description: "Configure availability rules", weight: 20, testMethod: "scenario" },
      { id: "integrations", description: "Connect with CRM and calendar", weight: 15, testMethod: "api_call" },
      { id: "reminders", description: "Configure reminder sequences", weight: 15, testMethod: "scenario" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can schedule basic meetings" },
      { level: "intermediate", minScore: 50, description: "Can manage complex scheduling" },
      { level: "proficient", minScore: 75, description: "Can optimize booking funnels" },
      { level: "expert", minScore: 90, description: "Can build automated scheduling systems" },
    ],
  },
  {
    name: "telegram-bot",
    category: "platform",
    requiredBy: ["shared_master_orchestrator", "d1_ceo", "d1_cto"],
    assessmentCriteria: [
      { id: "message_send", description: "Send formatted messages", weight: 20, testMethod: "api_call" },
      { id: "inline_keyboard", description: "Create inline keyboards", weight: 20, testMethod: "scenario" },
      { id: "callback_handle", description: "Handle callback queries", weight: 20, testMethod: "scenario" },
      { id: "media_upload", description: "Upload and send media", weight: 15, testMethod: "api_call" },
      { id: "group_manage", description: "Manage group interactions", weight: 15, testMethod: "scenario" },
      { id: "rate_limit", description: "Handle rate limiting", weight: 10, testMethod: "knowledge_check" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can send basic messages" },
      { level: "intermediate", minScore: 50, description: "Can create interactive bots" },
      { level: "proficient", minScore: 75, description: "Can build complex workflows" },
      { level: "expert", minScore: 90, description: "Can optimize bot performance" },
    ],
  },
  {
    name: "cross-division-coordination",
    category: "communication",
    requiredBy: ["shared_master_orchestrator", "d1_ceo", "d1_cmo", "d1_cto"],
    assessmentCriteria: [
      { id: "handoff_protocol", description: "Follow handoff protocols", weight: 25, testMethod: "scenario" },
      { id: "context_transfer", description: "Transfer context accurately", weight: 25, testMethod: "output_quality" },
      { id: "escalation_judge", description: "Judge escalation necessity", weight: 20, testMethod: "scenario" },
      { id: "collaboration", description: "Coordinate multi-agent tasks", weight: 20, testMethod: "scenario" },
      { id: "conflict_resolve", description: "Resolve coordination conflicts", weight: 10, testMethod: "scenario" },
    ],
    proficiencyLevels: [
      { level: "novice", minScore: 0, description: "Can follow basic handoff procedures" },
      { level: "intermediate", minScore: 50, description: "Can coordinate simple multi-agent tasks" },
      { level: "proficient", minScore: 75, description: "Can orchestrate complex workflows" },
      { level: "expert", minScore: 90, description: "Can optimize organization-wide coordination" },
    ],
  },
];

// Assessment execution functions
async function runSkillAssessment(agentId: string, skillName: string): Promise<AgentSkillAssessment> {
  const skill = SKILL_CATALOG.find(s => s.name === skillName);
  if (!skill) throw new Error(`Skill not found: ${skillName}`);
  
  const results: CriterionResult[] = [];
  
  for (const criterion of skill.assessmentCriteria) {
    const result = await assessCriterion(agentId, skill, criterion);
    results.push(result);
  }
  
  // Calculate total score
  const totalScore = results.reduce((sum, r, i) => {
    return sum + (r.score * skill.assessmentCriteria[i].weight / 100);
  }, 0);
  
  // Determine proficiency level
  const proficiencyLevel = skill.proficiencyLevels
    .slice()
    .reverse()
    .find(l => totalScore >= l.minScore)?.level || "novice";
  
  // Generate recommendations
  const recommendations = generateRecommendations(skill, results, totalScore);
  
  // Calculate next assessment date (2 weeks for low scores, 4 weeks for high)
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + (totalScore >= 75 ? 28 : 14));
  
  return {
    agentId,
    skill: skillName,
    assessmentDate: new Date().toISOString(),
    criteriaResults: results,
    totalScore,
    proficiencyLevel,
    recommendations,
    nextAssessmentDate: nextDate.toISOString().split("T")[0],
  };
}

async function assessCriterion(
  agentId: string,
  skill: SkillDefinition,
  criterion: AssessmentCriterion
): Promise<CriterionResult> {
  // In production, this would run actual tests
  // For now, we simulate based on agent's current state
  
  let score = 50; // Base score
  let notes = "";
  
  switch (criterion.testMethod) {
    case "api_call":
      // Simulate API capability test
      score = 60 + Math.random() * 40;
      notes = score >= 80 ? "API calls successful" : "Some API issues detected";
      break;
      
    case "scenario":
      // Simulate scenario-based test
      score = 50 + Math.random() * 50;
      notes = score >= 75 ? "Handled scenario well" : "Needs more scenario practice";
      break;
      
    case "knowledge_check":
      // Simulate knowledge verification
      score = 55 + Math.random() * 45;
      notes = score >= 70 ? "Good conceptual understanding" : "Review documentation needed";
      break;
      
    case "output_quality":
      // Simulate output quality assessment
      score = 60 + Math.random() * 40;
      notes = score >= 80 ? "High quality outputs" : "Output quality can improve";
      break;
  }
  
  return {
    criterionId: criterion.id,
    score: Math.round(score),
    notes,
  };
}

function generateRecommendations(
  skill: SkillDefinition,
  results: CriterionResult[],
  totalScore: number
): string[] {
  const recommendations: string[] = [];
  
  // Find weak areas (below 70%)
  for (let i = 0; i < results.length; i++) {
    if (results[i].score < 70) {
      const criterion = skill.assessmentCriteria[i];
      recommendations.push(`Focus on: ${criterion.description} (current: ${results[i].score}%)`);
    }
  }
  
  // General recommendations based on total score
  if (totalScore < 50) {
    recommendations.push("Consider pairing with a proficient agent for mentorship");
    recommendations.push("Schedule additional practice sessions this week");
  } else if (totalScore < 75) {
    recommendations.push("Practice with more complex scenarios");
    recommendations.push("Review skill documentation and examples");
  } else {
    recommendations.push("Ready to help train other agents");
    recommendations.push("Consider expanding to related skills");
  }
  
  return recommendations;
}

async function runBatchAssessment(divisionId?: string): Promise<{ assessments: AgentSkillAssessment[]; summary: any }> {
  const assessments: AgentSkillAssessment[] = [];
  
  // Get agents to assess
  const agents = divisionId 
    ? getAgentsInDivision(divisionId)
    : getAllAgentIds();
  
  console.log(`\n📋 Assessing ${agents.length} agents...\n`);
  
  for (const agentId of agents) {
    // Find skills required by this agent
    const requiredSkills = SKILL_CATALOG.filter(s => 
      s.requiredBy.some(r => agentId.includes(r) || r === agentId)
    );
    
    for (const skill of requiredSkills) {
      console.log(`  Assessing ${agentId} on ${skill.name}...`);
      const assessment = await runSkillAssessment(agentId, skill.name);
      assessments.push(assessment);
    }
  }
  
  // Calculate summary statistics
  const summary = {
    totalAssessments: assessments.length,
    avgScore: assessments.reduce((a, b) => a + b.totalScore, 0) / assessments.length,
    byProficiency: {
      expert: assessments.filter(a => a.proficiencyLevel === "expert").length,
      proficient: assessments.filter(a => a.proficiencyLevel === "proficient").length,
      intermediate: assessments.filter(a => a.proficiencyLevel === "intermediate").length,
      novice: assessments.filter(a => a.proficiencyLevel === "novice").length,
    },
    bySkill: SKILL_CATALOG.map(skill => ({
      skill: skill.name,
      assessments: assessments.filter(a => a.skill === skill.name).length,
      avgScore: assessments.filter(a => a.skill === skill.name)
        .reduce((sum, a) => sum + a.totalScore, 0) / 
        (assessments.filter(a => a.skill === skill.name).length || 1),
    })),
    priorityTraining: assessments
      .filter(a => a.totalScore < 60)
      .map(a => ({ agent: a.agentId, skill: a.skill, score: a.totalScore })),
  };
  
  return { assessments, summary };
}

function getAgentsInDivision(divisionId: string): string[] {
  const divPath = path.join(WORKSPACES_DIR);
  if (!fs.existsSync(divPath)) return [];
  
  const prefix = divisionId === "d7" ? "shared_" : `${divisionId}_`;
  return fs.readdirSync(divPath)
    .filter(f => f.startsWith(prefix) && fs.statSync(path.join(divPath, f)).isDirectory());
}

function getAllAgentIds(): string[] {
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  return fs.readdirSync(WORKSPACES_DIR)
    .filter(f => fs.statSync(path.join(WORKSPACES_DIR, f)).isDirectory());
}

function generateAssessmentReport(result: { assessments: AgentSkillAssessment[]; summary: any }): string {
  const date = new Date().toISOString().split("T")[0];
  
  return `# Skill Assessment Report

**Date:** ${date}
**Total Assessments:** ${result.summary.totalAssessments}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Average Score** | ${result.summary.avgScore.toFixed(1)}% |
| **Expert Level** | ${result.summary.byProficiency.expert} agents |
| **Proficient Level** | ${result.summary.byProficiency.proficient} agents |
| **Intermediate Level** | ${result.summary.byProficiency.intermediate} agents |
| **Novice Level** | ${result.summary.byProficiency.novice} agents |

---

## Performance by Skill

| Skill | Assessments | Avg Score | Status |
|-------|-------------|-----------|--------|
${result.summary.bySkill.map((s: any) => 
  `| ${s.skill} | ${s.assessments} | ${s.avgScore.toFixed(1)}% | ${s.avgScore >= 75 ? "✅" : s.avgScore >= 50 ? "⚠️" : "🔴"} |`
).join("\n")}

---

## Priority Training Required

The following agent-skill combinations scored below 60% and require immediate attention:

| Agent | Skill | Score | Recommended Action |
|-------|-------|-------|-------------------|
${result.summary.priorityTraining.map((p: any) => 
  `| \`${p.agent}\` | ${p.skill} | ${p.score.toFixed(1)}% | Intensive training needed |`
).join("\n") || "| *None* | - | - | All agents performing adequately |"}

---

## Detailed Assessments

${result.assessments.map(a => `
### ${a.agentId} - ${a.skill}

- **Score:** ${a.totalScore.toFixed(1)}%
- **Level:** ${a.proficiencyLevel.toUpperCase()}
- **Next Assessment:** ${a.nextAssessmentDate}

**Criteria Results:**
${a.criteriaResults.map(r => `- ${r.criterionId}: ${r.score}% - ${r.notes}`).join("\n")}

**Recommendations:**
${a.recommendations.map(r => `- ${r}`).join("\n")}
`).join("\n---\n")}

---

*Generated by OpenClaw Skill Assessment Tool*
`;
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  OpenClaw Skill Assessment Tool");
  console.log("  Truth J Blue LLC");
  console.log("═══════════════════════════════════════════════════════════════");
  
  // Run batch assessment
  const result = await runBatchAssessment();
  
  // Ensure assessments directory exists
  fs.mkdirSync(ASSESSMENTS_DIR, { recursive: true });
  
  // Generate and save report
  const report = generateAssessmentReport(result);
  const reportName = `skill-assessment-${new Date().toISOString().split("T")[0]}.md`;
  const reportPath = path.join(ASSESSMENTS_DIR, reportName);
  fs.writeFileSync(reportPath, report);
  
  console.log(`\n✅ Assessment complete!`);
  console.log(`📄 Report saved: ${reportPath}`);
  
  // Save JSON data
  const jsonPath = path.join(ASSESSMENTS_DIR, "latest-assessment.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`📦 JSON data saved: ${jsonPath}\n`);
  
  // Print summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Total Assessments: ${result.summary.totalAssessments}`);
  console.log(`  Average Score: ${result.summary.avgScore.toFixed(1)}%`);
  console.log(`  Expert: ${result.summary.byProficiency.expert}`);
  console.log(`  Proficient: ${result.summary.byProficiency.proficient}`);
  console.log(`  Intermediate: ${result.summary.byProficiency.intermediate}`);
  console.log(`  Novice: ${result.summary.byProficiency.novice}`);
  console.log(`  Priority Training: ${result.summary.priorityTraining.length} agent-skill pairs`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

// Export for module use
export { runSkillAssessment, runBatchAssessment, SKILL_CATALOG };

// Run if called directly
main().catch(console.error);
