#!/usr/bin/env node
/**
 * OpenClaw NLP Query Interface
 *
 * Natural language queries for GHL data via Telegram
 *
 * Features:
 *   - Parse natural language queries
 *   - Execute GHL searches
 *   - Format results for chat delivery
 *   - Support common query patterns
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const QUERY_LOG_FILE = path.join(DATA_DIR, 'nlp-query-log.json');

const { token: GHL_API_KEY, locationId: GHL_LOCATION_ID } = (await import('../lib/ghl-tenant-resolver.mjs')).resolve();
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Query patterns
const QUERY_PATTERNS = [
  {
    pattern: /how many (leads?|contacts?|people)/i,
    type: 'count-contacts',
    extract: (match) => ({})
  },
  {
    pattern: /how many (leads?|contacts?) (from|tagged|with tag) (.+)/i,
    type: 'count-contacts-filtered',
    extract: (match) => ({ filter: match[3] })
  },
  {
    pattern: /(show|list|get|find) (the )?(last|recent) (\d+) (leads?|contacts?)/i,
    type: 'recent-contacts',
    extract: (match) => ({ limit: parseInt(match[4]) })
  },
  {
    pattern: /(show|list|get|find) (leads?|contacts?) (from|tagged|with tag|named|called) (.+)/i,
    type: 'search-contacts',
    extract: (match) => ({ query: match[4] })
  },
  {
    pattern: /who (bought|purchased) (.+)/i,
    type: 'buyers',
    extract: (match) => ({ product: match[2] })
  },
  {
    pattern: /(opportunities?|deals?) (in )?(.+) (stage|pipeline)/i,
    type: 'opportunities-stage',
    extract: (match) => ({ stage: match[3] })
  },
  {
    pattern: /how many (opportunities?|deals?)/i,
    type: 'count-opportunities',
    extract: (match) => ({})
  },
  {
    pattern: /(total|sum) (revenue|sales|value)/i,
    type: 'total-revenue',
    extract: (match) => ({})
  },
  {
    pattern: /(revenue|sales) (from|this|last) (week|month|year)/i,
    type: 'revenue-period',
    extract: (match) => ({ period: match[3] })
  },
  {
    pattern: /conversion rate/i,
    type: 'conversion-rate',
    extract: (match) => ({})
  },
  {
    pattern: /(top|best) (\d+)? ?(sources?|traffic)/i,
    type: 'top-sources',
    extract: (match) => ({ limit: parseInt(match[2]) || 5 })
  },
  {
    pattern: /contacts? (named|called|email|phone) (.+)/i,
    type: 'search-contacts',
    extract: (match) => ({ query: match[2] })
  },
  {
    pattern: /(\w+)@\w+\.\w+/i,
    type: 'search-contacts',
    extract: (match) => ({ query: match[0] })
  }
];

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Send Telegram response
 */
async function sendResponse(message) {
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse natural language query
 */
function parseQuery(text) {
  const normalizedText = text.trim().toLowerCase();

  for (const { pattern, type, extract } of QUERY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        type,
        params: extract(match),
        originalQuery: text
      };
    }
  }

  // Default: treat as contact search
  return {
    type: 'search-contacts',
    params: { query: text },
    originalQuery: text
  };
}

/**
 * Execute parsed query
 */
async function executeQuery(parsed) {
  const { type, params } = parsed;

  switch (type) {
    case 'count-contacts':
      return await countContacts();

    case 'count-contacts-filtered':
      return await countContactsFiltered(params.filter);

    case 'recent-contacts':
      return await getRecentContacts(params.limit);

    case 'search-contacts':
      return await searchContacts(params.query);

    case 'buyers':
      return await searchBuyers(params.product);

    case 'count-opportunities':
      return await countOpportunities();

    case 'opportunities-stage':
      return await getOpportunitiesByStage(params.stage);

    case 'total-revenue':
      return await calculateTotalRevenue();

    case 'revenue-period':
      return await getRevenuePeriod(params.period);

    case 'conversion-rate':
      return await calculateConversionRate();

    case 'top-sources':
      return await getTopSources(params.limit);

    default:
      return { success: false, message: "I don't understand that query." };
  }
}

// Query handlers

async function countContacts() {
  try {
    const response = await ghlRequest('GET',
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=1`
    );
    const total = response.meta?.total || response.contacts?.length || 0;
    return {
      success: true,
      message: `📊 Total Contacts: ${total.toLocaleString()}`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function countContactsFiltered(filter) {
  try {
    // Check if filter is a tag
    const response = await ghlRequest('POST',
      `/contacts/search`,
      {
        locationId: GHL_LOCATION_ID,
        query: filter,
        limit: 100
      }
    );

    const count = response.contacts?.length || 0;
    return {
      success: true,
      message: `📊 Contacts matching "${filter}": ${count}`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function getRecentContacts(limit = 5) {
  try {
    const response = await ghlRequest('GET',
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=${limit}&sortBy=dateAdded&sortOrder=desc`
    );

    const contacts = response.contacts || [];
    if (contacts.length === 0) {
      return { success: true, message: 'No contacts found.' };
    }

    let message = `📋 Last ${contacts.length} Contacts:\n\n`;
    for (const c of contacts) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
      const date = new Date(c.dateAdded).toLocaleDateString();
      message += `• ${name} (${c.email || 'no email'}) - ${date}\n`;
    }

    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function searchContacts(query) {
  try {
    // Try search endpoint
    const response = await ghlRequest('POST',
      `/contacts/search`,
      {
        locationId: GHL_LOCATION_ID,
        query: query,
        limit: 10
      }
    );

    const contacts = response.contacts || [];
    if (contacts.length === 0) {
      return { success: true, message: `No contacts found for "${query}"` };
    }

    let message = `🔍 Found ${contacts.length} contact(s) for "${query}":\n\n`;
    for (const c of contacts) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
      const tags = (c.tags || []).slice(0, 3).join(', ');
      message += `• ${name}\n  📧 ${c.email || '-'} | 📱 ${c.phone || '-'}\n`;
      if (tags) message += `  🏷️ ${tags}\n`;
      message += '\n';
    }

    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function searchBuyers(product) {
  try {
    const productNormalized = product.toLowerCase().trim();
    let tagSearch = productNormalized;

    // Map common product names to tags
    if (productNormalized.includes('ebook') || productNormalized.includes('e-book')) {
      tagSearch = 'ebook';
    } else if (productNormalized.includes('course')) {
      tagSearch = 'course-buyer';
    } else if (productNormalized.includes('intensive')) {
      tagSearch = 'intensive';
    } else if (productNormalized.includes('circle') || productNormalized.includes('operator')) {
      tagSearch = 'operators-circle';
    }

    const response = await ghlRequest('GET',
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=50`
    );

    const contacts = response.contacts || [];
    const buyers = contacts.filter(c =>
      (c.tags || []).some(t => t.toLowerCase().includes(tagSearch))
    );

    if (buyers.length === 0) {
      return { success: true, message: `No buyers found for "${product}"` };
    }

    let message = `🛒 ${buyers.length} buyer(s) of "${product}":\n\n`;
    for (const c of buyers.slice(0, 10)) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
      message += `• ${name} (${c.email || 'no email'})\n`;
    }

    if (buyers.length > 10) {
      message += `\n... and ${buyers.length - 10} more`;
    }

    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function countOpportunities() {
  try {
    const response = await ghlRequest('GET',
      `/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=1`
    );
    const total = response.meta?.total || response.opportunities?.length || 0;
    return {
      success: true,
      message: `📊 Total Opportunities: ${total.toLocaleString()}`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function getOpportunitiesByStage(stageName) {
  try {
    const response = await ghlRequest('GET',
      `/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100`
    );

    const opps = response.opportunities || [];
    const filtered = opps.filter(o =>
      (o.pipelineStageId || o.status || '').toLowerCase().includes(stageName.toLowerCase())
    );

    if (filtered.length === 0) {
      return { success: true, message: `No opportunities in "${stageName}" stage` };
    }

    let totalValue = filtered.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);

    let message = `📌 ${filtered.length} opportunities in "${stageName}":\n`;
    message += `💰 Total Value: $${totalValue.toLocaleString()}\n\n`;

    for (const o of filtered.slice(0, 5)) {
      message += `• ${o.name || o.contactName || 'Unknown'} - $${(o.monetaryValue || 0).toLocaleString()}\n`;
    }

    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function calculateTotalRevenue() {
  try {
    const response = await ghlRequest('GET',
      `/opportunities/search?location_id=${GHL_LOCATION_ID}&status=won&limit=500`
    );

    const opps = response.opportunities || [];
    const total = opps.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);

    return {
      success: true,
      message: `💰 Total Revenue (Won Opps): $${total.toLocaleString()}\n📊 From ${opps.length} closed deals`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function getRevenuePeriod(period) {
  try {
    const now = new Date();
    let startDate;

    switch (period.toLowerCase()) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const response = await ghlRequest('GET',
      `/opportunities/search?location_id=${GHL_LOCATION_ID}&status=won&limit=500`
    );

    const opps = (response.opportunities || []).filter(o => {
      const oppDate = new Date(o.updatedAt || o.createdAt);
      return oppDate >= startDate;
    });

    const total = opps.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);

    return {
      success: true,
      message: `💰 Revenue this ${period}: $${total.toLocaleString()}\n📊 From ${opps.length} deals`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function calculateConversionRate() {
  try {
    // Get total contacts
    const contactsResp = await ghlRequest('GET',
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=1`
    );
    const totalContacts = contactsResp.meta?.total || 0;

    // Get won opportunities
    const oppsResp = await ghlRequest('GET',
      `/opportunities/search?location_id=${GHL_LOCATION_ID}&status=won&limit=1`
    );
    const wonOpps = oppsResp.meta?.total || oppsResp.opportunities?.length || 0;

    const rate = totalContacts > 0 ? ((wonOpps / totalContacts) * 100).toFixed(2) : 0;

    return {
      success: true,
      message: `📈 Overall Conversion Rate: ${rate}%\n👥 Total Contacts: ${totalContacts.toLocaleString()}\n✅ Won Opportunities: ${wonOpps.toLocaleString()}`
    };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

async function getTopSources(limit = 5) {
  try {
    const response = await ghlRequest('GET',
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=500`
    );

    const contacts = response.contacts || [];
    const sourceCounts = {};

    for (const c of contacts) {
      const source = c.source || 'direct';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }

    const sorted = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    let message = `📊 Top ${limit} Traffic Sources:\n\n`;
    for (let i = 0; i < sorted.length; i++) {
      const [source, count] = sorted[i];
      const pct = ((count / contacts.length) * 100).toFixed(1);
      message += `${i + 1}. ${source}: ${count} (${pct}%)\n`;
    }

    return { success: true, message };
  } catch (error) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Log query for analytics
 */
async function logQuery(query, parsed, result) {
  try {
    let logs = [];
    try {
      const data = await fs.readFile(QUERY_LOG_FILE, 'utf8');
      logs = JSON.parse(data);
    } catch {}

    logs.push({
      timestamp: new Date().toISOString(),
      query,
      parsedType: parsed.type,
      parsedParams: parsed.params,
      success: result.success
    });

    // Keep last 1000 queries
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(QUERY_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch {}
}

/**
 * Process incoming query
 */
async function processQuery(queryText) {
  console.log(`\n🔍 Processing query: "${queryText}"\n`);

  // Parse query
  const parsed = parseQuery(queryText);
  console.log(`  Parsed as: ${parsed.type}`);
  console.log(`  Params: ${JSON.stringify(parsed.params)}`);

  // Execute query
  const result = await executeQuery(parsed);
  console.log(`  Success: ${result.success}`);
  console.log(`\n${result.message}`);

  // Log query
  await logQuery(queryText, parsed, result);

  return result;
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n🦞 OpenClaw NLP Query Interface');
  console.log('═'.repeat(50));
  console.log('Ask questions about your GHL data in natural language.');
  console.log('Type "exit" to quit.\n');

  const askQuestion = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      const result = await processQuery(input);
      console.log('');

      askQuestion();
    });
  };

  askQuestion();
}

/**
 * Process query and send to Telegram
 */
async function queryAndSend(queryText) {
  const result = await processQuery(queryText);
  await sendResponse(result.message);
  return result;
}

/**
 * Show query statistics
 */
async function showStats() {
  try {
    const data = await fs.readFile(QUERY_LOG_FILE, 'utf8');
    const logs = JSON.parse(data);

    console.log('\n📊 Query Statistics\n');
    console.log(`Total queries: ${logs.length}`);

    // Count by type
    const typeCounts = {};
    for (const log of logs) {
      typeCounts[log.parsedType] = (typeCounts[log.parsedType] || 0) + 1;
    }

    console.log('\nBy Type:');
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      console.log(`  ${type}: ${count}`);
    }

    // Success rate
    const successful = logs.filter(l => l.success).length;
    console.log(`\nSuccess rate: ${((successful / logs.length) * 100).toFixed(1)}%`);

  } catch {
    console.log('No query logs found.');
  }
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'query':
  case 'ask':
    if (args.length === 0) {
      console.log('Usage: nlp-query.mjs query "your question here"');
    } else {
      processQuery(args.join(' '));
    }
    break;

  case 'send':
    if (args.length === 0) {
      console.log('Usage: nlp-query.mjs send "your question here"');
    } else {
      queryAndSend(args.join(' '));
    }
    break;

  case 'interactive':
  case 'i':
    interactiveMode();
    break;

  case 'stats':
    showStats();
    break;

  case 'patterns':
    console.log('\nSupported Query Patterns:\n');
    for (const { pattern, type } of QUERY_PATTERNS) {
      console.log(`  ${type}: ${pattern.source}`);
    }
    break;

  default:
    console.log(`
NLP Query Interface

Usage:
  nlp-query.mjs query "<question>"    - Process a natural language query
  nlp-query.mjs send "<question>"     - Query and send result to Telegram
  nlp-query.mjs interactive           - Start interactive query mode
  nlp-query.mjs stats                 - Show query statistics
  nlp-query.mjs patterns              - Show supported query patterns

Example Queries:
  "How many leads do we have?"
  "Show the last 10 contacts"
  "Find contacts from facebook"
  "Who bought the ebook?"
  "Total revenue this month"
  "What's our conversion rate?"
  "Top 5 traffic sources"
`);
}

export { processQuery, parseQuery, executeQuery, queryAndSend };
