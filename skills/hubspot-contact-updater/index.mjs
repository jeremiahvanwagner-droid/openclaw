/**
 * HubSpot Contact Updater — Browser automation instruction wrapper.
 * Executes via `openclaw browser` CLI using snapshot-driven refs.
 * Never guesses selectors; always snapshot → act on returned ref.
 */

export function buildSearchSteps(emailOrName) {
  return [
    { action: 'navigate', url: 'https://app.hubspot.com/contacts', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map initial contacts UI', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref search_box>', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref search_box>', value: emailOrName, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'see search results', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref matching_contact_row>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm contact identity (email + name)', browser_profile: 'openclaw' },
  ];
}

export function buildFieldUpdateSteps(fieldUpdates) {
  const steps = [];
  for (const update of fieldUpdates) {
    steps.push(
      { action: 'click', ref: `<ref property_or_edit_button_${update.field}>`, browser_profile: 'openclaw' },
      { action: 'snapshot', reason: `map field editor for ${update.field}`, browser_profile: 'openclaw' },
      { action: 'click', ref: `<ref field_input_${update.field}>`, browser_profile: 'openclaw' },
      { action: 'type', ref: `<ref field_input_${update.field}>`, value: update.value, browser_profile: 'openclaw' },
    );
  }
  return steps;
}

export function buildSaveAndVerifySteps(fieldUpdates) {
  return [
    { action: 'click', ref: '<ref save_button>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify all updated values are visible', browser_profile: 'openclaw' },
    { action: 'read', refs: fieldUpdates.map(u => `<ref verified_${u.field}_value>`), note: 'Confirm each field reflects the new value' },
  ];
}

export function generateUpdatePlan(contacts, fieldUpdates, options = {}) {
  const { batchSize = 5 } = options;
  const batches = [];
  for (let i = 0; i < contacts.length; i += batchSize) {
    batches.push(contacts.slice(i, i + batchSize));
  }
  return {
    total_contacts: contacts.length,
    batch_count: batches.length,
    batch_size: batchSize,
    fields_to_update: fieldUpdates.map(u => u.field),
    execution_plan: batches.map((batch, idx) => ({
      batch: idx + 1,
      contacts: batch,
      steps: batch.flatMap(contact => [
        ...buildSearchSteps(contact.email ?? contact.name),
        ...buildFieldUpdateSteps(fieldUpdates),
        ...buildSaveAndVerifySteps(fieldUpdates),
        { action: 'snapshot', reason: `inter-batch snapshot after batch ${idx + 1}`, browser_profile: 'openclaw' },
      ]),
    })),
    guardrails: ['Use --browser-profile openclaw', 'snapshot between batches', 'confirm contact identity before saving', 'do not delete/create records'],
    output_contract: { contacts_updated: 0, fields_changed: fieldUpdates.map(u => u.field), records_skipped: [], skipped_reasons: [] },
  };
}
