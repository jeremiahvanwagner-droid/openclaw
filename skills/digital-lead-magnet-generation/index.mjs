import { supabase } from '../../lib/agent-memory.js';

const MAGNET_TABLE = 'digital_lead_magnets';

const FORMAT_MAP = {
  checklist:  { effort: 'low',    perceived_value: 'medium', best_for: 'action-oriented audiences' },
  mini_guide: { effort: 'medium', perceived_value: 'high',   best_for: 'educational audiences' },
  swipe_file: { effort: 'low',    perceived_value: 'high',   best_for: 'copywriting/marketing niches' },
  template:   { effort: 'medium', perceived_value: 'high',   best_for: 'productivity and business niches' },
  video:      { effort: 'high',   perceived_value: 'very_high', best_for: 'high-ticket audiences' },
};

export function defineTargetAndOutcome(audience, quickWin, funnelIntent) {
  return { audience, quick_win: quickWin, funnel_intent: funnelIntent, hook: `Get ${quickWin} in the next 10 minutes` };
}

export function selectFormat(audience, timeAvailable = 'medium') {
  if (timeAvailable === 'low') return { format: 'checklist', ...FORMAT_MAP.checklist };
  if (/marketer|copywriter|advertiser/i.test(audience)) return { format: 'swipe_file', ...FORMAT_MAP.swipe_file };
  if (/entrepreneur|business|agency/i.test(audience)) return { format: 'template', ...FORMAT_MAP.template };
  return { format: 'mini_guide', ...FORMAT_MAP.mini_guide };
}

export function buildStructure(format, topic, quickWin) {
  const structures = {
    checklist: { title: `The ${topic} Quick-Win Checklist`, promise: `Get ${quickWin} in under 30 minutes`, sections: ['Pre-flight checklist', 'Core action steps', 'Completion verification', 'Next steps CTA'] },
    mini_guide: { title: `The ${topic} Mini-Guide`, promise: `Understand exactly how to ${quickWin}`, sections: ['Why this matters', 'The 3-step framework', 'Common mistakes to avoid', 'Your first action step'] },
    template:   { title: `The ${topic} Fill-in Template`, promise: `Start using ${quickWin} today`, sections: ['How to use this template', 'Fill-in sections', 'Examples', 'Customization tips'] },
    swipe_file: { title: `${topic} Swipe File: 15 Proven Examples`, promise: `Copy-paste your way to ${quickWin}`, sections: ['How to use these swipes', 'Headlines', 'CTAs', 'Email subject lines', 'Body copy hooks'] },
  };
  return structures[format] ?? structures.mini_guide;
}

export function formatForDelivery(structure, channel = 'pdf') {
  const formatted = { ...structure, channel, format_notes: channel === 'pdf' ? 'Export as PDF, max 10 pages, A4/Letter size' : channel === 'email' ? 'Plain text friendly, max 800 words' : 'Embed-ready, responsive width' };
  return formatted;
}

export function addCtaPaths(structure, nextOffer) {
  return { ...structure, cta_paths: [{ placement: 'end', text: `Ready for the next step? ${nextOffer}`, style: 'button' }, { placement: 'middle', text: `Want more? Grab the full training →`, style: 'inline_link' }] };
}

export function validateCompliance(structure) {
  const issues = [];
  if (/guaranteed|earn \$|make money fast/i.test(JSON.stringify(structure))) issues.push('Contains income claim language — review for FTC compliance');
  if (/lose \d+ pounds|cure|treat/i.test(JSON.stringify(structure))) issues.push('Contains health claim language — add disclaimer');
  return { valid: issues.length === 0, issues };
}

export async function outputLeadMagnetAssets(audience, topic, quickWin, options = {}) {
  const target = defineTargetAndOutcome(audience, quickWin, options.funnelIntent ?? 'list_growth');
  const format = selectFormat(audience, options.timeAvailable);
  const structure = buildStructure(format.format, topic, quickWin);
  const formatted = formatForDelivery(structure, options.channel ?? 'pdf');
  const withCta = addCtaPaths(formatted, options.nextOffer ?? 'our full course');
  const compliance = validateCompliance(withCta);
  const shortVariant = { ...withCta, title: `Quick: ${topic} in 5 Steps`, sections: withCta.sections.slice(0, 3) };

  const asset = { audience, topic, quick_win: quickWin, format: format.format, primary: withCta, short_variant: shortVariant, compliance, created_at: new Date().toISOString() };
  await supabase.from(MAGNET_TABLE).insert(asset);
  return asset;
}
