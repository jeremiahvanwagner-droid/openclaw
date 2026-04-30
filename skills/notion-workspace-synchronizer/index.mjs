/**
 * Notion Workspace Synchronizer — Browser automation instruction wrapper.
 * Never archives/deletes pages unless explicitly requested.
 */

export function buildNavigationSteps(databaseName) {
  return [
    { action: 'navigate', url: 'https://www.notion.so/', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map Notion workspace UI', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref search_or_sidebar_database_link>', browser_profile: 'openclaw' },
    { action: 'type', ref: '<ref search_input_optional>', value: databaseName, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'see search results', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref target_database>', browser_profile: 'openclaw' },
  ];
}

export function buildRowUpdateSteps(rowIdentifier, updates) {
  const steps = [
    { action: 'snapshot', reason: 'map database rows', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref row_${rowIdentifier.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm target page opened', browser_profile: 'openclaw' },
  ];
  for (const update of updates) {
    if (update.type === 'status') {
      steps.push({ action: 'click', ref: '<ref status_property>', browser_profile: 'openclaw' }, { action: 'snapshot', reason: 'map status options', browser_profile: 'openclaw' }, { action: 'click', ref: `<ref status_${update.value.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' });
    } else if (update.type === 'owner') {
      steps.push({ action: 'click', ref: '<ref owner_property_optional>', browser_profile: 'openclaw' }, { action: 'snapshot', reason: 'map owner options', browser_profile: 'openclaw' }, { action: 'click', ref: `<ref owner_${update.value.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' });
    } else if (update.type === 'due_date') {
      steps.push({ action: 'click', ref: '<ref due_date_property_optional>', browser_profile: 'openclaw' }, { action: 'snapshot', reason: 'map date picker', browser_profile: 'openclaw' }, { action: 'type', ref: '<ref due_date_input_optional>', value: update.value, browser_profile: 'openclaw' });
    } else {
      steps.push({ action: 'click', ref: `<ref ${update.field}_property>`, browser_profile: 'openclaw' }, { action: 'type', ref: `<ref ${update.field}_input>`, value: update.value, browser_profile: 'openclaw' });
    }
  }
  steps.push({ action: 'snapshot', reason: 'verify updated properties render correctly', browser_profile: 'openclaw' });
  return steps;
}

export function generateSyncPlan(databaseName, records, batchSize = 5) {
  const batches = [];
  for (let i = 0; i < records.length; i += batchSize) batches.push(records.slice(i, i + batchSize));
  return {
    database: databaseName,
    total_records: records.length,
    batch_count: batches.length,
    execution_plan: batches.map((batch, idx) => ({
      batch: idx + 1,
      records: batch.map(r => r.identifier),
      steps: [
        ...buildNavigationSteps(databaseName),
        ...batch.flatMap(r => buildRowUpdateSteps(r.identifier, r.updates)),
        { action: 'snapshot', reason: `inter-batch verification after batch ${idx + 1}`, browser_profile: 'openclaw' },
      ],
    })),
    guardrails: ['--browser-profile openclaw', 'snapshot before each edit', 'confirm database before editing', 'do not archive/delete unless explicitly requested'],
    output_contract: { records_synced: 0, fields_updated: [], conflicts_skipped: [] },
  };
}
