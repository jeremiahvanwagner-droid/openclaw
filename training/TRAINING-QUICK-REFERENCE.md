# OpenClaw Weekly Self-Training Quick Reference

**Truth J Blue LLC — Agent Training System**

---

## Weekly Schedule at a Glance

| Day | Time | Session | Lead Agent | Focus |
|-----|------|---------|------------|-------|
| **MON** | 7:00 AM | Weekly Review & Planning | `shared_master_orchestrator` | Analyze last week, set priorities |
| **TUE** | 10:00 AM | Skill Development | `d1_cto` | Install and test new skills |
| **WED** | 2:00 PM | Cross-Division Training | `shared_master_orchestrator` | Practice handoffs and coordination |
| **THU** | 11:00 AM | SOUL.md Refinement | `d1_cto` | Update agent configurations |
| **FRI** | 3:00 PM | Performance Review | `shared_data_analytics` | Evaluate metrics, identify issues |
| **SAT** | 9:00 AM | Memory Consolidation | `shared_knowledge_base` | Learn from experience, clear cache |
| **SUN** | 6:00 AM | System Health Check | `shared_master_orchestrator` | Full diagnostic, prepare for week |

---

## Performance Tiers

| Tier | Score | Action |
|------|-------|--------|
| 🏆 **A** | 90-100% | Model agent — share patterns |
| ✅ **B** | 75-89% | On track — minor refinements |
| ⚠️ **C** | 60-74% | Priority training required |
| 🔴 **D** | <60% | Escalate to human review |

---

## Key Metrics

- **Task Success Rate:** Target ≥ 95%
- **Response Accuracy:** Target ≥ 90%
- **Escalation Rate:** Target ≤ 10%
- **Cross-Division Handoff:** Target ≥ 98%

---

## Division Training Tracks (8 Weeks Each)

| Division | Focus Area |
|----------|------------|
| D1 Core Ops | Executive decision-making, strategic integration |
| D2 eCommerce | Conversion optimization, inventory management |
| D3 Consulting | Client intelligence, proposal generation |
| D4 Coaching | Student transformation, community engagement |
| D5 Publishing | Editorial excellence, distribution automation |
| D6 Nonprofit | Grant management, donor relations |
| D7 Shared | System coordination, security, analytics |

---

## Priority Skills to Install (Q1 2026)

| Priority | Skills |
|----------|--------|
| 🔴 Critical | `highlevel-advanced`, `stripe-advanced`, `supabase-admin` |
| 🟡 High | `instagram-business`, `tiktok-business`, `youtube-analytics` |
| 🟢 Medium | `calendly`, `zoom`, `canva` |

---

## Quick Commands

```bash
# View agent training status
openclaw training status [agent_id]

# Run manual skill assessment
openclaw skills assess [agent_id]

# Test SOUL.md changes in sandbox
openclaw sandbox test [agent_id] --soul-update

# Generate performance report
openclaw report performance --division [d1|d2|d3|d4|d5|d6|d7|all]

# View training logs
openclaw logs training --week [week_number]
```

---

## File Locations

| Resource | Path |
|----------|------|
| Training Plan | `.openclaw/training/OPENCLAW-AGENT-TRAINING-PLAN.md` |
| Agent Cards | `.openclaw/training/cards/[agent_id].md` |
| Weekly Reports | `.openclaw/training/logs/[YYYY-WW]-training-log.md` |
| Templates | `.openclaw/training/templates/` |
| Agent Configs | `.openclaw/agents_config.json` |
| SOUL Files | `.openclaw/workspaces/[agent_id]/SOUL.md` |

---

## Escalation Contacts

| Issue Type | First Contact | Escalate To |
|------------|---------------|-------------|
| Training System | `d1_cto` | Jeremiah |
| Performance Issues | `shared_data_analytics` | `d1_cto` |
| SOUL.md Problems | `d1_cto` | `shared_master_orchestrator` |
| Cross-Division | `shared_master_orchestrator` | `d1_ceo` |

---

*Quick Reference v1.0 | Updated: 2026-03-13*
