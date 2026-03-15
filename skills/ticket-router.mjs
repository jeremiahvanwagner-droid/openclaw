#!/usr/bin/env node
/**
 * Ticket Router
 * Route support tickets to appropriate agents/teams based on category, priority, and SLAs
 *
 * Usage: node ticket-router.mjs <command> [args...]
 *
 * Commands:
 *   route <location_id> --contact_id "<c>" --subject "<s>" --body "<b>" [--priority "low|medium|high|urgent"]
 *   list <location_id> [--status "open|pending|resolved"] [--assigned_to "<agent>"]
 *   update <ticket_id> --status "<s>" [--notes "<n>"]
 *   escalate <ticket_id> --reason "<r>"
 *   sla-check <location_id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const TICKETS_PATH = join(OPENCLAW_ROOT, 'data', 'support-tickets.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

const SLA_HOURS = { urgent: 1, high: 4, medium: 12, low: 48 };
const ROUTING_RULES = {
  billing:    { team: 'd8_revenue_ops',       keywords: ['invoice', 'payment', 'charge', 'refund', 'billing', 'subscription'] },
  technical:  { team: 'd8_platform_architect', keywords: ['bug', 'error', 'broken', 'not working', 'crash', 'api'] },
  access:     { team: 'd8_membership_director', keywords: ['login', 'password', 'access', 'locked', 'course', 'membership'] },
  funnel:     { team: 'd8_funnel_engineer',    keywords: ['funnel', 'page', 'website', 'form', 'landing'] },
  general:    { team: 'd8_customer_success',   keywords: [] }
};

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  for (const [, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return entry.access_token;
  }
  throw new Error(`No token found for location ${locationId}`);
}

function loadTickets() {
  if (!existsSync(TICKETS_PATH)) return { tickets: [] };
  return JSON.parse(readFileSync(TICKETS_PATH, 'utf-8'));
}

function saveTickets(data) {
  const dir = dirname(TICKETS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TICKETS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[++i] : true;
    }
  }
  return result;
}

function classifyTicket(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();
  for (const [category, rule] of Object.entries(ROUTING_RULES)) {
    if (category === 'general') continue;
    if (rule.keywords.some(kw => text.includes(kw))) return { category, team: rule.team };
  }
  return { category: 'general', team: ROUTING_RULES.general.team };
}

function genId() { return `tkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

function routeTicket(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.subject) throw new Error('Required: --contact_id "<id>" --subject "<subject>"');

  const { category, team } = classifyTicket(opts.subject, opts.body || '');
  const priority = opts.priority || 'medium';
  const slaDeadline = new Date(Date.now() + SLA_HOURS[priority] * 3600000);

  const tickets = loadTickets();
  const ticket = {
    id: genId(), locationId,
    contactId: opts.contact_id,
    subject: opts.subject,
    body: opts.body || '',
    category, priority,
    assignedTo: team,
    status: 'open',
    slaDeadline: slaDeadline.toISOString(),
    createdAt: new Date().toISOString(),
    history: [{ action: 'created', at: new Date().toISOString(), by: 'system' }]
  };
  tickets.tickets.push(ticket);
  saveTickets(tickets);

  console.log(JSON.stringify({ action: 'route', ticket }, null, 2));
}

function listTickets(locationId, args) {
  const opts = parseArgs(args);
  const tickets = loadTickets();
  let list = tickets.tickets.filter(t => t.locationId === locationId);
  if (opts.status) list = list.filter(t => t.status === opts.status);
  if (opts.assigned_to) list = list.filter(t => t.assignedTo === opts.assigned_to);
  console.log(JSON.stringify({ action: 'list', locationId, total: list.length, tickets: list }, null, 2));
}

function updateTicket(ticketId, args) {
  const opts = parseArgs(args);
  const tickets = loadTickets();
  const ticket = tickets.tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error(`Ticket not found: ${ticketId}`);
  if (opts.status) ticket.status = opts.status;
  ticket.history.push({ action: `updated to ${opts.status}`, notes: opts.notes || '', at: new Date().toISOString() });
  saveTickets(tickets);
  console.log(JSON.stringify({ action: 'update', ticketId, status: ticket.status }, null, 2));
}

function escalateTicket(ticketId, args) {
  const opts = parseArgs(args);
  if (!opts.reason) throw new Error('Required: --reason "<reason>"');
  const tickets = loadTickets();
  const ticket = tickets.tickets.find(t => t.id === ticketId);
  if (!ticket) throw new Error(`Ticket not found: ${ticketId}`);
  ticket.priority = 'urgent';
  ticket.assignedTo = 'd8_saas_director';
  ticket.slaDeadline = new Date(Date.now() + SLA_HOURS.urgent * 3600000).toISOString();
  ticket.history.push({ action: 'escalated', reason: opts.reason, at: new Date().toISOString() });
  saveTickets(tickets);
  console.log(JSON.stringify({ action: 'escalate', ticketId, newPriority: 'urgent', escalatedTo: 'd8_saas_director', reason: opts.reason }, null, 2));
}

function slaCheck(locationId) {
  const tickets = loadTickets();
  const open = tickets.tickets.filter(t => t.locationId === locationId && t.status === 'open');
  const now = Date.now();
  const breached = open.filter(t => new Date(t.slaDeadline).getTime() < now);
  const atRisk = open.filter(t => {
    const deadline = new Date(t.slaDeadline).getTime();
    return deadline >= now && deadline - now < 3600000;
  });
  console.log(JSON.stringify({
    action: 'sla-check', locationId,
    openTickets: open.length, breached: breached.length, atRisk: atRisk.length,
    breachedTickets: breached.map(t => ({ id: t.id, subject: t.subject, priority: t.priority })),
    atRiskTickets: atRisk.map(t => ({ id: t.id, subject: t.subject, minutesRemaining: Math.round((new Date(t.slaDeadline).getTime() - now) / 60000) }))
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node ticket-router.mjs <command> [args...]'); console.log('Commands: route, list, update, escalate, sla-check'); process.exit(1); }
  try {
    switch (command) {
      case 'route': if (!args[0]) throw new Error('Missing location_id'); routeTicket(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); listTickets(args[0], args.slice(1)); break;
      case 'update': if (!args[0]) throw new Error('Missing ticket_id'); updateTicket(args[0], args.slice(1)); break;
      case 'escalate': if (!args[0]) throw new Error('Missing ticket_id'); escalateTicket(args[0], args.slice(1)); break;
      case 'sla-check': if (!args[0]) throw new Error('Missing location_id'); slaCheck(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
