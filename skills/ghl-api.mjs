#!/usr/bin/env node
/**
 * GHL API Skill Module
 * Provides GoHighLevel operations for OpenClaw agents through the shared GHL client.
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
import { createGhlClient } from '../lib/ghl-client.mjs';

const locationArg = (() => {
  const idx = process.argv.indexOf('--location');
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();

const client = createGhlClient(locationArg, { minCallSpacingMs: 3000 });
const GHL_LOCATION = client.tenant.locationId;
const DLQ_PATH = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw', 'data', 'dead-letter-queue.json');

function logToDLQ(entry) {
  try {
    const dlq = JSON.parse(readFileSync(DLQ_PATH, 'utf8'));
    dlq.entries.push(entry);
    dlq.totalProcessed++;
    dlq.lastUpdated = new Date().toISOString();
    writeFileSync(DLQ_PATH, JSON.stringify(dlq, null, 2) + '\n', 'utf8');
  } catch {
    // DLQ write failure is non-fatal.
  }
}

async function withDlq(label, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      logToDLQ({
        type: 'ghl-auth-expired',
        label,
        message: error.message,
        timestamp: new Date().toISOString(),
        status: error.status,
      });
    }
    if (error.status === 429) {
      logToDLQ({
        type: 'ghl-rate-limit',
        label,
        message: error.message,
        timestamp: new Date().toISOString(),
        status: error.status,
      });
    }
    throw error;
  }
}

async function getContact(contactId) {
  return withDlq(`get-contact:${contactId}`, () => client.contacts.get(contactId));
}

async function searchContacts(query) {
  return withDlq(`search-contacts:${query}`, () => client.contacts.search({ query }));
}

async function createContact(contactData) {
  return withDlq('create-contact', () => client.contacts.create(contactData));
}

async function updateContact(contactId, updates) {
  return withDlq(`update-contact:${contactId}`, () => client.contacts.update(contactId, updates));
}

async function addTag(contactId, tag) {
  return withDlq(`add-tag:${contactId}`, () => client.contacts.addTags(contactId, [tag]));
}

async function removeTag(contactId, tag) {
  return withDlq(`remove-tag:${contactId}`, () => client.contacts.removeTags(contactId, [tag]));
}

async function getOpportunities(pipelineId = null) {
  return withDlq('get-opportunities', () => client.opportunities.search({
    locationId: GHL_LOCATION,
    pipelineId: pipelineId || undefined,
  }));
}

async function moveStage(opportunityId, stageId) {
  return withDlq(`move-stage:${opportunityId}`, () => client.opportunities.update(opportunityId, {
    stageId,
  }));
}

async function sendSMS(contactId, message) {
  return withDlq(`send-sms:${contactId}`, () => client.conversations.messages.send({
    type: 'SMS',
    contactId,
    message,
  }));
}

async function sendEmail(contactId, subject, body) {
  return withDlq(`send-email:${contactId}`, () => client.conversations.messages.send({
    type: 'Email',
    contactId,
    subject,
    message: body,
  }));
}

async function getConversations(contactId) {
  return withDlq(`get-conversations:${contactId}`, () => client.conversations.list({ contactId }));
}

async function calculateLeadScore(contactId) {
  const contact = await getContact(contactId);
  const conversations = await getConversations(contactId);

  let score = 0;
  const firstResponse = conversations.conversations?.[0];
  let responseSpeedPoints = 0;
  if (firstResponse) {
    const responseTime = Date.now() - new Date(firstResponse.dateAdded).getTime();
    const hoursToRespond = responseTime / (1000 * 60 * 60);
    if (hoursToRespond < 1) responseSpeedPoints = 20;
    else if (hoursToRespond < 24) responseSpeedPoints = 15;
    else if (hoursToRespond < 72) responseSpeedPoints = 10;
    else responseSpeedPoints = 5;
  }
  score += responseSpeedPoints;

  const contactData = contact.contact || contact;
  const verifiedEmailPoints = contactData.emailVerified ? 10 : 0;
  score += verifiedEmailPoints;
  const emailOpens = contactData.customFields?.email_opens || 0;
  const emailEngagement = Math.min(emailOpens * 2, 10);
  score += emailEngagement;

  const smsReplies = conversations.conversations?.filter(
    conversation => conversation.type === 'SMS' && conversation.direction === 'inbound',
  ).length || 0;
  const smsReplyScore = Math.min(smsReplies * 5, 20);
  score += smsReplyScore;

  const alignmentScore = contactData.customFields?.alignment_score || 0;
  const alignmentScorePoints = Math.round((alignmentScore / 100) * 20);
  score += alignmentScorePoints;

  const tags = contactData.tags || [];
  const formCompletionPoints =
    (tags.includes('scorecard-lead') ? 10 : 0) +
    (tags.includes('ebook-buyer') ? 10 : 0);
  score += formCompletionPoints;

  return {
    contactId,
    score: Math.min(score, 100),
    breakdown: {
      responseSpeed: responseSpeedPoints,
      emailEngagement: verifiedEmailPoints + emailEngagement,
      smsReplies: smsReplyScore,
      alignmentScore: alignmentScorePoints,
      formCompletions: formCompletionPoints,
    },
  };
}

async function main() {
  const [, , command, ...args] = process.argv;

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
