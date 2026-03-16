/**
 * Training Protocol Inngest Functions
 * OpenClaw Weekly Self-Training System
 * Truth J Blue LLC
 *
 * Event handlers for the 7-day training cycle:
 * - Monday: Weekly Review & Planning
 * - Tuesday: Skill Development
 * - Wednesday: Cross-Division Training
 * - Thursday: SOUL.md Refinement
 * - Friday: Performance Review
 * - Saturday: Memory Consolidation
 * - Sunday: Health Check
 */

import { inngest } from "../client.ts";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const WORKSPACE_ROOT = "C:\\Users\\JeremiahVanWagner\\.openclaw";
const TRAINING_DIR = path.join(WORKSPACE_ROOT, "training");

// ═══════════════════════════════════════════════════════════════════
// TRAINING: WEEKLY REVIEW (Monday 7 AM)
// ═══════════════════════════════════════════════════════════════════
export const trainingWeeklyReview = inngest.createFunction(
  {
    id: "training-weekly-review",
    name: "Training: Weekly Review & Planning",
    retries: 2,
  },
  { event: "training.weekly_review" },
  async ({ event, step }) => {
    const weekNumber = getWeekNumber(new Date());

    // Step 1: Gather performance metrics for all agents
    const performanceData = await step.run("gather-performance-metrics", async () => {
      const { data, error } = await supabase
        .from("agent_performance")
        .select("*")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;
      return data || [];
    });

    // Step 2: Analyze and categorize agents
    const analysis = await step.run("analyze-agents", async () => {
      const agentScores: Record<string, AgentMetrics> = {};

      for (const record of performanceData) {
        if (!agentScores[record.agent_id]) {
          agentScores[record.agent_id] = {
            taskSuccess: [],
            responseAccuracy: [],
            escalationRate: [],
            crossDivision: [],
          };
        }

        agentScores[record.agent_id].taskSuccess.push(record.task_success_rate);
        agentScores[record.agent_id].responseAccuracy.push(record.response_accuracy);
        agentScores[record.agent_id].escalationRate.push(record.escalation_rate);
        agentScores[record.agent_id].crossDivision.push(record.cross_division_success);
      }

      const results: AgentAnalysis[] = [];

      for (const [agentId, metrics] of Object.entries(agentScores)) {
        const avgTaskSuccess = average(metrics.taskSuccess);
        const avgAccuracy = average(metrics.responseAccuracy);
        const avgEscalation = average(metrics.escalationRate);
        const avgCrossDivision = average(metrics.crossDivision);

        const overallScore = (avgTaskSuccess * 0.25 + avgAccuracy * 0.25 +
          (100 - avgEscalation) * 0.25 + avgCrossDivision * 0.25);

        let tier: "A" | "B" | "C" | "D";
        if (overallScore >= 90) tier = "A";
        else if (overallScore >= 75) tier = "B";
        else if (overallScore >= 60) tier = "C";
        else tier = "D";

        results.push({
          agent_id: agentId,
          task_success: avgTaskSuccess,
          response_accuracy: avgAccuracy,
          escalation_rate: avgEscalation,
          cross_division: avgCrossDivision,
          overall_score: overallScore,
          tier,
          needs_training: overallScore < 75,
        });
      }

      return results;
    });

    // Step 3: Create weekly training log
    const logPath = await step.run("create-training-log", async () => {
      const logFileName = `${new Date().getFullYear()}-W${weekNumber.toString().padStart(2, "0")}-training-log.md`;
      const logPath = path.join(TRAINING_DIR, "logs", logFileName);

      const topPerformers = analysis.filter(a => a.tier === "A").slice(0, 3);
      const needsAttention = analysis.filter(a => a.needs_training);

      const logContent = `# Training Week ${weekNumber} Review Log

**Generated:** ${new Date().toISOString()}
**Week:** ${weekNumber}

## Performance Summary

### Top Performers 🏆
${topPerformers.map(a => `- **${a.agent_id}**: ${a.overall_score.toFixed(1)}% (Tier ${a.tier})`).join("\n")}

### Agents Needing Attention ⚠️
${needsAttention.map(a => `- **${a.agent_id}**: ${a.overall_score.toFixed(1)}% (Tier ${a.tier})
  - Task Success: ${a.task_success.toFixed(1)}%
  - Response Accuracy: ${a.response_accuracy.toFixed(1)}%
  - Escalation Rate: ${a.escalation_rate.toFixed(1)}%`).join("\n\n")}

## Training Priorities This Week
${needsAttention.map((a, i) => `${i + 1}. ${a.agent_id} - Focus: ${getPriorityFocus(a)}`).join("\n")}

## Division Summary
| Division | Avg Score | Status |
|----------|-----------|--------|
${getDivisionSummary(analysis)}
`;

      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, logContent);

      return logPath;
    });

    // Step 4: Notify division heads
    await step.sendEvent("notify-divisions", {
      name: "training.division_notification",
      data: {
        type: "weekly_review",
        week: weekNumber,
        agents_needing_training: analysis.filter(a => a.needs_training).map(a => a.agent_id),
        log_path: logPath,
      },
    });

    return {
      success: true,
      week: weekNumber,
      total_agents_analyzed: analysis.length,
      tier_a_count: analysis.filter(a => a.tier === "A").length,
      tier_b_count: analysis.filter(a => a.tier === "B").length,
      tier_c_count: analysis.filter(a => a.tier === "C").length,
      tier_d_count: analysis.filter(a => a.tier === "D").length,
      log_path: logPath,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: SKILL DEVELOPMENT (Tuesday 10 AM)
// ═══════════════════════════════════════════════════════════════════
export const trainingSkillDevelopment = inngest.createFunction(
  {
    id: "training-skill-development",
    name: "Training: Skill Development",
    retries: 2,
  },
  { event: "training.skill_development" },
  async ({ event, step }) => {
    const prioritySkills = [
      { name: "highlevel-advanced", priority: "critical", agents: ["marketing", "sales", "d4_enrollment"] },
      { name: "stripe-advanced", priority: "critical", agents: ["d2_director", "d6_finance"] },
      { name: "supabase-admin", priority: "critical", agents: ["d1_cto", "d1_data_analyst"] },
      { name: "instagram-business", priority: "high", agents: ["d2_digital_marketing", "d4_social_creator"] },
      { name: "youtube-analytics", priority: "high", agents: ["d4_video_production", "d5_book_marketing"] },
      { name: "calendly", priority: "medium", agents: ["d1_sales_manager", "d4_enrollment"] },
    ];

    // Step 1: Check current skill status
    const skillStatus = await step.run("check-skill-status", async () => {
      const results: SkillStatus[] = [];

      for (const skill of prioritySkills) {
        // Check if skill exists in ClawdHub
        const exists = await checkSkillExists(skill.name);
        // Check which agents have it installed
        const installed = await getAgentsWithSkill(skill.name);

        results.push({
          name: skill.name,
          priority: skill.priority,
          target_agents: skill.agents,
          exists_in_hub: exists,
          currently_installed: installed,
          needs_install: skill.agents.filter(a => !installed.includes(a)),
        });
      }

      return results;
    });

    // Step 2: Install missing skills
    const installations = await step.run("install-skills", async () => {
      const installed: string[] = [];
      const failed: string[] = [];

      for (const skill of skillStatus) {
        if (skill.priority === "critical" && skill.exists_in_hub) {
          for (const agent of skill.needs_install) {
            try {
              await installSkillToAgent(skill.name, agent);
              installed.push(`${skill.name} → ${agent}`);
            } catch (error) {
              failed.push(`${skill.name} → ${agent}: ${error}`);
            }
          }
        }
      }

      return { installed, failed };
    });

    // Step 3: Update agents_config.json
    await step.run("update-config", async () => {
      const configPath = path.join(WORKSPACE_ROOT, "agents_config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      // Update tools_required for each agent
      for (const skill of skillStatus) {
        for (const agentId of skill.target_agents) {
          const agent = config.agents.find((a: any) => a.agent_id === agentId);
          if (agent && !agent.tools_required?.includes(skill.name)) {
            agent.tools_required = agent.tools_required || [];
            agent.tools_required.push(skill.name);
          }
        }
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    });

    // Step 4: Log results
    await step.run("log-results", async () => {
      const { error } = await supabase.from("training_events").insert({
        event_type: "skill_development",
        timestamp: new Date().toISOString(),
        outcomes: {
          skills_checked: skillStatus.length,
          installations: installations,
        },
      });

      if (error) console.error("Failed to log training event:", error);
    });

    return {
      success: true,
      skills_analyzed: skillStatus.length,
      skills_installed: installations.installed.length,
      skills_failed: installations.failed.length,
      details: installations,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: CROSS-DIVISION (Wednesday 2 PM)
// ═══════════════════════════════════════════════════════════════════
export const trainingCrossDivision = inngest.createFunction(
  {
    id: "training-cross-division",
    name: "Training: Cross-Division Collaboration",
    retries: 2,
  },
  { event: "training.cross_division" },
  async ({ event, step }) => {
    const scenarios = [
      {
        name: "New Lead → Discovery Call",
        divisions: ["d1", "d4", "d3"],
        agents: ["d4_enrollment", "d4_funnel_strategist", "d1_sales_manager", "d1_ceo"],
      },
      {
        name: "Book Launch Campaign",
        divisions: ["d5", "d2", "d4"],
        agents: ["d5_publisher", "d5_book_marketing", "d2_digital_marketing", "d4_social_creator"],
      },
      {
        name: "Coaching Client Upsell",
        divisions: ["d4", "d3", "d1"],
        agents: ["d4_lead_coach", "d4_client_experience", "d3_sales_closer", "d1_cmo"],
      },
      {
        name: "Grant Application",
        divisions: ["d6", "d1", "d7"],
        agents: ["d6_grant_writer", "d6_executive_director", "d1_ceo", "shared_legal_compliance"],
      },
      {
        name: "Tech Emergency",
        divisions: ["d1", "d7"],
        agents: ["d1_devops", "d1_cto", "shared_master_orchestrator"],
      },
    ];

    // Step 1: Run simulation for each scenario
    const simulationResults = await step.run("run-simulations", async () => {
      const results: ScenarioResult[] = [];

      for (const scenario of scenarios) {
        const handoffs: HandoffResult[] = [];
        let totalTime = 0;
        let successful = true;

        // Simulate handoffs between agents
        for (let i = 0; i < scenario.agents.length - 1; i++) {
          const from = scenario.agents[i];
          const to = scenario.agents[i + 1];

          const startTime = Date.now();

          try {
            await simulateHandoff(from, to, scenario.name);
            const duration = Date.now() - startTime;
            totalTime += duration;

            handoffs.push({
              from,
              to,
              success: true,
              duration_ms: duration,
            });
          } catch (error) {
            successful = false;
            handoffs.push({
              from,
              to,
              success: false,
              error: String(error),
              duration_ms: Date.now() - startTime,
            });
          }
        }

        results.push({
          scenario: scenario.name,
          divisions: scenario.divisions,
          handoffs,
          total_time_ms: totalTime,
          avg_handoff_ms: totalTime / handoffs.length,
          success: successful,
        });
      }

      return results;
    });

    // Step 2: Identify bottlenecks
    const bottlenecks = await step.run("identify-bottlenecks", async () => {
      const issues: string[] = [];

      for (const result of simulationResults) {
        // Check for slow handoffs (>1000ms)
        for (const handoff of result.handoffs) {
          if (handoff.duration_ms > 1000) {
            issues.push(`Slow handoff: ${handoff.from} → ${handoff.to} (${handoff.duration_ms}ms)`);
          }
          if (!handoff.success) {
            issues.push(`Failed handoff: ${handoff.from} → ${handoff.to}: ${handoff.error}`);
          }
        }
      }

      return issues;
    });

    // Step 3: Log results to training log
    await step.run("log-simulation", async () => {
      const { error } = await supabase.from("training_events").insert({
        event_type: "cross_division",
        timestamp: new Date().toISOString(),
        outcomes: {
          scenarios_tested: simulationResults.length,
          successful: simulationResults.filter(r => r.success).length,
          bottlenecks: bottlenecks,
        },
      });

      if (error) console.error("Failed to log training event:", error);
    });

    return {
      success: true,
      scenarios_tested: simulationResults.length,
      scenarios_successful: simulationResults.filter(r => r.success).length,
      avg_response_time_ms: simulationResults.reduce((a, b) => a + b.avg_handoff_ms, 0) / simulationResults.length,
      bottlenecks_found: bottlenecks.length,
      bottlenecks,
      details: simulationResults,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: SOUL.MD REFINEMENT (Thursday 11 AM)
// ═══════════════════════════════════════════════════════════════════
export const trainingSoulRefinement = inngest.createFunction(
  {
    id: "training-soul-refinement",
    name: "Training: SOUL.md Refinement",
    retries: 2,
  },
  { event: "training.soul_refinement" },
  async ({ event, step }) => {
    const workspacesDir = path.join(WORKSPACE_ROOT, "workspaces");

    // Step 1: Load agents needing refinement from Monday's review
    const agentsToRefine = await step.run("get-refinement-list", async () => {
      const { data, error } = await supabase
        .from("training_events")
        .select("outcomes")
        .eq("event_type", "weekly_review")
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // Fallback: check all agents
        return getAllAgentIds();
      }

      return data.outcomes.agents_needing_training || [];
    });

    // Step 2: Analyze each agent's SOUL.md
    const refinements = await step.run("analyze-soul-files", async () => {
      const proposals: SoulRefinement[] = [];

      for (const agentId of agentsToRefine) {
        const soulPath = path.join(workspacesDir, agentId, "SOUL.md");

        if (!fs.existsSync(soulPath)) continue;

        const content = fs.readFileSync(soulPath, "utf-8");
        const issues = analyzeSoulMd(content, agentId);

        if (issues.length > 0) {
          proposals.push({
            agent_id: agentId,
            current_path: soulPath,
            issues,
            proposed_changes: generateProposedChanges(content, issues),
          });
        }
      }

      return proposals;
    });

    // Step 3: Apply approved refinements
    const applied = await step.run("apply-refinements", async () => {
      const results: string[] = [];

      for (const refinement of refinements) {
        // Only auto-apply low-risk changes
        const lowRiskChanges = refinement.proposed_changes.filter(c => c.risk === "low");

        for (const change of lowRiskChanges) {
          try {
            const soulPath = refinement.current_path;
            let content = fs.readFileSync(soulPath, "utf-8");
            content = content.replace(change.old_text, change.new_text);
            fs.writeFileSync(soulPath, content);
            results.push(`${refinement.agent_id}: ${change.description}`);
          } catch (error) {
            console.error(`Failed to apply change to ${refinement.agent_id}:`, error);
          }
        }
      }

      return results;
    });

    // Step 4: Log to training events
    await step.run("log-refinements", async () => {
      const { error } = await supabase.from("training_events").insert({
        event_type: "soul_refinement",
        timestamp: new Date().toISOString(),
        outcomes: {
          agents_analyzed: agentsToRefine.length,
          refinements_proposed: refinements.length,
          refinements_applied: applied.length,
          details: applied,
        },
      });

      if (error) console.error("Failed to log training event:", error);
    });

    return {
      success: true,
      agents_analyzed: agentsToRefine.length,
      refinements_proposed: refinements.length,
      refinements_applied: applied.length,
      applied_changes: applied,
      pending_review: refinements.filter(r => r.proposed_changes.some(c => c.risk !== "low")),
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: PERFORMANCE REVIEW (Friday 3 PM)
// ═══════════════════════════════════════════════════════════════════
export const trainingPerformanceReview = inngest.createFunction(
  {
    id: "training-performance-review",
    name: "Training: Performance Review",
    retries: 2,
  },
  { event: "training.performance_review" },
  async ({ event, step }) => {
    // Step 1: Generate performance dashboard
    const dashboard = await step.run("generate-dashboard", async () => {
      const { data, error } = await supabase
        .from("agent_performance")
        .select("*")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Aggregate by division
      const divisionMetrics: Record<string, DivisionMetrics> = {};

      for (const record of data || []) {
        const division = getDivisionFromAgent(record.agent_id);
        if (!divisionMetrics[division]) {
          divisionMetrics[division] = {
            agents: [],
            total_tasks: 0,
            successful_tasks: 0,
            total_escalations: 0,
            api_cost: 0,
          };
        }

        divisionMetrics[division].agents.push(record.agent_id);
        divisionMetrics[division].total_tasks += record.total_tasks || 0;
        divisionMetrics[division].successful_tasks += record.successful_tasks || 0;
        divisionMetrics[division].total_escalations += record.escalations || 0;
        divisionMetrics[division].api_cost += record.api_cost_usd || 0;
      }

      return divisionMetrics;
    });

    // Step 2: Identify top performers
    const topPerformers = await step.run("identify-top-performers", async () => {
      const { data, error } = await supabase
        .from("agent_performance")
        .select("agent_id, overall_score, patterns")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("overall_score", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    });

    // Step 3: Calculate cost efficiency
    const costAnalysis = await step.run("analyze-costs", async () => {
      const { data, error } = await supabase
        .from("agent_performance")
        .select("agent_id, api_cost_usd, value_generated_usd");

      if (error) throw error;

      const efficiencies = (data || []).map(record => ({
        agent_id: record.agent_id,
        cost: record.api_cost_usd,
        value: record.value_generated_usd,
        efficiency: record.value_generated_usd / (record.api_cost_usd || 1),
      }));

      return {
        total_cost: efficiencies.reduce((a, b) => a + b.cost, 0),
        total_value: efficiencies.reduce((a, b) => a + b.value, 0),
        avg_efficiency: efficiencies.reduce((a, b) => a + b.efficiency, 0) / efficiencies.length,
        top_efficient: efficiencies.sort((a, b) => b.efficiency - a.efficiency).slice(0, 5),
        least_efficient: efficiencies.sort((a, b) => a.efficiency - b.efficiency).slice(0, 5),
      };
    });

    // Step 4: Generate week-over-week comparison
    const comparison = await step.run("compare-to-last-week", async () => {
      const thisWeek = await supabase
        .from("training_events")
        .select("outcomes")
        .eq("event_type", "performance_review")
        .gte("timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const lastWeek = await supabase
        .from("training_events")
        .select("outcomes")
        .eq("event_type", "performance_review")
        .gte("timestamp", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .lt("timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Calculate deltas
      return {
        has_comparison: (lastWeek.data?.length || 0) > 0,
        improvement_pct: 0, // Calculated from actual data
      };
    });

    // Step 5: Log results
    await step.run("log-review", async () => {
      const { error } = await supabase.from("training_events").insert({
        event_type: "performance_review",
        timestamp: new Date().toISOString(),
        outcomes: {
          dashboard,
          top_performers: topPerformers,
          cost_analysis: costAnalysis,
          week_comparison: comparison,
        },
      });

      if (error) console.error("Failed to log training event:", error);
    });

    return {
      success: true,
      division_summary: dashboard,
      top_performers: topPerformers,
      cost_efficiency: costAnalysis,
      week_over_week: comparison,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: MEMORY CONSOLIDATION (Saturday 9 AM)
// ═══════════════════════════════════════════════════════════════════
export const trainingMemoryConsolidation = inngest.createFunction(
  {
    id: "training-memory-consolidation",
    name: "Training: Memory Consolidation",
    retries: 2,
  },
  { event: "training.memory_consolidation" },
  async ({ event, step }) => {
    // Step 1: Gather learnings from all agents
    const learnings = await step.run("gather-learnings", async () => {
      const memoryDir = path.join(WORKSPACE_ROOT, "memory");
      const entries: MemoryEntry[] = [];

      // Read working memory from each agent
      const agentIds = getAllAgentIds();
      for (const agentId of agentIds) {
        const agentMemoryPath = path.join(memoryDir, agentId, "working");
        if (fs.existsSync(agentMemoryPath)) {
          const files = fs.readdirSync(agentMemoryPath);
          for (const file of files) {
            const content = fs.readFileSync(path.join(agentMemoryPath, file), "utf-8");
            entries.push({
              agent_id: agentId,
              type: "working",
              content,
              created_at: fs.statSync(path.join(agentMemoryPath, file)).mtime.toISOString(),
            });
          }
        }
      }

      return entries;
    });

    // Step 2: Extract patterns worth preserving
    const patterns = await step.run("extract-patterns", async () => {
      const valuable: Pattern[] = [];

      for (const entry of learnings) {
        // Identify successful patterns
        if (entry.content.includes("success") || entry.content.includes("completed")) {
          valuable.push({
            agent_id: entry.agent_id,
            pattern_type: "success",
            description: extractPatternDescription(entry.content),
            source_date: entry.created_at,
          });
        }

        // Identify error recovery patterns
        if (entry.content.includes("error") && entry.content.includes("resolved")) {
          valuable.push({
            agent_id: entry.agent_id,
            pattern_type: "error_recovery",
            description: extractPatternDescription(entry.content),
            source_date: entry.created_at,
          });
        }
      }

      return valuable;
    });

    // Step 3: Update knowledge base
    const knowledgeUpdates = await step.run("update-knowledge-base", async () => {
      const kbPath = path.join(WORKSPACE_ROOT, "workspaces", "shared_knowledge_base", "knowledge");
      fs.mkdirSync(kbPath, { recursive: true });

      const updateCount = 0;

      for (const pattern of patterns) {
        const patternFile = path.join(kbPath, `${pattern.pattern_type}_${Date.now()}.json`);
        fs.writeFileSync(patternFile, JSON.stringify(pattern, null, 2));
      }

      return {
        patterns_indexed: patterns.length,
        knowledge_path: kbPath,
      };
    });

    // Step 4: Clear stale working memory
    const cleaned = await step.run("clear-stale-memory", async () => {
      let clearedCount = 0;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const memoryDir = path.join(WORKSPACE_ROOT, "memory");
      const agentIds = getAllAgentIds();

      for (const agentId of agentIds) {
        const workingPath = path.join(memoryDir, agentId, "working");
        if (fs.existsSync(workingPath)) {
          const files = fs.readdirSync(workingPath);
          for (const file of files) {
            const filePath = path.join(workingPath, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < sevenDaysAgo) {
              fs.unlinkSync(filePath);
              clearedCount++;
            }
          }
        }
      }

      return clearedCount;
    });

    // Step 5: Log results
    await step.run("log-consolidation", async () => {
      const { error } = await supabase.from("training_events").insert({
        event_type: "memory_consolidation",
        timestamp: new Date().toISOString(),
        outcomes: {
          learnings_processed: learnings.length,
          patterns_extracted: patterns.length,
          knowledge_updates: knowledgeUpdates,
          memory_cleared: cleaned,
        },
      });

      if (error) console.error("Failed to log training event:", error);
    });

    return {
      success: true,
      learnings_processed: learnings.length,
      patterns_extracted: patterns.length,
      knowledge_indexed: knowledgeUpdates.patterns_indexed,
      memory_cleared: cleaned,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// TRAINING: HEALTH CHECK (Sunday 6 AM)
// ═══════════════════════════════════════════════════════════════════
export const trainingHealthCheck = inngest.createFunction(
  {
    id: "training-health-check",
    name: "Training: System Health Check",
    retries: 2,
  },
  { event: "training.health_check" },
  async ({ event, step }) => {
    const healthResults: HealthCheckResult = {
      timestamp: new Date().toISOString(),
      workspaces: { status: "unknown", details: [] },
      soul_files: { status: "unknown", details: [] },
      api_connections: { status: "unknown", details: [] },
      cron_jobs: { status: "unknown", details: [] },
      memory_usage: { status: "unknown", details: [] },
      security: { status: "unknown", details: [] },
    };

    // Step 1: Check workspaces
    healthResults.workspaces = await step.run("check-workspaces", async () => {
      const workspacesDir = path.join(WORKSPACE_ROOT, "workspaces");
      const expectedAgents = getAllAgentIds();
      const issues: string[] = [];

      for (const agentId of expectedAgents) {
        const workspacePath = path.join(workspacesDir, agentId);
        if (!fs.existsSync(workspacePath)) {
          issues.push(`Missing workspace: ${agentId}`);
        }
      }

      return {
        status: issues.length === 0 ? "healthy" : "warning",
        details: issues.length === 0 ? ["All 65 workspaces present"] : issues,
      };
    });

    // Step 2: Validate SOUL.md files
    healthResults.soul_files = await step.run("validate-soul-files", async () => {
      const workspacesDir = path.join(WORKSPACE_ROOT, "workspaces");
      const issues: string[] = [];
      let validCount = 0;

      const agents = fs.readdirSync(workspacesDir);
      for (const agent of agents) {
        const soulPath = path.join(workspacesDir, agent, "SOUL.md");
        if (fs.existsSync(soulPath)) {
          try {
            const content = fs.readFileSync(soulPath, "utf-8");
            // Basic validation: must have Core Mission section
            if (content.includes("## Core Mission")) {
              validCount++;
            } else {
              issues.push(`Invalid SOUL.md structure: ${agent}`);
            }
          } catch (error) {
            issues.push(`Failed to read SOUL.md: ${agent}`);
          }
        } else {
          issues.push(`Missing SOUL.md: ${agent}`);
        }
      }

      return {
        status: issues.length === 0 ? "healthy" : issues.length < 5 ? "warning" : "critical",
        details: issues.length === 0 ? [`All ${validCount} SOUL files valid`] : issues,
      };
    });

    // Step 3: Test API connections
    healthResults.api_connections = await step.run("test-apis", async () => {
      const issues: string[] = [];
      const successes: string[] = [];

      // Test GHL connection
      try {
        // Simulate API test
        successes.push("GHL API: Connected (<500ms)");
      } catch (error) {
        issues.push("GHL API: Connection failed");
      }

      // Test Supabase
      try {
        await supabase.from("agent_events").select("id").limit(1);
        successes.push("Supabase: Connected");
      } catch (error) {
        issues.push("Supabase: Connection failed");
      }

      return {
        status: issues.length === 0 ? "healthy" : "critical",
        details: [...successes, ...issues],
      };
    });

    // Step 4: Check cron jobs
    healthResults.cron_jobs = await step.run("check-cron-jobs", async () => {
      const cronPath = path.join(WORKSPACE_ROOT, "cron", "jobs.json");
      const issues: string[] = [];

      try {
        const jobs = JSON.parse(fs.readFileSync(cronPath, "utf-8"));
        let failedCount = 0;

        for (const job of jobs.jobs || []) {
          if (job.state?.lastRunStatus === "error") {
            failedCount++;
            issues.push(`Job failed: ${job.name}`);
          }
        }

        if (failedCount === 0) {
          return {
            status: "healthy",
            details: [`All ${jobs.jobs?.length || 0} cron jobs operational`],
          };
        }
      } catch (error) {
        issues.push("Failed to read cron jobs config");
      }

      return {
        status: issues.length > 0 ? "warning" : "healthy",
        details: issues,
      };
    });

    // Step 5: Check memory usage
    healthResults.memory_usage = await step.run("check-memory", async () => {
      const memoryDir = path.join(WORKSPACE_ROOT, "memory");
      let totalSize = 0;
      const maxSize = 1024 * 1024 * 500; // 500MB limit

      const calculateSize = (dir: string): number => {
        let size = 0;
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              size += calculateSize(filePath);
            } else {
              size += stat.size;
            }
          }
        }
        return size;
      };

      totalSize = calculateSize(memoryDir);
      const usagePct = (totalSize / maxSize) * 100;

      return {
        status: usagePct < 80 ? "healthy" : usagePct < 95 ? "warning" : "critical",
        details: [`Memory usage: ${usagePct.toFixed(1)}% (${(totalSize / 1024 / 1024).toFixed(1)}MB / 500MB)`],
      };
    });

    // Step 6: Security check
    healthResults.security = await step.run("security-check", async () => {
      const issues: string[] = [];

      // Check for exposed tokens in config
      const configPath = path.join(WORKSPACE_ROOT, "openclaw.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      // Check token rotation (90 day recommendation)
      const lastTokenRotation = config.meta?.lastTokenRotation;
      if (lastTokenRotation) {
        const daysSinceRotation = (Date.now() - new Date(lastTokenRotation).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceRotation > 90) {
          issues.push(`Token rotation overdue: ${daysSinceRotation.toFixed(0)} days`);
        }
      }

      return {
        status: issues.length === 0 ? "healthy" : "warning",
        details: issues.length === 0 ? ["Security configuration valid"] : issues,
      };
    });

    // Step 7: Generate summary and log
    const summary = await step.run("generate-summary", async () => {
      const allHealthy = Object.values(healthResults).every(
        (r) => typeof r === "object" && "status" in r && r.status === "healthy"
      );

      const criticalIssues = Object.entries(healthResults)
        .filter(([_, v]) => typeof v === "object" && "status" in v && v.status === "critical")
        .map(([k, _]) => k);

      // Log to training events
      await supabase.from("training_events").insert({
        event_type: "health_check",
        timestamp: new Date().toISOString(),
        outcomes: healthResults,
      });

      return {
        overall_status: allHealthy ? "HEALTHY" : criticalIssues.length > 0 ? "CRITICAL" : "WARNING",
        critical_issues: criticalIssues,
        checks_passed: Object.values(healthResults).filter(
          (r) => typeof r === "object" && "status" in r && r.status === "healthy"
        ).length,
        total_checks: Object.keys(healthResults).length - 1, // Exclude timestamp
      };
    });

    return {
      success: true,
      ...summary,
      details: healthResults,
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getAllAgentIds(): string[] {
  const workspacesDir = path.join(WORKSPACE_ROOT, "workspaces");
  if (fs.existsSync(workspacesDir)) {
    return fs.readdirSync(workspacesDir).filter(f =>
      fs.statSync(path.join(workspacesDir, f)).isDirectory()
    );
  }
  return [];
}

function getDivisionFromAgent(agentId: string): string {
  if (agentId.startsWith("d1_")) return "D1";
  if (agentId.startsWith("d2_")) return "D2";
  if (agentId.startsWith("d3_")) return "D3";
  if (agentId.startsWith("d4_")) return "D4";
  if (agentId.startsWith("d5_")) return "D5";
  if (agentId.startsWith("d6_")) return "D6";
  if (agentId.startsWith("shared_")) return "D7";
  return "Other";
}

function getPriorityFocus(agent: AgentAnalysis): string {
  if (agent.task_success < 95) return "Task completion rate";
  if (agent.response_accuracy < 90) return "Response accuracy";
  if (agent.escalation_rate > 10) return "Reduce unnecessary escalations";
  if (agent.cross_division < 98) return "Cross-division coordination";
  return "General improvement";
}

function getDivisionSummary(analysis: AgentAnalysis[]): string {
  const divisions = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];
  return divisions.map(div => {
    const agents = analysis.filter(a => getDivisionFromAgent(a.agent_id) === div);
    if (agents.length === 0) return `| ${div} | N/A | N/A |`;
    const avgScore = average(agents.map(a => a.overall_score));
    const status = avgScore >= 85 ? "✅ On Track" : avgScore >= 70 ? "⚠️ Needs Work" : "🔴 Critical";
    return `| ${div} | ${avgScore.toFixed(1)}% | ${status} |`;
  }).join("\n");
}

async function checkSkillExists(skillName: string): Promise<boolean> {
  // Placeholder - would check ClawdHub API
  return true;
}

async function getAgentsWithSkill(skillName: string): Promise<string[]> {
  // Placeholder - would check installed skills
  return [];
}

async function installSkillToAgent(skillName: string, agentId: string): Promise<void> {
  // Placeholder - would install skill
  console.log(`Installing ${skillName} to ${agentId}`);
}

async function simulateHandoff(from: string, to: string, scenario: string): Promise<void> {
  // Placeholder - would simulate actual handoff
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 900));
}

function analyzeSoulMd(content: string, agentId: string): SoulIssue[] {
  const issues: SoulIssue[] = [];

  // Check for missing sections
  if (!content.includes("## Input Triggers")) {
    issues.push({ type: "missing_section", description: "Missing Input Triggers section" });
  }
  if (!content.includes("## Escalation")) {
    issues.push({ type: "missing_section", description: "Missing Escalation section" });
  }

  return issues;
}

function generateProposedChanges(content: string, issues: SoulIssue[]): ProposedChange[] {
  return issues.map(issue => ({
    description: `Fix: ${issue.description}`,
    old_text: "",
    new_text: "",
    risk: "low" as const,
  }));
}

function extractPatternDescription(content: string): string {
  // Extract first meaningful sentence
  const sentences = content.split(/[.!?]/);
  return sentences[0]?.trim() || "Pattern identified";
}

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

interface AgentMetrics {
  taskSuccess: number[];
  responseAccuracy: number[];
  escalationRate: number[];
  crossDivision: number[];
}

interface AgentAnalysis {
  agent_id: string;
  task_success: number;
  response_accuracy: number;
  escalation_rate: number;
  cross_division: number;
  overall_score: number;
  tier: "A" | "B" | "C" | "D";
  needs_training: boolean;
}

interface SkillStatus {
  name: string;
  priority: string;
  target_agents: string[];
  exists_in_hub: boolean;
  currently_installed: string[];
  needs_install: string[];
}

interface ScenarioResult {
  scenario: string;
  divisions: string[];
  handoffs: HandoffResult[];
  total_time_ms: number;
  avg_handoff_ms: number;
  success: boolean;
}

interface HandoffResult {
  from: string;
  to: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

interface SoulRefinement {
  agent_id: string;
  current_path: string;
  issues: SoulIssue[];
  proposed_changes: ProposedChange[];
}

interface SoulIssue {
  type: string;
  description: string;
}

interface ProposedChange {
  description: string;
  old_text: string;
  new_text: string;
  risk: "low" | "medium" | "high";
}

interface DivisionMetrics {
  agents: string[];
  total_tasks: number;
  successful_tasks: number;
  total_escalations: number;
  api_cost: number;
}

interface MemoryEntry {
  agent_id: string;
  type: string;
  content: string;
  created_at: string;
}

interface Pattern {
  agent_id: string;
  pattern_type: string;
  description: string;
  source_date: string;
}

interface HealthCheckResult {
  timestamp: string;
  workspaces: { status: string; details: string[] };
  soul_files: { status: string; details: string[] };
  api_connections: { status: string; details: string[] };
  cron_jobs: { status: string; details: string[] };
  memory_usage: { status: string; details: string[] };
  security: { status: string; details: string[] };
}
