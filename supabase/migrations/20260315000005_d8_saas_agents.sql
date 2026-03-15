-- ═══════════════════════════════════════════════════════════════════
-- Open Claw Multi-Agent Network — Division 8 Agent Registration
-- Migration: 005_d8_saas_agents
-- Date: 2026-03-15
-- Registers 13 Division 8 (SaaS Operations) agents
-- ═══════════════════════════════════════════════════════════════════

-- Update agent registry description to reflect 90-agent architecture
COMMENT ON TABLE agents IS 'Open Claw 90-Agent Registry — 8 Divisions + Shared Services';

-- ═══════════════════════════════════════════════════════════════════
-- Division 8 — SaaS Operations Agents (13 agents)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO agents (agent_id, display_name, org_unit, role_type, llm_model, memory_type, status, config)
VALUES
  -- Director
  ('d8_saas_director', 'SaaS Operations Director', 'division_8_saas_operations', 'executive', 'claude-opus-4', 'long-term', 'inactive', '{
    "division": 8,
    "tier": "director",
    "reports_to": "shared_master_orchestrator",
    "manages": ["d8_platform_architect", "d8_revenue_ops", "d8_compliance_auditor", "d8_integration_engineer"],
    "skills": ["campaign-analyst", "executive-dashboarder"]
  }'::jsonb),

  -- Platform & Infrastructure
  ('d8_platform_architect', 'GHL Platform & Auth Architect', 'division_8_saas_operations', 'manager', 'claude-sonnet-4.5', 'long-term', 'inactive', '{
    "division": 8,
    "tier": "manager",
    "reports_to": "d8_saas_director",
    "manages": ["d8_funnel_engineer", "d8_automation_architect", "d8_crm_ops"],
    "skills": ["ghl-api", "ghl-setup-validator", "ghl-oauth-manager", "sub-account-provisioner"]
  }'::jsonb),

  ('d8_funnel_engineer', 'Funnel & Website Engineer', 'division_8_saas_operations', 'specialist', 'claude-sonnet-4.5', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_platform_architect",
    "skills": ["funnel-blueprint-generator", "funnel-cloner", "page-builder", "form-field-mapper", "broken-link-checker"]
  }'::jsonb),

  ('d8_automation_architect', 'Workflow & Automation Architect', 'division_8_saas_operations', 'specialist', 'claude-sonnet-4.5', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_platform_architect",
    "skills": ["workflow-builder", "trigger-link-generator", "email-template-builder", "workflow-loop-detector"]
  }'::jsonb),

  -- Membership & Community
  ('d8_membership_director', 'Course & Membership Director', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_revenue_ops",
    "skills": ["curriculum-generator", "ghl-offer-creator", "membership-content-uploader", "access-control-manager"]
  }'::jsonb),

  ('d8_community_manager', 'Community & Engagement Manager', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_integration_engineer",
    "skills": ["community-group-builder", "community-moderator", "content-scheduler"]
  }'::jsonb),

  -- CRM & Revenue
  ('d8_crm_ops', 'CRM & Conversational AI Ops', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_platform_architect",
    "skills": ["pipeline-stage-mover", "tag-manager", "custom-field-mapper", "contact-segment-builder"]
  }'::jsonb),

  ('d8_revenue_ops', 'E-Commerce & Revenue Ops Manager', 'division_8_saas_operations', 'manager', 'gpt-4o-mini', 'long-term', 'inactive', '{
    "division": 8,
    "tier": "manager",
    "reports_to": "d8_saas_director",
    "manages": ["d8_marketing_automation", "d8_membership_director"],
    "skills": ["invoice-generator", "coupon-manager", "order-fulfillment-tracker"]
  }'::jsonb),

  -- Marketing & Content
  ('d8_marketing_automation', 'Advanced Marketing & Lead Gen', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_revenue_ops",
    "skills": ["ad-audience-sync", "utm-tracking-generator", "lead-scoring-algorithm", "seo-metadata-optimizer"]
  }'::jsonb),

  ('d8_content_ops', 'Content & Asset Operations', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_integration_engineer",
    "skills": ["content-scheduler"]
  }'::jsonb),

  -- Support & Compliance
  ('d8_customer_success', 'Customer Support & Success', 'division_8_saas_operations', 'specialist', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "specialist",
    "reports_to": "d8_compliance_auditor",
    "skills": ["ticket-router", "csat-collector", "knowledge-base-builder", "churn-predictor"]
  }'::jsonb),

  ('d8_compliance_auditor', 'System Auditing & Compliance', 'division_8_saas_operations', 'manager', 'claude-sonnet-4.5', 'long-term', 'inactive', '{
    "division": 8,
    "tier": "manager",
    "reports_to": "d8_saas_director",
    "manages": ["d8_customer_success"],
    "skills": ["broken-link-checker", "split-test-monitor", "deliverability-auditor", "workflow-loop-detector", "duplicate-contact-merger", "sms-compliance-checker"]
  }'::jsonb),

  -- Integration
  ('d8_integration_engineer', 'External Orchestration & Integration', 'division_8_saas_operations', 'manager', 'gpt-4o-mini', 'short-term', 'inactive', '{
    "division": 8,
    "tier": "manager",
    "reports_to": "d8_saas_director",
    "manages": ["d8_content_ops", "d8_community_manager"],
    "skills": ["webhook-payload-formatter", "executive-dashboarder"]
  }'::jsonb)

ON CONFLICT (agent_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  org_unit = EXCLUDED.org_unit,
  role_type = EXCLUDED.role_type,
  llm_model = EXCLUDED.llm_model,
  config = EXCLUDED.config,
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════
-- Initialize heartbeat for all D8 agents
-- ═══════════════════════════════════════════════════════════════════
UPDATE agents
SET last_heartbeat_at = NOW()
WHERE org_unit = 'division_8_saas_operations'
  AND last_heartbeat_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- Create division-scoped memory entries for D8
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO agent_memory (agent_id, content, memory_scope, metadata)
SELECT
  a.agent_id,
  'Division 8 SaaS Operations initialized. Agent ' || a.display_name || ' ready for multi-SaaS portfolio management.',
  'division',
  jsonb_build_object(
    'type', 'system',
    'event', 'agent_registered',
    'division', 'division_8_saas_operations'
  )
FROM agents a
WHERE a.org_unit = 'division_8_saas_operations'
  AND NOT EXISTS (
    SELECT 1 FROM agent_memory m
    WHERE m.agent_id = a.agent_id
      AND m.memory_scope = 'division'
      AND m.metadata->>'event' = 'agent_registered'
  );
