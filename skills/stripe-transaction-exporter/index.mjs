/**
 * Stripe Transaction Exporter — Browser automation instruction wrapper.
 * Never alters billing settings, issues refunds, or disputes unless explicitly requested.
 */

export function buildNavigationSteps(datasetType) {
  const menuRef = datasetType === 'payouts' ? 'payouts_menu' : datasetType === 'refunds' ? 'refunds_tab' : 'payments_or_transactions_menu';
  return [
    { action: 'navigate', url: 'https://dashboard.stripe.com/', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map Stripe dashboard UI', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref ${menuRef}>`, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map target dataset view', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref ${datasetType}_tab_if_applicable>`, browser_profile: 'openclaw' },
  ];
}

export function buildDateFilterSteps(dateRange) {
  return [
    { action: 'snapshot', reason: 'map date filter controls', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref date_filter_control>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map date options', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref date_range_${dateRange.replace(/\s+/g, '_').toLowerCase()}>`, browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref apply_filters_button>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm date filter applied', browser_profile: 'openclaw' },
  ];
}

export function buildExportSteps(format = 'csv') {
  return [
    { action: 'click', ref: '<ref export_button>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map export options', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref export_format_${format}>`, browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref confirm_export>', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify export job success or download availability', browser_profile: 'openclaw' },
    { action: 'read', ref: '<ref export_confirmation_or_download_link>', note: 'Confirm export completed and record download URL or filename' },
  ];
}

export function generateExportPlan(datasetType, dateRange, options = {}) {
  const { format = 'csv', additionalFilters = [] } = options;
  return {
    dataset: datasetType,
    date_range: dateRange,
    export_format: format,
    execution_steps: [
      ...buildNavigationSteps(datasetType),
      ...buildDateFilterSteps(dateRange),
      ...buildExportSteps(format),
    ],
    guardrails: ['--browser-profile openclaw', 'confirm account + date range before export', 'do not issue refunds or alter billing settings', 'validate export format + completion confirmation'],
    output_contract: { dataset_exported: datasetType, date_range: dateRange, filters_used: additionalFilters, export_format: format, completion_status: 'pending', failed_attempts: [] },
  };
}
