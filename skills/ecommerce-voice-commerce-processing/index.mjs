import { supabase } from '../../lib/agent-memory.js';

const LOG_TABLE = 'ecommerce_voice_interactions';

const INTENT_PATTERNS = {
  search:       /find|search|show me|look for|where is/i,
  add_to_cart:  /add|put in cart|buy|order|get me/i,
  remove:       /remove|take out|delete from cart/i,
  checkout:     /checkout|purchase|complete order|pay|buy now/i,
  cart_status:  /what.*cart|my cart|how many/i,
};

function extractIntent(text) {
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(text)) return intent;
  }
  return 'general_query';
}

function extractEntities(text) {
  const qtyMatch = text.match(/(\d+)\s+(of|x)?\s*/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
  const productRef = text.replace(/\d+|add|find|search|show me|order|buy|remove|checkout|cart/gi, '').trim();
  return { product_ref: productRef, quantity: qty };
}

export async function processVoiceInput(sessionId, rawText) {
  const intent = extractIntent(rawText);
  const entities = extractEntities(rawText);
  await supabase.from(LOG_TABLE).insert({ session_id: sessionId, raw_text: rawText, intent, entities, processed_at: new Date().toISOString() });
  return { session_id: sessionId, intent, entities };
}

export function resolveProductReference(productRef, catalog) {
  const matched = catalog.filter(p => p.name?.toLowerCase().includes(productRef.toLowerCase()) || p.sku?.toLowerCase() === productRef.toLowerCase());
  if (matched.length === 1) return { resolved: true, product: matched[0] };
  if (matched.length > 1) return { resolved: false, ambiguous: true, candidates: matched.slice(0, 3) };
  return { resolved: false, no_match: true };
}

export function buildClarificationPrompt(resolved) {
  if (resolved.ambiguous) return `Did you mean ${resolved.candidates.map(c => c.name).join(', or ')}?`;
  if (resolved.no_match) return "I couldn't find that product. Can you describe it differently?";
  return null;
}

export async function executeAction(sessionId, intent, product, quantity, userId) {
  const requiresAuth = ['checkout'].includes(intent);
  if (requiresAuth && !userId) return { executed: false, reason: 'authentication_required' };
  const actionMap = { search: 'search_results_returned', add_to_cart: 'item_added', remove: 'item_removed', checkout: 'checkout_initiated', cart_status: 'cart_read' };
  const action = actionMap[intent] ?? 'query_handled';
  await supabase.from(LOG_TABLE).update({ action, product_sku: product?.sku, quantity, executed_at: new Date().toISOString() }).eq('session_id', sessionId);
  return { executed: true, action, product, quantity };
}

export function buildSpokenConfirmation(action, product, quantity) {
  const confirmations = {
    item_added: `Added ${quantity} ${product?.name ?? 'item'} to your cart.`,
    item_removed: `Removed ${product?.name ?? 'item'} from your cart.`,
    checkout_initiated: `Starting checkout. Your total is ${product?.total ?? 'ready for review'}.`,
    search_results_returned: `I found ${quantity} results for ${product?.name ?? 'your search'}.`,
  };
  return { spoken: confirmations[action] ?? 'Done!', next_options: ['Continue shopping', 'View cart', 'Checkout'] };
}

export async function outputInteractionLog(sessionId) {
  const { data } = await supabase.from(LOG_TABLE).select('*').eq('session_id', sessionId).order('processed_at');
  return { session_id: sessionId, interactions: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
