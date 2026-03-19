import { describe, expect, it } from 'vitest';

import {
  buildBusinessWorkflowWebhookBlueprint,
  buildPortfolioWorkflowWebhookPlan,
  deriveBusinessWorkflowEvents,
} from '../ghl-workflow-blueprint.mjs';

const sampleBusiness = {
  business_id: 'biz_test',
  business_name: 'Test Business',
  pod_id: 'biz_test',
  owner_pod: 'biz_test_pod_lead',
  rollout_wave: 2,
  vertical: 'ecommerce',
  scope_family: 'dedicated',
  resolved_ghl_scope_type: 'dedicated_subaccount',
  membership_enabled: true,
  pipeline_set: ['abandoned_cart'],
  automation_blueprint: {
    forms_surveys_quizzes: true,
    onboarding_workflows: true,
    nurture_workflows: true,
    no_show_recovery: true,
    billing_and_dunning: true,
    fulfillment_access_rules: true,
    review_request_workflow: true,
    custom_values: true,
    exception_rules: true,
  },
};

describe('ghl-workflow-blueprint', () => {
  it('derives the expected outbound GHL workflow events from the automation blueprint', () => {
    const events = deriveBusinessWorkflowEvents(sampleBusiness);

    expect(events).toContain('contact.created');
    expect(events).toContain('form.submitted');
    expect(events).toContain('payment.received');
    expect(events).toContain('subscription.created');
    expect(events).toContain('appointment.noshow');
    expect(events).toContain('funnel.page.visited');
    expect(events).toContain('contact.tag.added');
  });

  it('builds a business webhook blueprint with pending location mapping when no location is supplied', () => {
    const blueprint = buildBusinessWorkflowWebhookBlueprint(sampleBusiness, {
      baseUrl: 'https://agents.truthjblue.com',
      authMode: 'bearer',
    });

    expect(blueprint.destination_url).toBe('https://agents.truthjblue.com/webhook/ghl');
    expect(blueprint.location_mapping_status).toBe('pending_location_mapping');
    expect(blueprint.outbound_webhooks.length).toBeGreaterThan(5);
    expect(blueprint.inbound_recommendations.length).toBeGreaterThan(0);
    expect(blueprint.outbound_webhooks[0].auth.mode).toBe('bearer');
  });

  it('summarizes mapped vs pending businesses for the portfolio plan', () => {
    const mappedBusiness = {
      ...sampleBusiness,
      business_id: 'biz_mapped',
      ghl_location_id: 'loc_123',
    };

    const plan = buildPortfolioWorkflowWebhookPlan({
      portfolio_name: 'Test Portfolio',
      businesses: [sampleBusiness, mappedBusiness],
    }, {
      baseUrl: 'https://agents.truthjblue.com',
      authMode: 'hmac',
    });

    expect(plan.total_businesses).toBe(2);
    expect(plan.mapped_businesses).toBe(1);
    expect(plan.pending_location_mapping_businesses).toBe(1);
    expect(plan.auth_mode).toBe('hmac');
    expect(plan.outbound_webhooks.some(entry => entry.location_mapping_status === 'mapped')).toBe(true);
  });
});
