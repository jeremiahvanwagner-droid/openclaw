---
name: workflow-loop-detector
description: Analyzes GHL workflow JSON to detect infinite loops, circular tag triggers, and unbounded wait sequences before deployment
---

# Workflow Loop Detector

## Purpose
Pre-deployment safety check for GHL workflows. Analyzes workflow JSON structure to identify dangerous patterns that could cause infinite loops, circular triggers, or runaway automations.

## Required Inputs
- `workflow_json` (object): GHL workflow definition to analyze

## Optional Inputs
- `max_depth` (number): Maximum allowed nesting depth (default: 20)
- `max_wait_total` (number): Maximum total wait time in hours (default: 720 — 30 days)
- `strict_mode` (boolean): Flag warnings as errors (default: false)

## Detection Rules

### Critical — Block Deployment
| Pattern | Detection Method |
|---------|-----------------|
| Tag trigger loop | Workflow adds tag X → another workflow triggers on tag X → adds tag triggering original workflow |
| Webhook echo | Workflow sends webhook → response triggers same workflow |
| Self-referencing workflow | Workflow triggers itself without conditional exit |
| Infinite wait loop | Wait → condition check → wait cycle with no guaranteed exit |

### Warning — Flag for Review
| Pattern | Detection Method |
|---------|-----------------|
| Deep nesting | If/else chains deeper than max_depth |
| Long total wait | Sum of all wait steps exceeds max_wait_total hours |
| Missing exit condition | Loop-like structure without explicit stop condition |
| Duplicate actions | Same action repeated in sequence without condition change |
| High-frequency trigger | Trigger + action with <1 min expected cycle time |

## Analysis Algorithm
1. Parse workflow into directed graph (nodes = actions, edges = transitions)
2. Identify all trigger nodes (entry points)
3. For each trigger, walk the graph detecting:
   a. Cycles (DFS with visited set)
   b. Tag additions that match any workflow's trigger filter
   c. Webhook endpoints that echo back to the location
   d. Wait steps summed along each path
4. Score each path: safe / warning / blocked
5. Return worst-case assessment

## Output Contract
```json
{
  "workflow_id": "string",
  "workflow_name": "string",
  "verdict": "safe|warnings|blocked",
  "issues": [
    {
      "severity": "critical|warning",
      "type": "tag_loop|webhook_echo|self_reference|infinite_wait|deep_nesting|missing_exit|duplicate_action|high_frequency",
      "description": "string",
      "path": ["node_id_1", "node_id_2", "..."],
      "recommendation": "string"
    }
  ],
  "statistics": {
    "total_nodes": 0,
    "max_depth": 0,
    "total_wait_hours": 0,
    "cycle_count": 0,
    "tag_additions": ["string"],
    "webhook_calls": 0
  },
  "analyzed_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Detects simple A→B→A tag loops
- [ ] Detects transitive A→B→C→A loops
- [ ] Blocks self-referencing workflows
- [ ] Warns on deep nesting (>20 levels)
- [ ] Accurately sums wait times across paths
- [ ] Returns "safe" verdict for clean workflows
- [ ] Critical issues set verdict to "blocked"
