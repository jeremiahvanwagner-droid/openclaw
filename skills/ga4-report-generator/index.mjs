/**
 * GA4 Report Generator — Browser automation instruction wrapper.
 * Executes via `openclaw browser` CLI using snapshot-driven refs.
 * Never infers DOM selectors; always calls snapshot before click/type.
 */

export function buildNavigationSteps(propertyId, reportType, dateRange) {
  return [
    { action: 'navigate', url: 'https://analytics.google.com/', browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'map initial UI', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref property_picker>', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref property_${propertyId}>`, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'confirm property selected', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref reports_menu>', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref ${reportType}_report>`, browser_profile: 'openclaw' },
  ];
}

export function buildDateRangeSteps(datePreset) {
  return [
    { action: 'snapshot', reason: 'map date range control', browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref date_range_control>', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref date_preset_${datePreset.replace(/\s+/g, '_')}>`, browser_profile: 'openclaw' },
    { action: 'click', ref: '<ref apply_button>', browser_profile: 'openclaw' },
  ];
}

export function buildMetricCaptureSteps() {
  return [
    { action: 'snapshot', reason: 'capture metrics', browser_profile: 'openclaw' },
    { action: 'read', refs: ['users_kpi', 'sessions_kpi', 'conversions_kpi', 'revenue_kpi', 'channel_table', 'landing_pages_table'], note: 'Extract values from returned refs' },
  ];
}

export function buildExportSteps(exportFormat = 'csv') {
  return [
    { action: 'click', ref: '<ref share_or_export>', browser_profile: 'openclaw' },
    { action: 'click', ref: `<ref export_${exportFormat}>`, browser_profile: 'openclaw' },
    { action: 'snapshot', reason: 'verify export confirmation', browser_profile: 'openclaw' },
    { action: 'read', ref: '<ref export_confirmation_message>', note: 'Confirm file name and date range in confirmation view' },
  ];
}

export function generateReport(propertyId, reportType, dateRange, exportRequested = false) {
  const steps = [
    ...buildNavigationSteps(propertyId, reportType, dateRange),
    ...buildDateRangeSteps(dateRange),
    ...buildMetricCaptureSteps(),
    ...(exportRequested ? buildExportSteps() : []),
  ];
  return {
    property_id: propertyId,
    report_type: reportType,
    date_range: dateRange,
    execution_steps: steps,
    output_contract: {
      property: propertyId,
      date_range: dateRange,
      kpis: { users: null, sessions: null, conversions: null, revenue: null },
      top_channels: [],
      top_pages: [],
      export_status: exportRequested ? 'pending' : 'not_requested',
    },
    guardrails: ['Use --browser-profile openclaw', 'snapshot before every click', 'confirm property + date before reading metrics', 'do not change admin settings'],
  };
}
