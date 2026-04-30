import { supabase } from '../../lib/agent-memory.js';

const ECOSYSTEM_TABLE = 'digital_product_ecosystems';
const PATH_TABLE      = 'digital_progression_paths';

const OFFER_LAYERS = ['entry', 'bridge', 'core', 'retention', 'ascension'];

export async function listOffers(ecosystemId, offers) {
  const rows = offers.map(o => ({ ecosystem_id: ecosystemId, ...o, mapped_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(ECOSYSTEM_TABLE).insert(rows);
  return { ecosystem_id: ecosystemId, offers_listed: rows.length };
}

export function defineOfferLayers(offers) {
  return offers.map(o => ({
    ...o,
    layer: o.price_points < 50 ? 'entry' : o.price_points < 500 ? 'bridge' : o.price_points < 2000 ? 'core' : o.price_points < 5000 ? 'retention' : 'ascension',
  }));
}

export function mapProgressionPaths(layeredOffers) {
  const byLayer = layeredOffers.reduce((acc, o) => { (acc[o.layer] = acc[o.layer] ?? []).push(o); return acc; }, {});
  const paths = [];
  for (let i = 0; i < OFFER_LAYERS.length - 1; i++) {
    const from = byLayer[OFFER_LAYERS[i]] ?? [];
    const to = byLayer[OFFER_LAYERS[i + 1]] ?? [];
    from.forEach(f => to.forEach(t => paths.push({ from_offer: f.name, to_offer: t.name, transition: `${OFFER_LAYERS[i]} → ${OFFER_LAYERS[i + 1]}` })));
  }
  return { paths, total_paths: paths.length };
}

export function identifyConflicts(layeredOffers) {
  const deadEnds = layeredOffers.filter(o => o.layer === 'ascension');
  const cannibalization = layeredOffers.filter((o, i) => layeredOffers.some((other, j) => i !== j && o.layer === other.layer && Math.abs((o.price_points ?? 0) - (other.price_points ?? 0)) < 50));
  return { dead_ends: deadEnds.map(o => o.name), cannibalization_risk: cannibalization.map(o => o.name), sequencing_conflicts: [] };
}

export async function recommendOptimizations(ecosystemId, paths, conflicts) {
  const recommendations = [];
  if (conflicts.cannibalization_risk.length > 0) recommendations.push({ action: 'differentiate', offers: conflicts.cannibalization_risk, note: 'These offers compete at the same price point — differentiate by outcome or audience' });
  if (paths.total_paths < 3) recommendations.push({ action: 'add_bridge_offer', note: 'Consider a bridge product between entry and core to improve LTV progression' });
  return { ecosystem_id: ecosystemId, recommendations };
}

export async function assignKpis(paths) {
  return paths.map(p => ({ ...p, conversion_kpi: `${p.from_offer} → ${p.to_offer} transition rate`, target: '15-25%', measurement: '30-day post-purchase window' }));
}

export async function outputEcosystemMap(ecosystemId) {
  const { data: offers } = await supabase.from(ECOSYSTEM_TABLE).select('*').eq('ecosystem_id', ecosystemId);
  const layered = defineOfferLayers(offers ?? []);
  const { paths } = mapProgressionPaths(layered);
  const conflicts = identifyConflicts(layered);
  return { ecosystem_id: ecosystemId, offers: layered, progression_paths: paths, conflicts, implementation_priority: ['Resolve cannibalization', 'Add bridge offer if missing', 'Set up tracking at each transition point'], generated_at: new Date().toISOString() };
}
