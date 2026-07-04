#!/usr/bin/env python3
"""
Phase 9.2 Sonnet Audit — Tier-Router classifier (Advancement 6).

Scores every agent bound to llm_model "claude-sonnet-4.5" (the internal tier
label; resolves to anthropic/claude-sonnet-5 via lib/runtime-model-policy.mjs)
against the three Tier-Router tests from REGGIE-STATE Phase 9.2 Item 5:

  surface_leaving    — declared skills that leave the system: outbound contact
                       messaging, public publication, money movement, CRM
                       writes, production deploys, browser control.
  irreversible       — declared skills that mutate GHL/production structures.
  requires_reasoning — executive/supervisor/strategy roles or strategy-tier
                       skills (pricing, legal, orchestration).

CALIBRATION (2026-07-04): the 22 agents already local on qwen3:14b (Phase
9.1-redo) hold 198 distinct skills including the full risky vocabulary —
skills[] arrays are capability GRANTS, not activity profiles. A naive
any-risky-skill => stay-Sonnet rule would keep ~all 74 and contradict that
accepted precedent. Since the A4 enforce-mode cutover (audit 2026-07-04-004),
the governance layer BLOCKS ungoverned actions mechanically: ghl_write /
email_send / payment_action route through HITL approval regardless of which
model reasons about them. Risk therefore splits on whether an agent's risky
skills are all inside those gated action families or include ungated paths
(browser control, CI/CD, deploys, auth/config mutation).

Verdicts:
  remap-clean       all three booleans false                → batch-1 eligible
  remap-guardrails  risky skills exist but ALL are HITL-gated; no reasoning
                    flag                                    → CVO judgment
  stay-sonnet       requires_reasoning, or any UNGATED risky skill
  manual-review     metadata too thin to classify (no skills[])

Outputs (regenerated, do not hand-edit):
  docs/phases/sonnet-audit-phase-9-2-results.md    — reviewable table
  docs/phases/sonnet-audit-phase-9-2-results.json  — machine-readable verdicts

The CVO review gate (brief step 2) happens ON the generated table; the
approved remap list is committed separately as an allowlist JSON consumed by
scripts/phase9_2_patch.py --agents.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "agents_config.json"
OUT_MD = ROOT / "docs" / "phases" / "sonnet-audit-phase-9-2-results.md"
OUT_JSON = ROOT / "docs" / "phases" / "sonnet-audit-phase-9-2-results.json"

SONNET_LABEL = "claude-sonnet-4.5"

# ── deny-sets (built from the observed 262-skill vocabulary of the cohort) ──

OUTBOUND_CONTACT = {
    "email-broadcaster", "email-sequence", "ghl-email-service",
    "abandoned-cart-recovery", "ecommerce-cart-abandonment-recovery",
    "subscription-dunning-manager", "ebook-buyer-automation",
    "proposal-and-contract-sender", "testimonial-collector", "csat-collector",
    "calendar-booking-bot", "brand-dm-qualification",
    "community-reengagement-prompting", "community-welcome-sequence-orchestration",
    "community-omnichannel-routing", "coaching-intervention-triggering",
    "coaching-automated-accountability", "ecommerce-voice-commerce-processing",
    "ecommerce-multilingual-support-resolution", "deal-closer", "objection-handler",
}
PUBLIC_PUBLISH = {
    "social-media-publisher", "social-poster", "social-distributor",
    "blog-post-publisher", "ghl-social-planner", "youtube-manager",
    "affiliate-seo-programmatic-page-deployment",
    "affiliate-seo-dynamic-link-injection", "membership-content-uploader",
}
MONEY = {
    "checkout-integrator", "invoice-generator", "agency-automated-invoice-generation",
    "ecommerce-return-refund-authorization", "finance-smart-contract-triggering",
    "finance-high-frequency-execution", "finance-portfolio-rebalancing",
    "community-billing-reconciliation", "coupon-and-promo-creator",
}
CRM_WRITE = {
    "contact-synchronizer", "duplicate-contact-merger", "tagging-engine",
    "opportunity-mover", "hubspot-contact-updater", "salesforce-lead-creator",
}
BROWSER = {
    "ghl-browser-control", "browser-automation", "browser-controller",
    "browser-core", "affiliate-seo-headless-browser-automation",
}
PROD_DEPLOY = {
    "snapshot-deployer", "subaccount-provisioner", "woocommerce-manager",
    "wordpress-divi-manager", "aisaas-cicd-execution",
}

SURFACE_LEAVING = OUTBOUND_CONTACT | PUBLIC_PUBLISH | MONEY | CRM_WRITE | BROWSER | PROD_DEPLOY

IRREVERSIBLE = {
    "funnel-builder", "funnel-cloner", "ghl-funnel-cloner", "ghl-workflow-builder",
    "ghl-offer-creator", "ghl-course-manager", "ghl-saas-manager", "ghl-media-manager",
    "pipeline-manager", "custom-value-manager", "page-builder", "landing-page-builder",
    "form-and-survey-builder", "course-builder", "native-ghl-build-refactor",
    "webhook-listener-config", "ghl-oauth-manager", "access-control-manager",
    "domain-connector",
} | PROD_DEPLOY | {"finance-smart-contract-triggering"}

# Risky skills whose execution path is NOT inside the HITL-gated action
# families (ghl_write / email_send / payment_action, lib/security-governance
# DEFAULT_REQUIRES_HITL_FOR): browser drives production UIs directly, deploys
# and auth/config mutations act below the approval layer.
UNGATED = BROWSER | PROD_DEPLOY | {
    "domain-connector", "webhook-listener-config", "ghl-oauth-manager",
    "access-control-manager", "finance-smart-contract-triggering",
    "finance-high-frequency-execution",
}

REASONING_SKILLS = {
    "pricing-strategist", "offer-architect", "offer-psychology-engine",
    "guarantee-designer", "agency-contract-risk-extraction",
    "finance-regulatory-enforcement", "cross-business-scope-governor",
    "finance-hierarchical-consensus-building", "agency-custom-workflow-orchestration",
    "approval-rubric", "offer-engineering",
}
REASONING_ID_RE = re.compile(
    r"ceo|cvo|coo|cto|cmo|orchestrator|strategist|architect|director|"
    r"legal|compliance|counsel|governor",
    re.IGNORECASE,
)
REASONING_TEXT_RE = re.compile(r"strateg|legal|pricing|compliance|orchestrat", re.IGNORECASE)


def classify(agent: dict) -> dict:
    skills = set(agent.get("skills") or [])
    sl = sorted(skills & SURFACE_LEAVING)
    ir = sorted(skills & IRREVERSIBLE)
    ungated = sorted(skills & UNGATED)

    reasoning_hits = []
    if agent.get("role_type") == "executive":
        reasoning_hits.append("role_type=executive")
    if agent.get("agent_class") == "supervisor":
        reasoning_hits.append("agent_class=supervisor")
    if agent.get("criticality") == "critical":
        reasoning_hits.append("criticality=critical")
    if agent.get("queue_class") == "P0":
        reasoning_hits.append("queue_class=P0")
    ident = f"{agent.get('agent_id', '')} {agent.get('display_name', '')}"
    if REASONING_ID_RE.search(ident):
        reasoning_hits.append(f"id/name: {REASONING_ID_RE.search(ident).group(0)}")
    scope_text = " ".join(
        (agent.get("business_scope") or [])
        + (agent.get("primary_responsibilities") or [])
    )
    if REASONING_TEXT_RE.search(scope_text):
        reasoning_hits.append(f"scope text: {REASONING_TEXT_RE.search(scope_text).group(0)}")
    skill_hits = sorted(skills & REASONING_SKILLS)
    if skill_hits:
        reasoning_hits.append("skills: " + ", ".join(skill_hits))

    # scope-text is the weakest reasoning signal: "pricing analysis" in a
    # reporting role trips the same regex as "sets pricing". If it is the ONLY
    # flag (no role/class/criticality/id/skill evidence) the agent is
    # ambiguous, not confidently reasoning-tier.
    text_only = bool(reasoning_hits) and all(h.startswith("scope text") for h in reasoning_hits)

    if not skills:
        verdict = "manual-review"
    elif reasoning_hits and not text_only:
        verdict = "stay-sonnet"
    elif ungated:
        verdict = "stay-sonnet"
    elif text_only:
        verdict = "manual-review"
    elif sl or ir:
        verdict = "remap-guardrails"
    else:
        verdict = "remap-clean"

    boundaries = agent.get("operational_boundaries") or []
    return {
        "agent_id": agent["agent_id"],
        "org_unit": agent.get("org_unit", ""),
        "role_type": agent.get("role_type", ""),
        "business_scope": agent.get("business_scope") or [],
        "surface_leaving": sl,
        "irreversible": ir,
        "ungated": ungated,
        "requires_reasoning": reasoning_hits,
        "boundaries_deny_outbound": any("outbound" in b.lower() for b in boundaries),
        "skill_count": len(skills),
        "verdict": verdict,
    }


def main() -> None:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    cohort = [a for a in cfg["agents"] if a.get("llm_model") == SONNET_LABEL]
    rows = [classify(a) for a in cohort]

    order = {"remap-clean": 0, "remap-guardrails": 1, "manual-review": 2, "stay-sonnet": 3}
    rows.sort(key=lambda r: (order[r["verdict"]], r["agent_id"]))
    counts = {v: sum(1 for r in rows if r["verdict"] == v) for v in order}

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps({"generated": date.today().isoformat(), "sonnet_label": SONNET_LABEL,
                    "counts": counts, "agents": rows}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    def fmt_list(items, limit=4):
        if not items:
            return ""
        head = ", ".join(items[:limit])
        return head + (f" (+{len(items) - limit})" if len(items) > limit else "")

    lines = [
        "# Phase 9.2 Sonnet Audit — Classification Results",
        "",
        f"Generated {date.today().isoformat()} by `scripts/phase9_2_audit.py` "
        f"from `config/agents_config.json`. Do not hand-edit; annotate approvals in "
        f"the allowlist JSON instead.",
        "",
        f"Cohort: **{len(rows)} agents** bound to `{SONNET_LABEL}` "
        f"(resolves to `anthropic/claude-sonnet-5`).",
        "",
        "| Verdict | Count | Meaning |",
        "| --- | --- | --- |",
        f"| remap-clean | {counts['remap-clean']} | no risky skills, no reasoning flag — batch-1 eligible |",
        f"| remap-guardrails | {counts['remap-guardrails']} | risky skills exist but ALL are HITL-gated (ghl_write/email_send/payment_action, enforce-mode `fail` since 2026-07-04) — CVO judgment call |",
        f"| manual-review | {counts['manual-review']} | ambiguous — empty skills[], or the ONLY reasoning flag is scope-prose (regex can't tell \"sets pricing\" from \"reports on pricing\") |",
        f"| stay-sonnet | {counts['stay-sonnet']} | reasoning-tier role/skills, or ungated risky capability (browser/deploy/auth) |",
        "",
        "| Agent | Div | Role | Verdict | Surface-leaving | Irreversible | Ungated | Reasoning flags |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['agent_id']} | {r['org_unit'].replace('division_', 'd')} "
            f"| {r['role_type']} | **{r['verdict']}** "
            f"| {fmt_list(r['surface_leaving'])} | {fmt_list(r['irreversible'])} "
            f"| {fmt_list(r['ungated'])} | {fmt_list(r['requires_reasoning'], 3)} |"
        )
    lines += [
        "",
        "## Notes",
        "",
        "- Calibration: the 22 Phase-9.1 agents already local on qwen3:14b hold the",
        "  same risky skill vocabulary — `skills[]` are capability grants, not",
        "  activity profiles. The gating question is whether risky capabilities are",
        "  mechanically governed (HITL families) or bypass governance (browser,",
        "  deploys, auth mutation). See classifier docstring.",
        "- Hardware reality: any remap this cycle lands on `ollama/qwen3:14b`",
        "  (qwen3.5:27b/qwen3.6 do not fit 15 GiB). Walk-up is a NEW_TAG flip when",
        "  RAM lands.",
        "- Rollout prerequisite: the live VPS gateway config has ZERO ollama",
        "  provider refs today — batch deployment must add the provider block and",
        "  per-agent model entries, then pass `pnpm preflight` (which verifies",
        "  referenced tags are pulled) before restart.",
        "",
    ]
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"cohort={len(rows)} verdicts={counts}")
    print(f"wrote {OUT_MD.relative_to(ROOT)} and {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
