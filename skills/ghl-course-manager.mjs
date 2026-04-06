#!/usr/bin/env node
/**
 * GHL Course Manager Skill
 * Manages course/membership import and lifecycle
 * via the GHL API v2 courses namespace.
 *
 * Primary Divisions: Division 4 (Coaching & Community), Division 5 (Publishing)
 *
 * Note: The GHL Courses API currently exposes only the import endpoint.
 * For full course CRUD (create lessons, manage access), browser automation
 * via ghl-browser-control.mjs remains the primary method.
 *
 * Usage: node ghl-course-manager.mjs <command> [args...]
 *
 * Commands:
 *   import <json>         Import courses from external source
 *   status                Show current course management capabilities
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_DIR = join(OPENCLAW_ROOT, 'logs', 'course-manager');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────────────────

function parseArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function log(action, data) {
  const entry = { timestamp: new Date().toISOString(), action, ...data };
  const logFile = join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function getClient() {
  const location = parseArg('location');
  return createGhlClientV2(location, {
    agentId: parseArg('agent') || 'd4_content_creator',
    minCallSpacingMs: 3000,
  });
}

// ─── Commands ───────────────────────────────────────────────────

async function importCourses(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);

  // Validate required fields
  if (!body.locationId) {
    throw new Error('locationId is required in the import body');
  }

  const result = await client.courses.importCourses(body);
  log('import', {
    locationId: body.locationId,
    courseCount: body.courses?.length || 0,
    result: result?.status || 'submitted',
  });
  console.log(JSON.stringify({
    action: 'import',
    locationId: body.locationId,
    courseCount: body.courses?.length || 0,
    result,
    status: 'imported',
  }, null, 2));
}

async function showStatus() {
  console.log(JSON.stringify({
    action: 'status',
    api_capabilities: {
      import: {
        available: true,
        method: 'POST /courses/courses-exporter/public/import',
        description: 'Import courses from external source into a GHL location',
      },
    },
    browser_capabilities: {
      create_course: { available: true, via: 'ghl-browser-control.mjs' },
      create_lesson: { available: true, via: 'ghl-browser-control.mjs' },
      manage_access: { available: true, via: 'ghl-browser-control.mjs' },
      configure_pricing: { available: true, via: 'ghl-browser-control.mjs' },
    },
    note: 'Full course CRUD requires browser automation. The API currently supports import only. Use ghl-browser-control.mjs for create/update/delete operations.',
  }, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'import': () => importCourses(args[0]),
  'status': () => showStatus(),
};

if (!command || !commands[command]) {
  console.error(`Usage: node ghl-course-manager.mjs <command> [args...]
Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

try {
  await commands[command]();
} catch (error) {
  console.error(JSON.stringify({
    error: error.message,
    status: error.status || 500,
    command,
  }));
  process.exit(1);
}
