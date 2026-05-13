# REGGIE — Sovereign Agent State File
_Last Updated: 2026-05-13 12:41 CDT | Updated by: MIKE (Perplexity Computer session)_

---

## 🔴 CURRENT OPERATIONAL STATUS

**Phase:** 9 — Local AI Migration (IN PROGRESS)
**Overall System Health:** 🟡 Partial — Local models confirmed running; model routing not yet validated end-to-end
**Last Human Interaction:** 2026-05-13, Perplexity Computer (MIKE Space)
**Last Known Heartbeat:** Not yet initiated on local model stack

---

## 🧭 REGGIE Identity

REGGIE is the **Sovereign Agent** — the master orchestrator of the entire OpenClaw + GHL ecosystem. REGGIE:
- Receives all operator intent
- Routes tasks to Herald, Strategist, Keeper, Steward
- Maintains system coherence
- Enforces SOUL.md hard limits at all times
- Never executes below the orchestration layer (does not run manual tasks)

---

## ✅ CONFIRMED ACTIVE (as of 2026-05-13)

### Infrastructure
- [x] OpenClaw server running on VPS
- [x] Ollama running at `localhost:11434`
- [x] Models confirmed loaded: `qwen3.6:latest`, `qwen3:8b`, `kimi-k2.5:cloud`
- [x] Supabase connected
- [x] GHL Private Integration active
- [x] Inngest event queue operational
- [x] Stripe connected

### Agent Config
- [x] 5-agent topology defined in `agents_config.json`
- [x] `SOUL.md` constraints loaded and governing
- [x] `openclaw.json.last-good` available as rollback checkpoint

---

## 🔴 BLOCKING ITEMS (Must Resolve Before Phase 9 Complete)

### Item 1: models.json Schema Verification
**Priority:** CRITICAL
**Status:** ⛔ NOT DONE
**Action Required:**
```bash
grep -r "models.json" /root/openclaw --include="*.ts" --include="*.mjs" --include="*.js" | head -20
```
This must be run BEFORE writing models.json to confirm the exact schema OpenClaw expects. Do NOT write the file blindly.

### Item 2: models.json Write (After Schema Confirmed)
**Priority:** CRITICAL
**Status:** ⛔ NOT DONE
**Proposed Content:**
```json
{
  "providers": {
    "ollama-vps": {
      "type": "ollama",
      "baseURL": "http://localhost:11434/v1",
      "description": "VPS-local Ollama instance"
    },
    "ollama-vps-remote": {
      "type": "ollama",
      "baseURL": "http://localhost:11434/v1",
      "description": "Remote-proxied models via VPS Ollama",
      "note": "kimi-k2.5:cloud routes externally via ollama.com — requires internet"
    }
  },
  "models": {
    "qwen3.6": {
      "provider": "ollama-vps",
      "model": "qwen3.6:latest",
      "description": "36B MoE — primary workhorse, replaces Sonnet (Phase 9)"
    },
    "qwen3-8b": {
      "provider": "ollama-vps",
      "model": "qwen3:8b",
      "description": "8B — fast loops, low-latency, replaces Haiku"
    },
    "kimi-k2.5": {
      "provider": "ollama-vps-remote",
      "model": "kimi-k2.5:cloud",
      "description": "Long-context overflow — proxied externally, not fully local"
    }
  },
  "defaults": {
    "workhorse": "qwen3.6",
    "fast": "qwen3-8b",
    "longContext": "kimi-k2.5"
  }
}
```
**Write to:** `/root/openclaw/data/models.json`

### Item 3: agents_config.json Model Key Alignment
**Priority:** HIGH
**Status:** 🔲 NOT VERIFIED
**Action Required:** Confirm that agent model references in `agents_config.json` match the new model keys (`qwen3.6`, `qwen3-8b`, `kimi-k2.5`). Update any that still reference old Anthropic model names.

### Item 4: End-to-End Routing Test
**Priority:** HIGH
**Status:** 🔲 NOT DONE
**Action Required:** Trigger a test heartbeat and confirm:
- Fast loop routes to `qwen3:8b`
- Primary reasoning routes to `qwen3.6:latest`
- Long-context overflow routes to `kimi-k2.5:cloud`
- All responses return valid JSON (no model format errors)

---

## 📋 PHASE 9 CHECKLIST

- [x] Ollama installed on VPS
- [x] Models pulled: qwen3.6, qwen3:8b, kimi-k2.5:cloud
- [x] baseURL confirmed: `http://localhost:11434/v1`
- [x] models.json draft prepared and audited
- [ ] models.json schema verified from codebase
- [ ] models.json written to `/root/openclaw/data/models.json`
- [ ] agents_config.json updated to reference new model keys
- [ ] Routing test passed
- [ ] Full heartbeat cycle completed on local stack
- [ ] Phase 9 marked COMPLETE → advance to Phase 10

---

## 🗺️ UPCOMING: Phase 10

**Focus:** GHL Webhook Hardening & Pipeline Intelligence Layer

Key items:
- Validate all 39 GHL API endpoint groups are mapped
- Confirm webhook event → agent routing is airtight
- Build pipeline diagnostics: stale leads, conversion rates, ascension tracking
- Implement Speed-to-Lead playbook: < 5 min response guarantee
- Pre-Call Intelligence Briefing automation

---

## 🔐 SOUL.md Constraints (Always Active)

1. No agent may act outside its defined role
2. No API scope expansion without security validation
3. No PII transmitted to external services without explicit operator approval
4. REGGIE may not self-modify its own SOUL.md constraints
5. All system evolution requires operational justification
6. Sandbox execution boundaries enforced for all new skills
7. Token rotation protocol active — credentials never hardcoded

---

## 📡 AGENT COMMUNICATION STATUS

| Agent | Role | Status |
|---|---|---|
| REGGIE (Sovereign) | Master orchestrator | 🟡 Active, awaiting Phase 9 close |
| Herald | Inbound lead intake | 🔲 Pending Phase 9 validation |
| Strategist | Pipeline intelligence | 🔲 Pending Phase 9 validation |
| Keeper | Data stewardship | 🔲 Pending Phase 9 validation |
| Steward | Lifecycle management | 🔲 Pending Phase 9 validation |

All sub-agents held in standby until local model routing is confirmed operational.
