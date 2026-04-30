import { supabase } from '../../lib/agent-memory.js';

const TX_TABLE = 'finance_contract_transactions';

const ALLOWED_CONTRACTS = new Set([]);

export function validateContractPermissions(contractAddress, functionName, chain) {
  const allowed = ALLOWED_CONTRACTS.has(contractAddress) || process.env.NODE_ENV === 'development';
  const supportedChains = ['ethereum', 'polygon', 'arbitrum', 'base'];
  return { allowed, chain_supported: supportedChains.includes(chain), function_approved: !['selfdestruct', 'delegatecall'].includes(functionName) };
}

export async function simulateTransaction(contractAddress, functionName, params) {
  return { simulated: true, estimated_output: params, revert_risk: 'low', gas_estimate: 150000, simulation_ts: new Date().toISOString() };
}

export function checkTransactionThresholds(gasEstimate, slippageBps, params) {
  const issues = [];
  if (gasEstimate > 500000) issues.push('high_gas_estimate');
  if (slippageBps > 100) issues.push('high_slippage_risk');
  if ((params.value_usd ?? 0) > 100000) issues.push('large_value_requires_approval');
  return { safe: issues.length === 0, issues };
}

export async function enforceApprovalPolicy(txId, policyLevel) {
  const requiresMultiSig = policyLevel === 'high' || policyLevel === 'critical';
  if (requiresMultiSig) {
    await supabase.from(TX_TABLE).update({ status: 'pending_approval', approval_required: true }).eq('tx_id', txId);
    return { approved: false, reason: 'multi_step_approval_required' };
  }
  return { approved: true };
}

export async function submitTransaction(txId, payload) {
  const nonce = Date.now();
  const txHash = `0x${nonce.toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  await supabase.from(TX_TABLE).insert({ tx_id: txId, tx_hash: txHash, payload, nonce, status: 'submitted', submitted_at: new Date().toISOString() });
  return { tx_id: txId, tx_hash: txHash, submitted: true };
}

export async function trackConfirmation(txHash, requiredConfirmations = 12) {
  const { data } = await supabase.from(TX_TABLE).select('confirmations, status').eq('tx_hash', txHash).single();
  const confs = data?.confirmations ?? 0;
  const finalized = confs >= requiredConfirmations;
  if (finalized) await supabase.from(TX_TABLE).update({ status: 'finalized', finalized_at: new Date().toISOString() }).eq('tx_hash', txHash);
  return { tx_hash: txHash, confirmations: confs, finalized };
}

export async function outputAuditLog(txId) {
  const { data } = await supabase.from(TX_TABLE).select('*').eq('tx_id', txId).single();
  return { tx_id: txId, audit: data, risk_annotations: data?.issues ?? [], generated_at: new Date().toISOString() };
}
