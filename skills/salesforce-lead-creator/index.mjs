/**
 * Salesforce Lead Creator — Browser automation instruction wrapper.
 * Never converts/deletes leads unless explicitly requested.
 */

export function buildNavigationSteps() {
  return [
    { action: 'navigate', url: 'https://login.salesforce.com/', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map initial Salesforce UI', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref app_launcher_or_leads_tab>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map app launcher or nav', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref leads_object>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm Leads list view', browser_profile: 'openclaw' },
  ];
}

export function buildDuplicateCheckSteps(email, company) {
  return [
    { action: 'click', ref: '<ref search_or_filter>', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref search_input>', value: email ?? company, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'check for existing leads with same email/company', browser_profile: 'openclaw' },
    { action: 'read', ref: '<ref search_results>', note: 'If match found, confirm with user before creating duplicate' },
  ];
}

export function buildLeadFieldSteps(lead) {
  return [
    { action: 'click', ref: '<ref new_lead_button>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map new lead form', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref first_name_input>', value: lead.first_name ?? '', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref last_name_input>', value: lead.last_name, browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref company_input>', value: lead.company, browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref email_input>', value: lead.email ?? '', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref lead_source_dropdown>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map lead source options', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref lead_source_${(lead.source ?? 'web').replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' },
    ...(lead.owner ? [{ action: 'click', ref: '<ref owner_dropdown_optional>', browser_profile: 'openclaw' }, { action: 'snapshot', reason: 'map owner options', browser_profile: 'openclaw' }, { action: 'click', ref: `<ref owner_${lead.owner.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' }] : []),
  ];
}

export function buildSaveVerifySteps() {
  return [
    { action: 'click', ref: '<ref save_button>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify lead name, status, and owner render', browser_profile: 'openclaw' },
    { action: 'read', refs: ['<ref lead_name_confirmed>', '<ref lead_status_confirmed>', '<ref lead_owner_confirmed>'], note: 'Confirm all key fields display on the record page' },
  ];
}

export function generateLeadCreationPlan(leads, options = {}) {
  return {
    total_leads: leads.length,
    execution_plan: leads.map((lead, i) => ({
      lead_index: i + 1,
      lead: { name: `${lead.first_name ?? ''} ${lead.last_name}`.trim(), company: lead.company, email: lead.email },
      steps: [
        ...buildNavigationSteps(),
        ...buildDuplicateCheckSteps(lead.email, lead.company),
        ...buildLeadFieldSteps(lead),
        ...buildSaveVerifySteps(),
      ],
    })),
    guardrails: ['--browser-profile openclaw', 'snapshot before every action', 'confirm duplicate before creating', 'do not convert/delete unless explicitly requested'],
    output_contract: { leads_created: 0, fields_captured: ['first_name', 'last_name', 'company', 'email', 'source', 'owner'], skipped: [], skip_reasons: [] },
  };
}
