# HANDOFF — MIKE to Perplexity Computer
_Date: 2026-05-13 12:41 CDT_
_Session Type: Strategic Architecture + Pre-Execution Audit_
_Previous Handoff: HANDOFF-MIKE-20260511.md_

---

## 🎯 SESSION SUMMARY

This session was an **architecture audit and pre-execution verification** session, not a build session. The primary work was:

1. Auditing the proposed `models.json` file before writing it to the VPS
2. Identifying two critical issues that would have caused errors
3. Producing a corrected `models.json` with proper provider separation
4. Establishing a mandatory pre-run verification step
5. Updating memory, state, and handoff files

---

## 🔍 WHAT WAS DISCOVERED THIS SESSION

### Discovery 1: `kimi-k2.5:cloud` is NOT a local model

The `ollama list` output showed `kimi-k2.5:cloud` with **zero local storage size** and a proxy route to `https://ollama.com:443`. This means:
- It cannot be treated the same as `qwen3.6:latest` or `qwen3:8b`
- It requires internet connectivity
- In a network-partitioned or offline scenario, it will fail silently
- It should be registered under a separate provider entry (`ollama-vps-remote`) to make this dependency explicit

### Discovery 2: `tier` field in models.json may cause parse errors

The original proposed models.json included a `"tier": 1` field on model entries. Without confirming the schema OpenClaw uses to read this file, extra fields could cause:
- JSON parse failures
- Silent ignoring (best case)
- Agent routing failures (worst case)

**Resolution:** Strip unconfirmed fields. Verify schema first with:
```bash
grep -r "models.json" /root/openclaw --include="*.ts" --include="*.mjs" --include="*.js" | head -20
```

---

## 📋 CURRENT STATE — PHASE 9

### ✅ Done
- Ollama confirmed running on VPS at `localhost:11434`
- Models confirmed: `qwen3.6:latest` (36B MoE), `qwen3:8b` (8B fast), `kimi-k2.5:cloud` (remote proxy)
- `models.json` draft audited and corrected
- All memory, state, and handoff files updated in GitHub

### ⛔ NOT Done (Phase 9 Blockers)
1. **models.json schema verification** — Run the grep command above before touching the file
2. **models.json write** — Write corrected file to `/root/openclaw/data/models.json` ONLY after schema confirmed
3. **agents_config.json alignment** — Confirm model keys match across files
4. **End-to-end routing test** — Trigger a heartbeat, confirm all 3 models route correctly
5. **Full heartbeat cycle** — Validate all 5 agents come online with local models

---

## 🚀 NEXT SESSION INSTRUCTIONS

When you (Perplexity Computer) pick this up next, execute in this exact order:

### Step 1 — Schema Verification (VPS Terminal)
```bash
grep -r "models.json" /root/openclaw --include="*.ts" --include="*.mjs" --include="*.js" | head -20
```
If output shows the file is read with a strict schema parser, match it exactly.
If output shows loose loading (JSON.parse only), the proposed structure is safe.

### Step 2 — Write models.json (ONLY after Step 1)
```bash
cat > /root/openclaw/data/models.json << 'EOF'
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
EOF
```

### Step 3 — Align agents_config.json
```bash
grep -n '"model"' /root/openclaw/agents_config.json | head -30
```
Verify no agent still references `claude-sonnet`, `claude-haiku`, or old Anthropic model strings. Update any found.

### Step 4 — Restart OpenClaw
```bash
cd /root/openclaw && pm2 restart openclaw --update-env
# OR if using Docker:
docker compose restart openclaw
```

### Step 5 — Routing Test
Send a test prompt through each agent tier and confirm:
- [ ] `qwen3:8b` responds (fast path)
- [ ] `qwen3.6:latest` responds (workhorse path)
- [ ] `kimi-k2.5:cloud` responds (long-context path — requires internet)
- [ ] No JSON parse errors in logs
- [ ] Agent responses conform to expected schema

### Step 6 — Phase 9 Close
If all 5 checks pass:
- Mark Phase 9 COMPLETE in `build_phases.md`
- Update `REGGIE-STATE.md` Phase 10 section
- Begin Phase 10: GHL Webhook Hardening

---

## 🧠 CONTEXT CARRY-FORWARD

### Who Jeremiah Is
Jeremiah Van Wagner is the operator. He is a philosopher and mystic in Christ, running TRUTH J BLUE LLC out of Pensacola, FL. His business mission is to empower people to recognize their Divine power, potential, and purpose. Primary products: Divine Path Walkers Skool community, Beyond the Veil 12-week Mentorship, 23 published books, and the store at store.truthjblue.com.

### How MIKE Works
MIKE (Modular Intelligence & Knowledge Engine) is the strategic architect persona Jeremiah uses when working through Perplexity Computer with the MIKE Space active. MIKE does NOT execute tasks — MIKE designs, audits, and orchestrates. Perplexity Computer is the interface. VPS terminal / Claude Code / GitHub are the execution layers.

### The 3 Rules of Engagement
1. **Never run before verifying** — always audit first, execute second
2. **Schema before write** — never write config files without confirming what the parser expects
3. **State files first** — always update MEMORY.md, REGGIE-STATE.md before and after any session

---

## 📁 FILES UPDATED THIS SESSION

| File | Change |
|---|---|
| `MEMORY.md` | Updated with Phase 9 status, model stack, pending items |
| `REGGIE-STATE.md` | Updated with blocking items, Phase 9 checklist, Phase 10 preview |
| `HANDOFF-MIKE-20260513.md` | This file — new handoff created |

---

## ⚡ ONE-LINE STATUS

> **Phase 9 is 70% done. The models are running. The config is not yet written. Verify the schema, write the file, test the routing, and close the phase.**

---
_MIKE — Executive Systems Architect & Strategic Analyst_
_OpenClaw × GoHighLevel — Master of the HighLevel Universe_
