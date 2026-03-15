#!/usr/bin/env node
/**
 * Calendar Booking Bot
 * Check GHL calendar availability and book appointments
 *
 * Usage: node calendar-booking-bot.mjs <command> [args...]
 *
 * Commands:
 *   availability <location_id> <calendar_id> --date "<YYYY-MM-DD>"   Check available slots
 *   book <location_id> <calendar_id> <contact_id> --slot "<iso>"     Book appointment
 *   cancel <location_id> <appointment_id>                             Cancel booking
 *   list-calendars <location_id>                                       List calendars
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  for (const [, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return entry.access_token;
  }
  throw new Error(`No token found for location ${locationId}`);
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  lastCallAt = Date.now();
  const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${GHL_BASE}${endpoint}`, options);
  if (!response.ok) { const err = await response.text(); throw new Error(`GHL API (${response.status}): ${err}`); }
  return response.json();
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

async function checkAvailability(locationId, calendarId, args) {
  const opts = parseArgs(args);
  if (!opts.date) throw new Error('Required: --date "<YYYY-MM-DD>"');
  const token = findTokenForLocation(locationId);

  const startDate = new Date(opts.date + 'T00:00:00').getTime();
  const endDate = new Date(opts.date + 'T23:59:59').getTime();

  const result = await apiCall('GET', `/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}&timezone=${opts.timezone || 'America/New_York'}`, token);

  console.log(JSON.stringify({
    action: 'availability', locationId, calendarId, date: opts.date,
    slots: result.slots || result
  }, null, 2));
}

async function bookAppointment(locationId, calendarId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.slot) throw new Error('Required: --slot "<iso_datetime>"');
  const token = findTokenForLocation(locationId);

  const result = await apiCall('POST', '/calendars/events/appointments', token, {
    calendarId,
    locationId,
    contactId,
    startTime: opts.slot,
    title: opts.title || 'Appointment',
    appointmentStatus: 'confirmed'
  });

  console.log(JSON.stringify({
    action: 'book', locationId, calendarId, contactId,
    appointmentId: result.id || result.event?.id,
    startTime: opts.slot,
    status: 'confirmed'
  }, null, 2));
}

async function cancelAppointment(locationId, appointmentId) {
  const token = findTokenForLocation(locationId);
  await apiCall('PUT', `/calendars/events/appointments/${appointmentId}`, token, {
    appointmentStatus: 'cancelled'
  });

  console.log(JSON.stringify({ action: 'cancel', locationId, appointmentId, status: 'cancelled' }, null, 2));
}

async function listCalendars(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/calendars/?locationId=${locationId}`, token);
  const calendars = (result.calendars || []).map(c => ({ id: c.id, name: c.name, description: c.description, isActive: c.isActive }));

  console.log(JSON.stringify({ action: 'list-calendars', locationId, total: calendars.length, calendars }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node calendar-booking-bot.mjs <command> [args...]'); console.log('Commands: availability, book, cancel, list-calendars'); process.exit(1); }
  try {
    switch (command) {
      case 'availability': if (!args[0] || !args[1]) throw new Error('Missing location_id or calendar_id'); await checkAvailability(args[0], args[1], args.slice(2)); break;
      case 'book': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: book <location_id> <calendar_id> <contact_id>'); await bookAppointment(args[0], args[1], args[2], args.slice(3)); break;
      case 'cancel': if (!args[0] || !args[1]) throw new Error('Missing location_id or appointment_id'); await cancelAppointment(args[0], args[1]); break;
      case 'list-calendars': if (!args[0]) throw new Error('Missing location_id'); await listCalendars(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
