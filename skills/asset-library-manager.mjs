#!/usr/bin/env node
/**
 * Asset Library Manager
 * Upload, organize, and retrieve media assets in GHL media library
 *
 * Usage: node asset-library-manager.mjs <command> [args...]
 *
 * Commands:
 *   upload <location_id> --file "<path>" --folder "<folder>"     Upload asset
 *   list <location_id> [--folder "<folder>"] [--type "image|video|document"]
 *   get <location_id> <file_id>                                   Get asset details
 *   delete <location_id> <file_id>                                Delete asset
 *   create-folder <location_id> --name "<folder_name>"            Create folder
 */

import { readFileSync, existsSync, createReadStream } from 'fs';
import { join, basename, extname } from 'path';

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
  if (response.status === 204) return {};
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

function getMimeType(filepath) {
  const ext = extname(filepath).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return map[ext] || 'application/octet-stream';
}

async function uploadAsset(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.file) throw new Error('Required: --file "<file_path>"');
  if (!existsSync(opts.file)) throw new Error(`File not found: ${opts.file}`);
  const token = findTokenForLocation(locationId);
  const fileName = basename(opts.file);
  const fileData = readFileSync(opts.file);
  const base64 = fileData.toString('base64');

  const result = await apiCall('POST', '/medias/upload', token, {
    locationId,
    name: fileName,
    file: `data:${getMimeType(opts.file)};base64,${base64}`,
    folder: opts.folder || 'general'
  });

  console.log(JSON.stringify({
    action: 'upload', locationId,
    fileId: result.media?.id || result.id,
    name: fileName, folder: opts.folder || 'general',
    mimeType: getMimeType(opts.file),
    status: 'uploaded'
  }, null, 2));
}

async function listAssets(locationId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  let endpoint = `/medias/?locationId=${locationId}`;
  if (opts.folder) endpoint += `&folder=${encodeURIComponent(opts.folder)}`;
  if (opts.type) endpoint += `&type=${opts.type}`;
  const result = await apiCall('GET', endpoint, token);
  const media = (result.medias || []).map(m => ({ id: m.id, name: m.name, type: m.type, url: m.url, folder: m.folder }));
  console.log(JSON.stringify({ action: 'list', locationId, total: media.length, media }, null, 2));
}

async function getAsset(locationId, fileId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/medias/${fileId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, media: result }, null, 2));
}

async function deleteAsset(locationId, fileId) {
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/medias/${fileId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'delete', locationId, fileId, status: 'deleted' }, null, 2));
}

async function createFolder(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<folder_name>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('POST', '/medias/folders', token, { locationId, name: opts.name });
  console.log(JSON.stringify({ action: 'create-folder', locationId, folderId: result.folder?.id || result.id, name: opts.name, status: 'created' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node asset-library-manager.mjs <command> [args...]'); console.log('Commands: upload, list, get, delete, create-folder'); process.exit(1); }
  try {
    switch (command) {
      case 'upload': if (!args[0]) throw new Error('Missing location_id'); await uploadAsset(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listAssets(args[0], args.slice(1)); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or file_id'); await getAsset(args[0], args[1]); break;
      case 'delete': if (!args[0] || !args[1]) throw new Error('Missing location_id or file_id'); await deleteAsset(args[0], args[1]); break;
      case 'create-folder': if (!args[0]) throw new Error('Missing location_id'); await createFolder(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
