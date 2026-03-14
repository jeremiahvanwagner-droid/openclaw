#!/usr/bin/env node
/**
 * GHL API Skill Module
 * Provides GoHighLevel operations for OpenClaw agents
 * 
 * Usage: node ghl-api.mjs <command> [args...]
 * 
 * Commands:
 *   get-contact <contactId>               Get contact details
 *   search-contacts <query>               Search contacts
 *   create-contact <json>                 Create new contact
 *   update-contact <contactId> <json>     Update contact
 *   add-tag <contactId> <tag>             Add tag to contact
 *   remove-tag <contactId> <tag>          Remove tag from contact
 *   move-stage <opportunityId> <stageId>  Move opportunity to stage
 *   send-sms <contactId> <message>        Send SMS to contact
 *   send-email <contactId> <subject> <body>  Send email to contact
 *   get-opportunities [pipelineId]        List opportunities
 *   get-conversations <contactId>         Get conversation history
 *   calculate-lead-score <contactId>      Calculate lead score
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const GHL_TOKEN = process.env.GHL_PRIVATE_INTEGRATION_TOKEN || '';
const GHL_LOCATION = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

const headers = {
  'Authorization': `Bearer ${GHL_TOKEN}`,
  'Version': API_VERSION,
  'Content-Type': 'application/json'
};

// Rate limit: minimum spacing between GHL API calls (ms)
const MIN_CALL_SPACING_MS = 3000;
let lastCallAt = 0;

const DLQ_PATH = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw', 'data', 'dead-letter-queue.json');

function logToDLQ(entry) {
  try {
    const dlq = JSON.parse(readFileSync(DLQ_PATH, 'utf-8'));
    dlq.entries.push(entry);
    dlq.totalProcessed++;
    dlq.lastUpdated = new Date().toISOString();
    writeFileSync(DLQ_PATH, JSON.stringify(dlq, null, 2) + '\n', 'utf-8');
  } catch {
    // DLQ write failure is non-fatal
  }
}

async function apiCall(method, endpoint, body = null, _retryCount = 0) {
  // Enforce minimum spacing between calls
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  }
  lastCallAt = Date.now();

  const url = `${GHL_BASE}${endpoint}`;
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);

  // Auth expired — do not retry, log to DLQ
  if (response.status === 401 || response.status === 403) {
    const msg = `GHL auth expired (${response.status}) on ${method} ${endpoint}`;
    logToDLQ({ type: 'ghl-auth-expired', message: msg, timestamp: new Date().toISOString(), endpoint });
    throw new Error(msg);
  }

  // Rate limited — retry with backoff (max 2 retries)
  if (response.status === 429 && _retryCount < 2) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '10', 10);
    const delay = (retryAfter * 1000) + Math.random() * 2000;
    console.warn(`GHL 429 rate limited, retrying in ${Math.ceil(delay)}ms (attempt ${_retryCount + 1}/2)`);
    await new Promise(r => setTimeout(r, delay));
    return apiCall(method, endpoint, body, _retryCount + 1);
  }

  const data = await response.json();
  
  if (!response.ok) {
    const msg = `GHL API Error ${response.status}: ${JSON.stringify(data)}`;
    if (response.status === 429) {
      logToDLQ({ type: 'ghl-rate-limit', message: msg, timestamp: new Date().toISOString(), endpoint });
    }
    throw new Error(msg);
  }
  
  return data;
}

// ============ Contact Operations ============

async function getContact(contactId) {
  return apiCall('GET', `/contacts/${contactId}`);
}

async function searchContacts(query) {
  return apiCall('GET', `/contacts/?locationId=${GHL_LOCATION}&query=${encodeURIComponent(query)}`);
}

async function createContact(contactData) {
  return apiCall('POST', '/contacts/', {
    ...contactData,
    locationId: GHL_LOCATION
  });
}

async function updateContact(contactId, updates) {
  return apiCall('PUT', `/contacts/${contactId}`, updates);
}

async function addTag(contactId, tag) {
  return apiCall('POST', `/contacts/${contactId}/tags`, { tags: [tag] });
}

async function removeTag(contactId, tag) {
  return apiCall('DELETE', `/contacts/${contactId}/tags`, { tags: [tag] });
}

// ============ Pipeline Operations ============

async function getOpportunities(pipelineId = null) {
  let endpoint = `/opportunities/?locationId=${GHL_LOCATION}`;
  if (pipelineId) {
    endpoint += `&pipelineId=${pipelineId}`;
  }
  return apiCall('GET', endpoint);
}

async function moveStage(opportunityId, stageId) {
  return apiCall('PUT', `/opportunities/${opportunityId}`, {
    stageId
  });
}

// ============ Messaging Operations ============

async function sendSMS(contactId, message) {
  return apiCall('POST', '/conversations/messages', {
    type: 'SMS',
    contactId,
    message
  });
}

async function sendEmail(contactId, subject, body) {
  return apiCall('POST', '/conversations/messages', {
    type: 'Email',
    contactId,
    subject,
    message: body
  });
}

async function getConversations(contactId) {
  return apiCall('GET', `/conversations/?locationId=${GHL_LOCATION}&contactId=${contactId}`);
}

// ============ Lead Scoring ============

async function calculateLeadScore(contactId) {
  const contact = await getContact(contactId);
  const conversations = await getConversations(contactId);
  
  let score = 0;
  
  // Response speed (0-20 pts)
  // If responded within 24h, full points
  const firstResponse = conversations.conversations?.[0];
  if (firstResponse) {
    const responseTime = Date.now() - new Date(firstResponse.dateAdded).getTime();
    const hoursToRespond = responseTime / (1000 * 60 * 60);
    if (hoursToRespond < 1) score += 20;
    else if (hoursToRespond < 24) score += 15;
    else if (hoursToRespond < 72) score += 10;
    else score += 5;
  }
  
  // Email engagement (0-20 pts)
  const contact_data = contact.contact || contact;
  if (contact_data.emailVerified) score += 10;
  const emailOpens = contact_data.customFields?.email_opens || 0;
  score += Math.min(emailOpens * 2, 10);
  
  // SMS replies (0-20 pts)
  const smsReplies = conversations.conversations?.filter(c => c.type === 'SMS' && c.direction === 'inbound').length || 0;
  score += Math.min(smsReplies * 5, 20);
  
  // Alignment score from scorecard (0-20 pts)
  const alignmentScore = contact_data.customFields?.alignment_score || 0;
  score += Math.round((alignmentScore / 100) * 20);
  
  // Form completions (0-20 pts)
  const tags = contact_data.tags || [];
  if (tags.includes('scorecard-lead')) score += 10;
  if (tags.includes('ebook-buyer')) score += 10;
  
  return {
    contactId,
    score: Math.min(score, 100),
    breakdown: {
      responseSpeed: Math.min(20, score),
      emailEngagement: 10,
      smsReplies: Math.min(smsReplies * 5, 20),
      alignmentScore: Math.round((alignmentScore / 100) * 20),
      formCompletions: (tags.includes('scorecard-lead') ? 10 : 0) + (tags.includes('ebook-buyer') ? 10 : 0)
    }
  };
}

// ============ CLI Handler ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  if (!command) {
    console.log('Usage: node ghl-api.mjs <command> [args...]');
    console.log('Commands: get-contact, search-contacts, create-contact, update-contact,');
    console.log('          add-tag, remove-tag, move-stage, send-sms, send-email,');
    console.log('          get-opportunities, get-conversations, calculate-lead-score');
    process.exit(1);
  }
  
  try {
    let result;
    
    switch (command) {
      case 'get-contact':
        result = await getContact(args[0]);
        break;
      case 'search-contacts':
        result = await searchContacts(args[0]);
        break;
      case 'create-contact':
        result = await createContact(JSON.parse(args[0]));
        break;
      case 'update-contact':
        result = await updateContact(args[0], JSON.parse(args[1]));
        break;
      case 'add-tag':
        result = await addTag(args[0], args[1]);
        break;
      case 'remove-tag':
        result = await removeTag(args[0], args[1]);
        break;
      case 'move-stage':
        result = await moveStage(args[0], args[1]);
        break;
      case 'send-sms':
        result = await sendSMS(args[0], args.slice(1).join(' '));
        break;
      case 'send-email':
        result = await sendEmail(args[0], args[1], args.slice(2).join(' '));
        break;
      case 'get-opportunities':
        result = await getOpportunities(args[0]);
        break;
      case 'get-conversations':
        result = await getConversations(args[0]);
        break;
      case 'calculate-lead-score':
        result = await calculateLeadScore(args[0]);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
    
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
