# OpenClaw Agent Training System

> Historical training document. It does not describe the current repo-verified architecture. Current truth is 103 configured agents across 9 divisions; see `AGENTS.md` and `REGGIE-STATE.md`.

**Truth J Blue LLC** | Senior Director of Digital Strategy & Operations

---

## Overview

The OpenClaw Agent Training System implements a 7-day weekly self-training protocol for all 75 agents across 7 organizational divisions. This system enables continuous improvement, skill development, and performance optimization.

---

## Components

### 1. Cron Jobs (`cron/training-jobs.json`)

Scheduled training events:
| Day | Time | Event | Lead Agent |
|-----|------|-------|------------|
| Monday | 7 AM | Weekly Review | Master Orchestrator |
| Tuesday | 10 AM | Skill Development | CTO |
| Wednesday | 2 PM | Cross-Division | Master Orchestrator |
| Thursday | 11 AM | SOUL Refinement | CTO |
| Friday | 3 PM | Performance Review | Data Analytics |
| Saturday | 9 AM | Memory Consolidation | Knowledge Base |
| Sunday | 6 AM | Health Check | Master Orchestrator |

### 2. Inngest Functions (`inngest/functions/training-protocol.ts`)

Event-driven handlers for each training day:
- `trainingWeeklyReview` - Performance analysis and planning
- `trainingSkillDevelopment` - Skill installation and practice
- `trainingCrossDivision` - Multi-agent collaboration drills
- `trainingSoulRefinement` - Identity and mission updates
- `trainingPerformanceReview` - Metrics dashboard generation
- `trainingMemoryConsolidation` - Knowledge base updates
- `trainingHealthCheck` - System integrity validation

### 3. Scripts

#### Initialize Training Cards
```bash
cd training
npm run init-cards
```
Creates individual training cards for all 75 agents.

#### Generate Dashboard
```bash
npm run dashboard
```
Creates `DASHBOARD.md` with real-time metrics.

#### Run Skill Assessment
```bash
npm run assess
```
Evaluates agent proficiency across skills.

#### Full Training Setup
```bash
npm run training:full
```
Runs all initialization scripts.

---

## Directory Structure

```
.openclaw/training/
├── OPENCLAW-AGENT-TRAINING-PLAN.md  # Master training plan
├── DASHBOARD.md                      # Generated dashboard
├── package.json                      # Scripts and dependencies
├── README.md                         # This file
├── cards/                            # Agent training cards
│   ├── INDEX.md
│   ├── d1/
│   ├── d2/
│   └── ...
├── templates/                        # Document templates
│   ├── agent-training-card.template.md
│   ├── weekly-review-report.template.md
│   └── soul-update-log.template.md
├── scripts/                          # Automation scripts
│   ├── initialize-training-cards.ts
│   ├── generate-dashboard.ts
│   └── skill-assessment.ts
├── logs/                             # Training logs
├── reports/                          # Generated reports
└── assessments/                      # Skill assessments
```

---

## Training Tiers

| Tier | Model | Focus | Agents |
|------|-------|-------|--------|
| **Executive** | Claude Opus 4 | Strategic oversight | CEO, CTO, CVO, Master Orchestrator |
| **Specialist** | Claude Sonnet 4.5 | Domain expertise | Directors, Managers |
| **Tactical** | Claude Sonnet 4.5 | Execution | All other agents |

---

## Performance Metrics (KPIs)

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Task Success Rate | ≥95% | 80-94% | <80% |
| Response Accuracy | ≥90% | 75-89% | <75% |
| Escalation Rate | <10% | 10-20% | >20% |
| Cross-Division Success | ≥98% | 90-97% | <90% |

---

## Quick Start

1. **Install dependencies:**
   ```bash
   cd .openclaw/training
   npm install
   ```

2. **Initialize training cards:**
   ```bash
   npm run init-cards
   ```

3. **Generate initial dashboard:**
   ```bash
   npm run dashboard
   ```

4. **Run skill assessment:**
   ```bash
   npm run assess
   ```

5. **Verify Inngest functions are registered:**
   Check `.openclaw/inngest/functions/index.ts` exports training functions.

---

## Notifications

All training notifications are delivered via:
- **Telegram**: Primary channel (User ID: 7737707872)
- **Supabase**: Event logging and persistence

---

## Support

For issues or questions, contact the Senior Director of Digital Strategy & Operations.

---

*OpenClaw Training System v1.0 | Truth J Blue LLC*
