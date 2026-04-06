#!/usr/bin/env node
/**
 * GHL Media Manager Skill
 * Manages file uploads, folder organization, and media library CRUD
 * via the GHL API v2 medias namespace.
 *
 * Shared across all divisions (any agent with medias scope).
 *
 * Usage: node ghl-media-manager.mjs <command> [args...]
 *
 * Commands:
 *   list [--altType agency|location] [--altId <id>] [--type file|folder]  List files/folders
 *   upload <filePath> [--altType agency|location] [--altId <id>]          Upload a file
 *   create-folder <json>                                                   Create folder
 *   update <mediaId> <json>                                                Update file/folder
 *   delete <mediaId> [--altType <type>] [--altId <id>]                    Delete file/folder
 *   bulk-update <json>                                                     Bulk update files
 *   bulk-delete <json>                                                     Bulk delete/trash
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_DIR = join(OPENCLAW_ROOT, 'logs', 'media-manager');

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
    agentId: parseArg('agent') || 'd2_graphic_designer',
    minCallSpacingMs: 3000,
  });
}

// ─── Commands ───────────────────────────────────────────────────

async function listMedia() {
  const client = getClient();
  const params = {
    altType: parseArg('altType') || 'location',
    altId: parseArg('altId') || client.tenant.locationId,
    type: parseArg('type') || 'file',
    sortBy: parseArg('sortBy') || 'createdAt',
    sortOrder: parseArg('sortOrder') || 'desc',
    limit: parseInt(parseArg('limit') || '50', 10),
    offset: parseInt(parseArg('offset') || '0', 10),
  };
  const parentId = parseArg('parentId');
  if (parentId) params.parentId = parentId;

  const result = await client.medias.fetchMediaContent(params);
  const files = result?.files || result?.data || [];
  console.log(JSON.stringify({
    action: 'list',
    count: files.length,
    files: files.map(f => ({
      id: f.id || f._id,
      name: f.name,
      type: f.type,
      size: f.size,
      url: f.url,
      createdAt: f.createdAt,
    })),
  }, null, 2));
}

async function uploadFile(filePath) {
  const client = getClient();
  const altType = parseArg('altType') || 'location';
  const altId = parseArg('altId') || client.tenant.locationId;
  const fileName = basename(filePath);

  const fileContent = readFileSync(filePath);
  const FormData = (await import('undici')).FormData;
  const formData = new FormData();
  formData.append('file', new Blob([fileContent]), fileName);
  formData.append('hosted', 'true');
  formData.append('fileUploadBody', JSON.stringify({
    altType,
    altId,
    name: fileName,
  }));

  const result = await client.medias.uploadMediaContent(formData);
  log('upload', { fileName, altType, altId, mediaId: result?.id });
  console.log(JSON.stringify({
    action: 'upload',
    fileName,
    result,
    status: 'uploaded',
  }, null, 2));
}

async function createFolder(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.medias.createMediaFolder(body);
  log('create-folder', { name: body.name, folderId: result?.id });
  console.log(JSON.stringify({
    action: 'create-folder',
    result,
    status: 'created',
  }, null, 2));
}

async function updateMedia(mediaId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.medias.updateMediaObject(mediaId, body);
  log('update', { mediaId });
  console.log(JSON.stringify({
    action: 'update',
    mediaId,
    result,
  }, null, 2));
}

async function deleteMedia(mediaId) {
  const client = getClient();
  const altType = parseArg('altType') || 'location';
  const altId = parseArg('altId') || client.tenant.locationId;
  const result = await client.medias.deleteMediaContent(mediaId, { altType, altId });
  log('delete', { mediaId });
  console.log(JSON.stringify({
    action: 'delete',
    mediaId,
    result,
    status: 'deleted',
  }, null, 2));
}

async function bulkUpdate(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.medias.bulkUpdateMediaObjects(body);
  log('bulk-update', { count: body.ids?.length || body.fileIds?.length });
  console.log(JSON.stringify({
    action: 'bulk-update',
    result,
  }, null, 2));
}

async function bulkDelete(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.medias.bulkDeleteMediaObjects(body);
  log('bulk-delete', { count: body.ids?.length || body.fileIds?.length });
  console.log(JSON.stringify({
    action: 'bulk-delete',
    result,
  }, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'list': () => listMedia(),
  'upload': () => uploadFile(args[0]),
  'create-folder': () => createFolder(args[0]),
  'update': () => updateMedia(args[0], args[1]),
  'delete': () => deleteMedia(args[0]),
  'bulk-update': () => bulkUpdate(args[0]),
  'bulk-delete': () => bulkDelete(args[0]),
};

if (!command || !commands[command]) {
  console.error(`Usage: node ghl-media-manager.mjs <command> [args...]
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
