import { supabase } from '../../lib/agent-memory.js';

const STRESS_TABLE = 'finance_stress_test_results';

const SHOCK_SCENARIOS = [
  { name: 'equity_crash_20pct',     price_shock: -0.20, spread_shock: 0.5,  liquidity_shock: 0.3 },
  { name: 'rate_spike_200bps',      price_shock: -0.08, spread_shock: 0.2,  liquidity_shock: 0.1 },
  { name: 'crypto_crash_50pct',     price_shock: -0.50, spread_shock: 2.0,  liquidity_shock: 0.8 },
  { name: 'fx_devaluation_15pct',   price_shock: -0.15, spread_shock: 0.8,  liquidity_shock: 0.2 },
  { name: 'liquidity_crisis',       price_shock: -0.05, spread_shock: 5.0,  liquidity_shock: 0.95 },
];

export async function definePortfolioState(portfolioId) {
  const { data } = await supabase.from('finance_portfolio_holdings').select('asset_id, market_value, asset_class, leverage').eq('portfolio_id', portfolioId);
  const total = (data ?? []).reduce((s, h) => s + (h.market_value ?? 0), 0);
  return { portfolio_id: portfolioId, holdings: data ?? [], total_value: total };
}

export function generateShockScenarios(customScenarios = []) {
  return [...SHOCK_SCENARIOS, ...customScenarios];
}

export function simulatePnl(portfolio, scenario) {
  const stressed = portfolio.holdings.map(h => {
    const priceImpact = (h.market_value ?? 0) * scenario.price_shock;
    const spreadImpact = (h.market_value ?? 0) * -Math.abs(scenario.spread_shock) * 0.01;
    const liquidityImpact = (h.market_value ?? 0) * -scenario.liquidity_shock * 0.05;
    return { asset_id: h.asset_id, stressed_value: (h.market_value ?? 0) + priceImpact + spreadImpact + liquidityImpact };
  });
  const stressedTotal = stressed.reduce((s, h) => s + h.stressed_value, 0);
  const pnl = stressedTotal - portfolio.total_value;
  const drawdown = portfolio.total_value > 0 ? pnl / portfolio.total_value : 0;
  return { scenario: scenario.name, pnl: Math.round(pnl), drawdown_pct: Math.round(drawdown * 10000) / 100, margin_call_risk: drawdown < -0.15 };
}

export function evaluateLimitBreaches(simulations, riskLimits) {
  return simulations.map(s => {
    const drawdownBreach = s.drawdown_pct < -(riskLimits.max_drawdown_pct ?? 20);
    return { ...s, limit_breached: drawdownBreach, breach_type: drawdownBreach ? 'drawdown_limit' : null };
  });
}

export function compareToRiskAppetite(evaluated, appetite) {
  const criticalBreaches = evaluated.filter(e => e.limit_breached);
  const worstCase = evaluated.sort((a, b) => a.pnl - b.pnl)[0];
  const goNoGo = criticalBreaches.length === 0 ? 'go' : criticalBreaches.length <= 1 ? 'conditional' : 'no_go';
  return { go_no_go: goNoGo, critical_breaches: criticalBreaches.length, worst_case_pnl: worstCase?.pnl ?? 0, worst_case_scenario: worstCase?.scenario ?? null };
}

export function recommendAdjustments(riskAppetiteResult) {
  if (riskAppetiteResult.go_no_go === 'no_go') return ['Reduce position size by 30%', 'Add hedge via put options or inverse ETF', 'Increase cash allocation before deployment'];
  if (riskAppetiteResult.go_no_go === 'conditional') return ['Add stop-loss at -15% from entry', 'Review concentration in worst-case scenario assets'];
  return [];
}

export async function outputStressReport(portfolioId, simulations, riskResult) {
  await supabase.from(STRESS_TABLE).insert({ portfolio_id: portfolioId, scenarios_tested: simulations.length, go_no_go: riskResult.go_no_go, worst_case_pnl: riskResult.worst_case_pnl, tested_at: new Date().toISOString() });
  return { portfolio_id: portfolioId, scenarios: simulations, risk_appetite_result: riskResult, recommendations: recommendAdjustments(riskResult), generated_at: new Date().toISOString() };
}
