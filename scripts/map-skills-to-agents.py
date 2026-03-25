#!/usr/bin/env python3
"""
Map all skill modules to the 103 agents based on their tools_required,
primary_responsibilities, and division context.

Updates:
  - config/agents_config.json — adds `skills` array to each agent
  - config/openclaw.json — adds `skills` array to each agent entry
  - config/openclaw.prod.json — same
  - config/skills-registry.json — expands registered skills
"""

import json, re, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
AGENTS_CONFIG = ROOT / "config" / "agents_config.json"
OPENCLAW_DEV  = ROOT / "config" / "openclaw.json"
OPENCLAW_PROD = ROOT / "config" / "openclaw.prod.json"
SKILLS_REG    = ROOT / "config" / "skills-registry.json"
SKILLS_DIR    = ROOT / "skills"

# ──────────────────────────────────────────────────────────
# 1. Build normalized skill catalog
# ──────────────────────────────────────────────────────────

EXCLUDE = {"package.json", "package-lock.json", "test-cookie-persistence.mjs"}

def get_skill_ids():
    """Return sorted list of canonical skill IDs (no .mjs extension)."""
    ids = []
    for entry in sorted(SKILLS_DIR.iterdir()):
        name = entry.name
        if name in EXCLUDE:
            continue
        skill_id = name.replace(".mjs", "")
        ids.append(skill_id)
    return sorted(set(ids))  # dedupe (some exist as both .mjs and dir)

# ──────────────────────────────────────────────────────────
# 2. Skill categories — group skills by functional domain
# ──────────────────────────────────────────────────────────

# Skill prefix/keyword -> category tag
SKILL_CATEGORIES = {
    # GHL / CRM
    "ghl":          "ghl",
    "contact-synchronizer": "ghl",
    "custom-value-manager":  "ghl",
    "duplicate-contact-merger": "ghl",
    "opportunity-mover":   "ghl",
    "pipeline-manager":    "ghl",
    "tagging-engine":      "ghl",
    "snapshot-deployer":   "ghl",
    "subaccount-provisioner": "ghl",

    # Funnel
    "funnel":       "funnel",
    "landing-page-builder": "funnel",
    "page-builder": "funnel",
    "checkout-integrator": "funnel",
    "digital-checkout-friction-reduction": "funnel",
    "digital-funnel-conversion-rate-calibration": "funnel",

    # Marketing / Content / Brand
    "brand":        "brand",
    "content":      "content",
    "copywriter":   "content",
    "copywriting":  "content",
    "headline-generator": "content",
    "script-writer":  "content",
    "video-script-writer": "content",
    "blog-post-publisher": "content",
    "social":       "social",
    "youtube-manager": "social",

    # Email / Messaging
    "email":        "email",
    "mailchimp":    "email",
    "deliverability": "email",
    "sms-compliance-checker": "messaging",

    # SEO / Affiliate
    "seo":          "seo",
    "affiliate":    "affiliate",
    "keyword-finder": "seo",
    "broken-link-checker": "seo",
    "utm-tracking-generator": "seo",

    # Analytics / Reporting
    "analytics-dashboard": "analytics",
    "ga4-report-generator": "analytics",
    "executive-dashboarder": "analytics",
    "weekly-report":  "analytics",
    "cohort-analysis": "analytics",
    "campaign-analyst": "analytics",
    "revenue-attribution": "analytics",

    # Sales
    "deal-closer":    "sales",
    "objection-handler": "sales",
    "proposal":       "sales",
    "offer":          "sales",
    "pricing-strategist": "sales",
    "guarantee-designer": "sales",
    "sales-page-optimizer": "sales",
    "lead-magnet-creator": "sales",
    "lead-scoring-algorithm": "sales",
    "predictive-scoring": "sales",

    # eCommerce
    "ecommerce":    "ecommerce",
    "woocommerce-manager": "ecommerce",
    "wordpress-divi-manager": "ecommerce",
    "coupon-and-promo-creator": "ecommerce",
    "invoice-generator":  "ecommerce",
    "stripe-transaction-exporter": "ecommerce",

    # Coaching
    "coaching":     "coaching",
    "course-builder": "coaching",
    "curriculum-generator": "coaching",
    "membership-content-uploader": "coaching",

    # Community
    "community":    "community",
    "comment-moderation-sop": "community",

    # Education
    "education":    "education",

    # Agency / Consulting
    "agency":       "agency",

    # AI / SaaS Ops
    "aisaas":       "aisaas",

    # Digital Products
    "digital":      "digital",

    # Finance
    "finance":      "finance",

    # Browser / Automation
    "browser":      "browser",
    "automation-logic-designer": "automation",
    "workflow-loop-detector": "automation",
    "webhook":      "automation",

    # Infrastructure / Ops
    "anomaly-detection": "ops",
    "backup-manager":    "ops",
    "access-control-manager": "ops",
    "agent-coordinator": "ops",
    "agent-performance": "ops",
    "idempotency-practices": "ops",
    "retry-backoff-wrapper": "ops",
    "knowledge-base-builder": "ops",
    "notion-workspace-synchronizer": "ops",

    # Voice / AI
    "voice-ai":     "voice",
    "nlp-query":    "ai",

    # Design
    "design-generator": "design",
    "canva-auth":      "design",
    "asset-library-manager": "design",
    "digital-asset-formatting": "design",

    # Ads
    "ad-audience-sync": "ads",
    "split-test-monitor": "ads",
    "ab-testing":  "ads",
    "niche-validator": "ads",
    "market-intel": "ads",
    "competitor-watch": "ads",
    "trend-spotter": "ads",
    "audience-analyzer": "ads",

    # Scheduling / Calendar
    "calendar-booking-bot": "scheduling",
    "content-scheduler": "scheduling",

    # Support
    "ticket-router":  "support",
    "csat-collector":  "support",
    "testimonial-collector": "support",
    "zendesk-ticket-router": "support",

    # Integration
    "domain-connector":  "integration",
    "form-and-survey-builder": "integration",
    "form-field-mapper":  "integration",
    "google-drive-manager": "integration",
    "slack-channel-broadcaster": "integration",
    "hubspot-contact-updater": "integration",
    "salesforce-lead-creator": "integration",

    # Subscription / Dunning
    "subscription-dunning-manager": "subscription",
    "churn":       "subscription",
    "abandoned-cart-recovery": "subscription",

    # Assessment
    "assessment-handler": "assessment",
    "approval-rubric":    "assessment",

    # Traffic
    "traffic-coordinator": "traffic",
    "webinar-engine":  "traffic",

    # Publishing-specific
    "ebook-buyer-automation": "publishing",

    # Delivery
    "delivery-system": "delivery",

    # Price research
    "price-researcher": "research",
    "content-gap-finder": "research",
    "digital-content-gap-analysis": "research",
    "digital-customer-avatar-synthesis": "research",
    "digital-market-trend-aggregation": "research",
    "digital-product-ecosystem-mapping": "research",
}


def categorize_skill(skill_id):
    """Return the category for a skill based on prefix matching."""
    # Exact match first
    if skill_id in SKILL_CATEGORIES:
        return SKILL_CATEGORIES[skill_id]
    # Prefix match
    for prefix, cat in SKILL_CATEGORIES.items():
        if skill_id.startswith(prefix):
            return cat
    return "general"


def build_category_map(skill_ids):
    """Build category -> [skill_ids] mapping."""
    cat_map = defaultdict(list)
    for sid in skill_ids:
        cat = categorize_skill(sid)
        cat_map[cat].append(sid)
    return dict(cat_map)


# ──────────────────────────────────────────────────────────
# 3. Agent -> Skills mapping rules
# ──────────────────────────────────────────────────────────

# Division-level base skill categories
DIVISION_SKILLS = {
    "division_1_core_operations": ["analytics", "brand", "ops", "assessment"],
    "division_2_ecommerce":      ["ecommerce", "seo", "ads", "analytics", "design"],
    "division_3_consulting":     ["agency", "sales", "analytics", "content"],
    "division_4_coaching":       ["coaching", "community", "funnel", "content"],
    "division_5_publishing":     ["content", "design", "seo", "publishing"],
    "division_6_nonprofit":      ["community", "education", "analytics", "content"],
    "division_7_shared_services": ["ops", "automation", "browser", "analytics"],
    "division_8_saas_operations": ["ghl", "funnel", "automation", "analytics", "subscription"],
    "division_9_online_store":   ["ecommerce", "seo", "social", "analytics", "design"],
}

# Role-specific skill overrides / additions per agent
AGENT_SKILL_MAP = {
    # ── D1 Core Operations ──
    "d1_ceo": ["analytics", "brand", "assessment", "ops"],
    "d1_cmo": ["brand", "content", "social", "email", "ads", "analytics", "design"],
    "d1_cto": ["aisaas", "ops", "automation", "browser", "integration"],
    "d1_customer_success": ["support", "community", "subscription", "analytics"],
    "d1_data_analyst": ["analytics", "research", "ads"],
    "d1_devops": ["aisaas", "ops", "automation"],
    "d1_fullstack_dev": ["aisaas", "ops", "automation", "integration"],
    "d1_product_dev_manager": ["analytics", "research", "assessment", "ops"],
    "d1_sales_manager": ["sales", "ghl", "analytics", "funnel"],
    "d1_ux_designer": ["design", "analytics", "research"],

    # ── D2 eCommerce ──
    "d2_copywriter": ["content", "seo", "email", "ads"],
    "d2_customer_service": ["support", "ecommerce", "subscription"],
    "d2_digital_marketing": ["ads", "seo", "email", "analytics", "social"],
    "d2_director": ["ecommerce", "analytics", "ads", "sales", "ghl"],
    "d2_graphic_designer": ["design", "brand", "social"],
    "d2_inventory_specialist": ["ecommerce"],
    "d2_paid_ads": ["ads", "analytics", "seo", "social"],
    "d2_seo_strategist": ["seo", "affiliate", "content", "analytics"],
    "d2_store_manager": ["ecommerce", "ghl", "analytics"],
    "d2_web_dev": ["ecommerce", "seo", "integration", "aisaas"],

    # ── D3 Consulting ──
    "d3_admin_coordinator": ["scheduling", "ops", "integration"],
    "d3_biz_dev": ["sales", "ghl", "email", "analytics"],
    "d3_business_analyst": ["analytics", "research", "finance"],
    "d3_ceo": ["agency", "sales", "analytics", "brand"],
    "d3_client_relations": ["support", "analytics", "email", "subscription"],
    "d3_lead_strategist": ["agency", "research", "analytics", "assessment"],
    "d3_marketing_brand": ["brand", "content", "social", "ads", "analytics"],
    "d3_ops_manager": ["agency", "ops", "analytics"],
    "d3_sales_closer": ["sales", "ghl", "analytics"],
    "d3_thought_leadership": ["content", "social", "seo", "brand"],

    # ── D4 Coaching ──
    "d4_client_experience": ["coaching", "support", "scheduling", "community"],
    "d4_community_manager": ["community", "content", "social"],
    "d4_curriculum_head": ["coaching", "education", "content"],
    "d4_cvo": ["coaching", "community", "content", "brand"],
    "d4_enrollment": ["sales", "ghl", "funnel", "coaching"],
    "d4_funnel_strategist": ["funnel", "ghl", "email", "ads", "analytics"],
    "d4_lead_coach": ["coaching", "community"],
    "d4_social_creator": ["social", "design", "content", "brand"],
    "d4_tech_automation": ["ghl", "automation", "integration", "funnel"],
    "d4_video_production": ["content", "design", "social"],

    # ── D5 Publishing ──
    "d5_acquisitions": ["research", "assessment", "agency"],
    "d5_author_relations": ["support", "scheduling", "email"],
    "d5_book_marketing": ["ads", "social", "email", "content", "analytics"],
    "d5_copywriter": ["content", "seo", "brand"],
    "d5_cover_artist": ["design", "brand"],
    "d5_digital_distribution": ["ecommerce", "analytics", "seo"],
    "d5_managing_editor": ["content", "assessment", "scheduling"],
    "d5_pr_media": ["content", "social", "brand"],
    "d5_publisher": ["analytics", "content", "publishing", "brand"],
    "d5_sales_affiliate": ["affiliate", "sales", "analytics", "ecommerce"],

    # ── D6 Nonprofit ──
    "d6_board_liaison": ["scheduling", "ops", "assessment"],
    "d6_communications": ["content", "social", "email", "design", "brand"],
    "d6_coo": ["ops", "analytics", "assessment"],
    "d6_dev_director": ["analytics", "research", "email"],
    "d6_executive_director": ["analytics", "brand", "assessment", "ops"],
    "d6_finance": ["finance", "analytics"],
    "d6_grant_writer": ["content", "research", "finance"],
    "d6_outreach": ["community", "social", "email", "content"],
    "d6_program_director": ["education", "analytics", "community"],
    "d6_volunteer": ["community", "scheduling", "ops"],

    # ── D7 Shared Services ──
    "biz_01_pod_lead": ["ops", "analytics", "ghl", "brand"],
    "biz_02_pod_lead": ["ops", "analytics", "ghl", "coaching"],
    "biz_03_pod_lead": ["ops", "analytics", "ghl", "community"],
    "biz_04_pod_lead": ["ops", "analytics", "ghl", "publishing"],
    "biz_05_pod_lead": ["ops", "analytics", "ghl", "agency"],
    "biz_06_pod_lead": ["ops", "analytics", "ghl", "community"],
    "biz_07_pod_lead": ["ops", "analytics", "ghl", "ecommerce"],
    "biz_08_pod_lead": ["ops", "analytics", "ghl", "subscription"],
    "biz_09_pod_lead": ["ops", "analytics", "ghl"],
    "biz_10_pod_lead": ["ops", "analytics", "ghl", "finance"],
    "browser_primary": ["browser", "ghl", "automation", "design"],
    "browser_secondary": ["browser", "automation"],
    "shared_api_gateway": ["ops", "automation", "aisaas", "integration"],
    "shared_data_analytics": ["analytics", "research", "ops"],
    "shared_data_control": ["ops", "automation", "assessment"],
    "shared_exec_orchestrator": ["ops", "analytics", "assessment"],
    "shared_knowledge_base": ["ops", "research", "content"],
    "shared_legal_compliance": ["assessment", "ops", "finance"],
    "shared_master_orchestrator": ["ops", "automation", "analytics"],
    "shared_runtime_ops": ["ops", "automation", "aisaas"],

    # ── D8 SaaS Operations ──
    "d8_automation_architect": ["ghl", "automation", "funnel", "ops"],
    "d8_community_manager": ["community", "ghl", "social"],
    "d8_compliance_auditor": ["assessment", "ghl", "ops"],
    "d8_content_ops": ["content", "ghl", "social", "email"],
    "d8_crm_ops": ["ghl", "analytics", "ops", "automation"],
    "d8_customer_success": ["support", "ghl", "subscription", "analytics"],
    "d8_funnel_engineer": ["funnel", "ghl", "ads", "analytics"],
    "d8_integration_engineer": ["ghl", "automation", "integration", "aisaas"],
    "d8_marketing_automation": ["ghl", "email", "funnel", "ads", "automation"],
    "d8_membership_director": ["ghl", "coaching", "subscription", "funnel"],
    "d8_platform_architect": ["ghl", "aisaas", "ops", "automation", "integration"],
    "d8_revenue_ops": ["analytics", "ecommerce", "subscription", "ghl", "finance"],
    "d8_saas_director": ["analytics", "ghl", "subscription", "ops"],

    # ── D9 Online Store ──
    "d9_analytics": ["analytics", "research", "seo", "ecommerce"],
    "d9_customer_experience": ["support", "ecommerce", "community"],
    "d9_merchandiser": ["ecommerce", "design", "analytics"],
    "d9_offer_strategist": ["sales", "ecommerce", "analytics", "research"],
    "d9_sales_copywriter": ["content", "seo", "email", "ecommerce"],
    "d9_seo_content": ["seo", "content", "affiliate", "analytics"],
    "d9_social_promoter": ["social", "content", "ads", "analytics"],
    "d9_store_director": ["ecommerce", "analytics", "ops", "sales"],
    "d9_web_designer": ["design", "ecommerce", "seo"],
    "d9_wp_developer": ["ecommerce", "aisaas", "seo", "integration"],
}


def map_skills_to_agent(agent_id, cat_map):
    """Return sorted list of skill IDs assigned to this agent."""
    categories = AGENT_SKILL_MAP.get(agent_id, ["ops", "analytics"])
    skills = set()
    for cat in categories:
        for sid in cat_map.get(cat, []):
            skills.add(sid)
    return sorted(skills)


# ──────────────────────────────────────────────────────────
# 4. Skills registry expansion
# ──────────────────────────────────────────────────────────

# Risk tier rules based on skill category
RISK_TIERS = {
    "ghl": "write_safe",
    "funnel": "write_safe",
    "ecommerce": "write_safe",
    "email": "write_safe",
    "messaging": "write_safe",
    "social": "write_safe",
    "automation": "write_safe",
    "subscription": "write_safe",
    "finance": "irreversible",
    "sales": "draft_only",
    "brand": "draft_only",
    "content": "draft_only",
    "coaching": "draft_only",
    "community": "draft_only",
    "education": "draft_only",
    "agency": "draft_only",
    "publishing": "draft_only",
    "design": "draft_only",
    "analytics": "draft_only",
    "research": "draft_only",
    "ads": "draft_only",
    "seo": "draft_only",
    "affiliate": "draft_only",
    "aisaas": "write_safe",
    "ops": "write_safe",
    "browser": "write_safe",
    "support": "draft_only",
    "integration": "write_safe",
    "scheduling": "draft_only",
    "assessment": "draft_only",
    "traffic": "draft_only",
    "delivery": "write_safe",
    "voice": "write_safe",
    "ai": "draft_only",
    "general": "draft_only",
    "digital": "draft_only",
}

# Side effects by category
SIDE_EFFECTS = {
    "ghl": ["ghl_api_call"],
    "funnel": ["ghl_api_call", "page_modification"],
    "ecommerce": ["payment_action", "product_modification"],
    "email": ["email_send"],
    "messaging": ["sms_send"],
    "social": ["social_post"],
    "automation": ["workflow_trigger"],
    "subscription": ["payment_action"],
    "finance": ["payment_action"],
    "browser": ["browser_automation"],
    "ops": ["system_modification"],
    "integration": ["external_api_call"],
    "delivery": ["file_delivery"],
    "voice": ["voice_call"],
}

# Approval policies by category
APPROVAL_POLICIES = {
    "ghl": "hitl for ghl_write",
    "funnel": "hitl for production deploy",
    "ecommerce": "hitl for payment_action",
    "email": "hitl for bulk_send",
    "messaging": "hitl for sms_send",
    "social": "hitl for public post",
    "subscription": "hitl for payment_action",
    "finance": "hitl for all financial actions",
    "browser": "hitl for ghl_ui_action",
    "automation": "hitl for production workflow",
}


def build_registry_entry(skill_id, category):
    """Build a skills-registry.json entry for a skill."""
    return {
        "skill_id": skill_id,
        "owner": f"{category}-ops",
        "risk_tier": RISK_TIERS.get(category, "draft_only"),
        "side_effects": SIDE_EFFECTS.get(category, []),
        "external_systems": [],
        "idempotency_key_strategy": f"{skill_id}_id + timestamp",
        "approval_policy": APPROVAL_POLICIES.get(category, "none"),
        "replay_policy": "safe to replay",
        "required_tests": ["scope enforcement"],
    }


# ──────────────────────────────────────────────────────────
# 5. Main execution
# ──────────────────────────────────────────────────────────

def main():
    # Build skill catalog
    all_skill_ids = get_skill_ids()
    print(f"Skill catalog: {len(all_skill_ids)} unique skills")

    cat_map = build_category_map(all_skill_ids)
    print(f"Categories: {len(cat_map)}")
    for cat, sids in sorted(cat_map.items()):
        print(f"  {cat}: {len(sids)} skills")

    # Load agents config
    agents_config = json.loads(AGENTS_CONFIG.read_text())
    agent_lookup = {a["agent_id"]: a for a in agents_config["agents"]}

    # Map skills to all agents
    assignments = {}
    total_assignments = 0
    for agent_id in sorted(agent_lookup.keys()):
        skills = map_skills_to_agent(agent_id, cat_map)
        assignments[agent_id] = skills
        total_assignments += len(skills)

    print(f"\nSkill assignments: {total_assignments} total across {len(assignments)} agents")
    print(f"  Average skills per agent: {total_assignments / len(assignments):.1f}")
    min_skills = min(len(s) for s in assignments.values())
    max_skills = max(len(s) for s in assignments.values())
    print(f"  Range: {min_skills} - {max_skills} skills per agent")

    # Update agents_config.json with skills
    for agent in agents_config["agents"]:
        agent_id = agent["agent_id"]
        agent["skills"] = assignments.get(agent_id, [])

    with open(AGENTS_CONFIG, "w") as f:
        json.dump(agents_config, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\n✅ Updated agents_config.json with skill assignments")

    # Update openclaw.json with skills per agent
    for config_path in [OPENCLAW_DEV, OPENCLAW_PROD]:
        config = json.loads(config_path.read_text())
        for agent_entry in config["agents"]["list"]:
            aid = agent_entry["id"]
            if aid in assignments:
                agent_entry["skills"] = assignments[aid]
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Updated {config_path.name} with skill assignments")

    # Expand skills-registry.json
    registry = json.loads(SKILLS_REG.read_text())
    existing_ids = {s["skill_id"] for s in registry["skills"]}

    # Collect all assigned skill IDs
    assigned_skills = set()
    for skills_list in assignments.values():
        assigned_skills.update(skills_list)

    # Add missing skills to registry
    added = 0
    for sid in sorted(assigned_skills):
        if sid not in existing_ids:
            cat = categorize_skill(sid)
            entry = build_registry_entry(sid, cat)
            registry["skills"].append(entry)
            added += 1

    # Sort registry by skill_id
    registry["skills"].sort(key=lambda s: s["skill_id"])

    with open(SKILLS_REG, "w") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"✅ Updated skills-registry.json: {added} new skills registered (total: {len(registry['skills'])})")

    # Summary report
    print("\n── Assignment Summary ──")
    for div in sorted(set(a["org_unit"] for a in agents_config["agents"])):
        div_agents = [a for a in agents_config["agents"] if a["org_unit"] == div]
        total = sum(len(a["skills"]) for a in div_agents)
        print(f"  {div}: {len(div_agents)} agents, {total} total skill assignments")


if __name__ == "__main__":
    main()
