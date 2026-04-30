/**
 * Mailchimp Campaign Drafter — Browser automation instruction wrapper.
 * Draft-only by default. Never sends without explicit approval.
 */

export function buildCampaignCreationSteps(campaignName, subject, preheader) {
  return [
    { action: 'navigate', url: 'https://mailchimp.com/', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map initial Mailchimp UI', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref campaigns_menu>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map campaigns list', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref create_campaign>', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref email_campaign_type>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map new campaign setup form', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref campaign_name_input>', value: campaignName, browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref subject_input>', value: subject, browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref preheader_input>', value: preheader, browser_profile: 'openclaw' },
  ];
}

export function buildAudienceSelectionSteps(audienceName) {
  return [
    { action: 'snapshot', reason: 'map audience selector', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref audience_dropdown>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'see audience options', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref audience_${audienceName.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' },
  ];
}

export function buildContentSteps(emailBody, ctaText) {
  return [
    { action: 'snapshot', reason: 'map content editor', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref edit_content>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map body block', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref body_block>', value: emailBody, browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref cta_block>', value: ctaText, browser_profile: 'openclaw' },
  ];
}

export function buildSaveStep(scheduleAt = null) {
  const steps = [
    { action: 'click', ref: '<ref save_or_continue>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify draft saved', browser_profile: 'openclaw' },
  ];
  if (scheduleAt) {
    steps.push({ action: 'click', ref: '<ref schedule_button>', browser_profile: 'openclaw' }, { action: 'type', ref: '<ref schedule_datetime>', value: scheduleAt, browser_profile: 'openclaw' }, { action: 'click', ref: '<ref confirm_schedule>', browser_profile: 'openclaw' });
  }
  return steps;
}

export function generateDraftPlan(campaignName, audience, subject, preheader, emailBody, ctaText, options = {}) {
  const { scheduleAt, sendApproved = false } = options;
  return {
    campaign_name: campaignName,
    audience,
    subject,
    preheader,
    cta: ctaText,
    execution_steps: [
      ...buildCampaignCreationSteps(campaignName, subject, preheader),
      ...buildAudienceSelectionSteps(audience),
      ...buildContentSteps(emailBody, ctaText),
      ...buildSaveStep(sendApproved && scheduleAt ? scheduleAt : null),
    ],
    draft_status: sendApproved && scheduleAt ? 'scheduled' : 'draft',
    send_note: sendApproved ? 'Send approved by user' : 'Draft only — final send NOT executed. Explicit approval required.',
    guardrails: ['--browser-profile openclaw', 'draft-only default', 'validate audience before send', 'preserve compliance footer'],
    output_contract: { campaign_title: campaignName, audience, subject_preheader: `${subject} / ${preheader}`, cta_used: ctaText, draft_status: 'draft', send_executed: false },
  };
}
