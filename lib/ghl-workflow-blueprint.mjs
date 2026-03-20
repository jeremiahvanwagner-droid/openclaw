import { resolve as resolveTenant } from './ghl-tenant-resolver.mjs';

function unique(values) {
  return Array.from(new Set(values));
}

function normalizeBaseUrl(baseUrl) {
  const sanitized = String(baseUrl || '').trim();
  if (!sanitized) {
    throw new Error('A public webhook base URL is required');
  }
  return sanitized.endsWith('/') ? sanitized : `${sanitized}/`;
}

function resolveDestinationUrl(baseUrl, handlerPath = '/webhook/ghl') {
  return new URL(handlerPath.replace(/^\//, ''), normalizeBaseUrl(baseUrl)).toString();
}

function buildAuthTemplate(authMode) {
  if (authMode === 'none') {
    return { mode: 'none', headers: {} };
  }

  if (authMode === 'hmac') {
    return {
      mode: 'hmac',
      headers: {
        'X-OpenClaw-Signature': 'HMAC_SHA256(raw_json_body, OPENCLAW_GHL_WEBHOOK_SECRET)',
      },
      secret_ref: 'OPENCLAW_GHL_WEBHOOK_SECRET',
    };
  }

  return {
    mode: 'bearer',
    headers: {
      Authorization: 'Bearer ${OPENCLAW_GATEWAY_AUTH_TOKEN}',
    },
    token_ref: 'OPENCLAW_GATEWAY_AUTH_TOKEN',
  };
}

function inferPrimaryLane(eventType) {
  if (eventType.startsWith('payment.') || eventType.startsWith('subscription.')) return 'revenue';
  if (eventType.startsWith('appointment.')) return 'sales';
  if (eventType.startsWith('opportunity.')) return 'sales';
  if (eventType === 'funnel.page.visited') return 'marketing';
  if (eventType === 'form.submitted') return 'marketing';
  return 'crm';
}

export function resolveBusinessLocationSelector(business) {
  const locationSelector = business.ghl_location_selector
    || business.ghl_location_id
    || business.locationId
    || business.location_id
    || '';
  let locationId = locationSelector;

  if (locationSelector) {
    try {
      const resolved = resolveTenant(locationSelector);
      locationId = resolved.locationId || locationSelector;
    } catch {
      locationId = locationSelector;
    }
  }

  return {
    locationSelector,
    locationId,
    mapped: Boolean(locationSelector),
    mappingStatus: locationSelector ? 'mapped' : 'pending_location_mapping',
  };
}

export function deriveBusinessWorkflowEvents(business) {
  const blueprint = business.automation_blueprint || {};
  const events = [
    'contact.created',
    'contact.updated',
    'opportunity.created',
    'opportunity.stage.changed',
    'opportunity.status.changed',
    'appointment.created',
    'appointment.cancelled',
  ];

  if (blueprint.forms_surveys_quizzes || blueprint.nurture_workflows || blueprint.onboarding_workflows) {
    events.push('form.submitted');
  }

  if (blueprint.no_show_recovery) {
    events.push('appointment.noshow');
  }

  if (blueprint.billing_and_dunning || blueprint.fulfillment_access_rules || blueprint.review_request_workflow) {
    events.push('payment.received');
  }

  if (blueprint.billing_and_dunning || business.membership_enabled || business.membership?.enabled) {
    events.push('subscription.created', 'subscription.cancelled');
  }

  if (
    business.vertical === 'ecommerce'
    || blueprint.nurture_workflows
    || (Array.isArray(business.pipeline_set) && business.pipeline_set.includes('abandoned_cart'))
  ) {
    events.push('funnel.page.visited');
  }

  if (blueprint.custom_values || blueprint.nurture_workflows) {
    events.push('contact.tag.added');
  }

  return unique(events).sort();
}

export function buildInboundWorkflowRecommendations(business) {
  const blueprint = business.automation_blueprint || {};
  const recommendations = [
    {
      trigger_key: `${business.business_id}.ops.exception`,
      purpose: 'Escalate exception events back into a GHL workflow for review and remediation.',
      recommended_when: blueprint.exception_rules,
    },
    {
      trigger_key: `${business.business_id}.onboarding.start`,
      purpose: 'Start or resume onboarding workflows from OpenClaw after provisioning or payment checks.',
      recommended_when: blueprint.onboarding_workflows,
    },
    {
      trigger_key: `${business.business_id}.nurture.enroll`,
      purpose: 'Enroll contacts into nurture workflows from OpenClaw scoring or segmentation decisions.',
      recommended_when: blueprint.nurture_workflows,
    },
    {
      trigger_key: `${business.business_id}.billing.recovery`,
      purpose: 'Re-enter dunning or revenue-recovery workflows from OpenClaw detection and retry logic.',
      recommended_when: blueprint.billing_and_dunning,
    },
  ];

  return recommendations.filter(item => item.recommended_when);
}

export function buildBusinessWorkflowWebhookBlueprint(business, options = {}) {
  const {
    baseUrl,
    handlerPath = '/webhook/ghl',
    authMode = 'bearer',
    source = 'portfolio_bootstrap',
  } = options;

  const destinationUrl = resolveDestinationUrl(baseUrl, handlerPath);
  const auth = buildAuthTemplate(authMode);
  const location = resolveBusinessLocationSelector(business);
  const outboundEvents = deriveBusinessWorkflowEvents(business);
  const inboundRecommendations = buildInboundWorkflowRecommendations(business);

  const outboundWebhooks = outboundEvents.map(eventType => ({
    business_id: business.business_id,
    business_name: business.business_name,
    pod_id: business.pod_id,
    owner_pod: business.owner_pod,
    rollout_wave: business.rollout_wave,
    scope_family: business.scope_family,
    resolved_ghl_scope_type: business.resolved_ghl_scope_type,
    locationId: location.locationId || '',
    locationSelector: location.locationSelector || '',
    location_mapping_status: location.mappingStatus,
    direction: 'outbound',
    event: eventType,
    url: destinationUrl,
    method: 'POST',
    auth,
    primary_lane: inferPrimaryLane(eventType),
    active: true,
    source,
    request_template: {
      body: {
        type: eventType,
        businessId: business.business_id,
        podId: business.pod_id,
        locationId: location.locationSelector || '${GHL_LOCATION_ID}',
        source: 'ghl_workflow_webhook',
      },
    },
  }));

  return {
    business_id: business.business_id,
    business_name: business.business_name,
    pod_id: business.pod_id,
    rollout_wave: business.rollout_wave,
    vertical: business.vertical,
    destination_url: destinationUrl,
    location_mapping_status: location.mappingStatus,
    location_selector: location.locationSelector || null,
    outbound_webhooks: outboundWebhooks,
    inbound_recommendations: inboundRecommendations,
  };
}

export function buildPortfolioWorkflowWebhookPlan(registry, options = {}) {
  const businessPlans = registry.businesses.map(business =>
    buildBusinessWorkflowWebhookBlueprint(business, options),
  );
  const outboundEntries = businessPlans.flatMap(plan => plan.outbound_webhooks);
  const mappedEntries = outboundEntries.filter(entry => entry.location_mapping_status === 'mapped');

  return {
    generated_at: new Date().toISOString(),
    portfolio_name: registry.portfolio_name,
    base_url: normalizeBaseUrl(options.baseUrl).replace(/\/$/, ''),
    handler_path: options.handlerPath || '/webhook/ghl',
    auth_mode: options.authMode || 'bearer',
    total_businesses: businessPlans.length,
    total_outbound_webhooks: outboundEntries.length,
    mapped_businesses: businessPlans.filter(plan => plan.location_mapping_status === 'mapped').length,
    pending_location_mapping_businesses: businessPlans.filter(
      plan => plan.location_mapping_status !== 'mapped',
    ).length,
    mapped_outbound_webhooks: mappedEntries.length,
    pending_outbound_webhooks: outboundEntries.length - mappedEntries.length,
    businesses: businessPlans,
    outbound_webhooks: outboundEntries,
  };
}
