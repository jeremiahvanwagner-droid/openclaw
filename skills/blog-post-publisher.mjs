#!/usr/bin/env node
/**
 * Blog Post Publisher
 * Create and publish blog posts to GHL sites via API
 *
 * Usage: node blog-post-publisher.mjs <command> [args...]
 *
 * Commands:
 *   publish <location_id> --title "<t>" --body "<html>" [--slug "<s>"] [--author "<a>"]
 *   list <location_id> [--status "published|draft"]
 *   get <location_id> <post_id>
 *   update <location_id> <post_id> --title "<t>" --body "<html>"
 *   delete <location_id> <post_id>
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

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function publishPost(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.title || !opts.body) throw new Error('Required: --title "<title>" --body "<html_content>"');
  const token = findTokenForLocation(locationId);

  const result = await apiCall('POST', `/blogs/posts`, token, {
    locationId,
    title: opts.title,
    slug: opts.slug || slugify(opts.title),
    body: opts.body,
    author: opts.author || 'Team',
    status: opts.draft ? 'draft' : 'published',
    publishedAt: new Date().toISOString()
  });

  console.log(JSON.stringify({
    action: 'publish', locationId,
    postId: result.post?.id || result.id,
    title: opts.title,
    slug: opts.slug || slugify(opts.title),
    status: opts.draft ? 'draft' : 'published'
  }, null, 2));
}

async function listPosts(locationId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  let endpoint = `/blogs/posts?locationId=${locationId}`;
  if (opts.status) endpoint += `&status=${opts.status}`;
  const result = await apiCall('GET', endpoint, token);
  const posts = (result.posts || []).map(p => ({ id: p.id, title: p.title, slug: p.slug, status: p.status, publishedAt: p.publishedAt }));
  console.log(JSON.stringify({ action: 'list', locationId, total: posts.length, posts }, null, 2));
}

async function getPost(locationId, postId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/blogs/posts/${postId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, post: result }, null, 2));
}

async function updatePost(locationId, postId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const body = {};
  if (opts.title) body.title = opts.title;
  if (opts.body) body.body = opts.body;
  if (opts.status) body.status = opts.status;
  await apiCall('PUT', `/blogs/posts/${postId}`, token, body);
  console.log(JSON.stringify({ action: 'update', locationId, postId, updated: Object.keys(body), status: 'updated' }, null, 2));
}

async function deletePost(locationId, postId) {
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/blogs/posts/${postId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'delete', locationId, postId, status: 'deleted' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node blog-post-publisher.mjs <command> [args...]'); console.log('Commands: publish, list, get, update, delete'); process.exit(1); }
  try {
    switch (command) {
      case 'publish': if (!args[0]) throw new Error('Missing location_id'); await publishPost(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listPosts(args[0], args.slice(1)); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or post_id'); await getPost(args[0], args[1]); break;
      case 'update': if (!args[0] || !args[1]) throw new Error('Missing location_id or post_id'); await updatePost(args[0], args[1], args.slice(2)); break;
      case 'delete': if (!args[0] || !args[1]) throw new Error('Missing location_id or post_id'); await deletePost(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
