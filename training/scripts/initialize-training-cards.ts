/**
 * OpenClaw Agent Training Card Initializer
 * Truth J Blue LLC
 * 
 * This script initializes training cards for all 75 agents
 * based on the template at templates/agent-training-card.template.md
 */

import * as fs from "fs";
import * as path from "path";

const WORKSPACE_ROOT = "C:\\Users\\JeremiahVanWagner\\.openclaw";
const TRAINING_DIR = path.join(WORKSPACE_ROOT, "training");
const CARDS_DIR = path.join(TRAINING_DIR, "cards");
const AGENTS_CONFIG = path.join(WORKSPACE_ROOT, "agents_config.json");
const WORKSPACES_DIR = path.join(WORKSPACE_ROOT, "workspaces");

interface Agent {
  agent_id: string;
  name: string;
  division: string;
  role: string;
  tools_required?: string[];
  model?: string;
  skills?: string[];
}

interface AgentsConfig {
  total_agents: number;
  divisions: {
    [key: string]: {
      name: string;
      agents: Agent[];
    };
  };
}

// Division display names
const DIVISION_NAMES: Record<string, string> = {
  d1: "D1 - Core Operations",
  d2: "D2 - eCommerce & Media",
  d3: "D3 - Consulting & Services",
  d4: "D4 - Coaching & Courses",
  d5: "D5 - Publishing",
  d6: "D6 - Nonprofit",
  d7: "D7 - Shared Services",
};

// Tier assignments by role
const TIER_BY_ROLE: Record<string, string> = {
  CEO: "Executive",
  CTO: "Executive",
  CFO: "Executive",
  CMO: "Executive",
  CVO: "Executive",
  Director: "Specialist",
  Manager: "Specialist",
  Lead: "Specialist",
  Coordinator: "Tactical",
  Analyst: "Tactical",
  Specialist: "Tactical",
  Assistant: "Tactical",
};

function generateTrainingCard(agent: Agent): string {
  const today = new Date().toISOString().split("T")[0];
  const tier = getTierFromRole(agent.role);
  const skills = agent.skills || agent.tools_required || [];
  
  return `# Training Card: ${agent.name}

## Agent Information
| Field | Value |
|-------|-------|
| **Agent ID** | \`${agent.agent_id}\` |
| **Division** | ${DIVISION_NAMES[agent.division] || agent.division} |
| **Role** | ${agent.role} |
| **Training Tier** | ${tier} |
| **Current Model** | ${agent.model || "claude-sonnet-4-5"} |
| **Card Created** | ${today} |
| **Last Updated** | ${today} |

---

## Current Skills Inventory

### Installed Skills
${skills.length > 0 ? skills.map(s => `- [ ] ${s}`).join("\n") : "- *No skills currently installed*"}

### Priority Skills to Acquire
- [ ] *To be determined during Skill Development (Tuesday)*

### Skills Mastery Progress
| Skill | Status | Last Practiced | Proficiency |
|-------|--------|----------------|-------------|
| *None tracked yet* | | | |

---

## Training History

### Week-by-Week Progress
| Week | Focus Area | Outcome | Score |
|------|------------|---------|-------|
| W01 | Initial Assessment | Pending | - |

### Recent Training Sessions
*No training sessions recorded yet*

---

## Performance Metrics

### Current Performance
| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Task Success Rate | Pending | 95% | - |
| Response Accuracy | Pending | 90% | - |
| Escalation Rate | Pending | <10% | - |
| Cross-Division Success | Pending | 98% | - |

### Performance Trend
\`\`\`
Week    │ Score
────────┼───────
        │ No data yet
\`\`\`

---

## SOUL.md Alignment

### Current Version
- **Version**: 1.0.0
- **Last Reviewed**: ${today}
- **Status**: ✅ Aligned

### Refinement Log
| Date | Change | Reason |
|------|--------|--------|
| ${today} | Initial creation | Training system initialization |

---

## Training Notes

### Strengths
- *To be identified during performance reviews*

### Areas for Improvement
- *To be identified during performance reviews*

### Custom Training Requirements
- *None specified*

---

## Certification Status

### Core Certifications
- [ ] OpenClaw Platform Fundamentals
- [ ] Division-Specific Operations
- [ ] Cross-Division Collaboration
- [ ] Emergency Protocols

### Specialized Certifications
*Based on role requirements*

---

## Next Training Actions

1. **Monday Weekly Review**: Initial baseline assessment
2. **Tuesday Skill Development**: Identify priority skill gaps
3. **Thursday SOUL Refinement**: Validate SOUL.md structure
4. **Friday Performance Review**: Set initial KPI targets

---

*This training card is automatically updated by the OpenClaw Training System*
*Last system sync: ${today}*
`;
}

function getTierFromRole(role: string): string {
  // Check for exact match first
  if (TIER_BY_ROLE[role]) return TIER_BY_ROLE[role];
  
  // Check for partial matches
  for (const [keyword, tier] of Object.entries(TIER_BY_ROLE)) {
    if (role.toLowerCase().includes(keyword.toLowerCase())) {
      return tier;
    }
  }
  
  // Default tier
  return "Tactical";
}

async function loadAgentsConfig(): Promise<AgentsConfig | null> {
  try {
    const content = fs.readFileSync(AGENTS_CONFIG, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to load agents config:", error);
    return null;
  }
}

async function discoverAgentsFromWorkspaces(): Promise<Agent[]> {
  const agents: Agent[] = [];
  
  if (!fs.existsSync(WORKSPACES_DIR)) {
    console.error("Workspaces directory not found");
    return agents;
  }
  
  const directories = fs.readdirSync(WORKSPACES_DIR);
  
  for (const dir of directories) {
    const dirPath = path.join(WORKSPACES_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    
    // Determine division from directory name prefix
    let division = "d7"; // Default to shared
    if (dir.startsWith("d1_")) division = "d1";
    else if (dir.startsWith("d2_")) division = "d2";
    else if (dir.startsWith("d3_")) division = "d3";
    else if (dir.startsWith("d4_")) division = "d4";
    else if (dir.startsWith("d5_")) division = "d5";
    else if (dir.startsWith("d6_")) division = "d6";
    else if (dir.startsWith("shared_")) division = "d7";
    
    // Extract role from SOUL.md if available
    let role = "Agent";
    let name = dir.replace(/^(d[1-6]_|shared_)/, "").replace(/_/g, " ");
    name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    const soulPath = path.join(dirPath, "SOUL.md");
    if (fs.existsSync(soulPath)) {
      try {
        const soulContent = fs.readFileSync(soulPath, "utf-8");
        
        // Extract role from SOUL.md
        const roleMatch = soulContent.match(/##\s*Role[:\s]+(.+)/i) || 
                          soulContent.match(/Role[:\s]+(.+)/i);
        if (roleMatch) {
          role = roleMatch[1].trim();
        }
        
        // Extract name from SOUL.md
        const nameMatch = soulContent.match(/##?\s*Name[:\s]+(.+)/i) ||
                          soulContent.match(/^#\s+(.+)/m);
        if (nameMatch) {
          name = nameMatch[1].trim();
        }
      } catch (error) {
        console.warn(`Failed to parse SOUL.md for ${dir}`);
      }
    }
    
    agents.push({
      agent_id: dir,
      name,
      division,
      role,
    });
  }
  
  return agents;
}

async function initializeTrainingCards(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  OpenClaw Training Card Initialization");
  console.log("  Truth J Blue LLC");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  // Ensure cards directory exists
  fs.mkdirSync(CARDS_DIR, { recursive: true });
  
  // Load agents from config or discover from workspaces
  let agents: Agent[] = [];
  
  const config = await loadAgentsConfig();
  if (config) {
    console.log(`📋 Found agents_config.json with ${config.total_agents} agents\n`);
    for (const [divKey, divData] of Object.entries(config.divisions)) {
      for (const agent of divData.agents) {
        agents.push({
          ...agent,
          division: divKey,
        });
      }
    }
  } else {
    console.log("📂 Discovering agents from workspaces...\n");
    agents = await discoverAgentsFromWorkspaces();
  }
  
  console.log(`Found ${agents.length} agents to initialize\n`);
  
  // Group by division for reporting
  const byDivision: Record<string, Agent[]> = {};
  for (const agent of agents) {
    if (!byDivision[agent.division]) {
      byDivision[agent.division] = [];
    }
    byDivision[agent.division].push(agent);
  }
  
  // Initialize cards
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const [division, divAgents] of Object.entries(byDivision)) {
    console.log(`\n📁 ${DIVISION_NAMES[division] || division} (${divAgents.length} agents)`);
    console.log("─".repeat(50));
    
    // Create division subdirectory
    const divCardsDir = path.join(CARDS_DIR, division);
    fs.mkdirSync(divCardsDir, { recursive: true });
    
    for (const agent of divAgents) {
      const cardPath = path.join(divCardsDir, `${agent.agent_id}.md`);
      
      if (fs.existsSync(cardPath)) {
        console.log(`  ⏭️  ${agent.agent_id} (already exists)`);
        skipped++;
        continue;
      }
      
      try {
        const cardContent = generateTrainingCard(agent);
        fs.writeFileSync(cardPath, cardContent);
        console.log(`  ✅ ${agent.agent_id}`);
        created++;
      } catch (error) {
        console.error(`  ❌ ${agent.agent_id}: ${error}`);
        errors++;
      }
    }
  }
  
  // Summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Initialization Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ Created:  ${created}`);
  console.log(`  ⏭️  Skipped:  ${skipped}`);
  console.log(`  ❌ Errors:   ${errors}`);
  console.log(`  ────────────────────`);
  console.log(`  📊 Total:    ${agents.length}`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  // Create index file
  const indexPath = path.join(CARDS_DIR, "INDEX.md");
  const indexContent = generateIndex(byDivision);
  fs.writeFileSync(indexPath, indexContent);
  console.log(`📝 Created index at: ${indexPath}\n`);
}

function generateIndex(byDivision: Record<string, Agent[]>): string {
  const today = new Date().toISOString().split("T")[0];
  
  let content = `# OpenClaw Training Cards Index

**Generated:** ${today}
**Total Agents:** ${Object.values(byDivision).reduce((a, b) => a + b.length, 0)}

---

`;
  
  for (const [division, agents] of Object.entries(byDivision).sort()) {
    content += `## ${DIVISION_NAMES[division] || division}\n\n`;
    content += `| Agent ID | Name | Role | Card |\n`;
    content += `|----------|------|------|------|\n`;
    
    for (const agent of agents.sort((a, b) => a.agent_id.localeCompare(b.agent_id))) {
      content += `| \`${agent.agent_id}\` | ${agent.name} | ${agent.role} | [View](${division}/${agent.agent_id}.md) |\n`;
    }
    
    content += `\n`;
  }
  
  content += `---

## Quick Links

- [Training Plan](../OPENCLAW-AGENT-TRAINING-PLAN.md)
- [Templates](../templates/)
- [Logs](../logs/)
- [Reports](../reports/)

---

*Auto-generated by Training Card Initializer*
`;
  
  return content;
}

// Run initialization
initializeTrainingCards().catch(console.error);
