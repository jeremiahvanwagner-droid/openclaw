#!/usr/bin/env node
/**
 * GHL Social Planner Skill
 * Manages social media posting, scheduling, and account management
 * via the GHL API v2 socialMediaPosting namespace.
 *
 * Primary Division: Division 2 (eCommerce Operations)
 *
 * Usage: node ghl-social-planner.mjs <command> [args...]
 *
 * Commands:
 *   list-posts <locationId> [json]           List/filter posts
 *   create-post <locationId> <json>          Create & schedule post
 *   get-post <locationId> <postId>           Get post details
 *   edit-post <locationId> <postId> <json>   Edit existing post
 *   delete-post <locationId> <postId>        Delete a post
 *   bulk-delete <locationId> <json>          Bulk delete posts
 *   list-accounts <locationId>              List connected accounts
 *   delete-account <locationId> <accountId>  Disconnect account
 *   categories <locationId>                  List post categories
 *   tags <locationId>                        List post tags
 *   stats <locationId> <json>                Get posting statistics
 *   upload-csv <locationId> <filePath>       Bulk upload via CSV
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_DIR = join(OPENCLAW_ROOT, 'logs', 'social-planner');

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
    agentId: parseArg('agent') || 'd2_digital_marketing',
    minCallSpacingMs: 3000,
  });
}

// ─── Commands ───────────────────────────────────────────────────

async function listPosts(locationId, filterJson) {
  const client = getClient();
  const body = filterJson ? JSON.parse(filterJson) : {};
  const result = await client.socialMediaPosting.getPosts(locationId, body);
  const posts = result?.posts || result?.data || [];
  console.log(JSON.stringify({
    action: 'list-posts',
    locationId,
    count: posts.length,
    posts: posts.map(p => ({
      id: p.id || p._id,
      summary: p.summary || p.text?.slice(0, 80),
      status: p.status,
      platforms: p.platforms || p.accountIds,
      scheduledAt: p.scheduledAt || p.schedule_time,
    })),
  }, null, 2));
}

async function createPost(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.socialMediaPosting.createPost(locationId, body);
  log('create-post', { locationId, postId: result?.id || result?.post?.id });
  console.log(JSON.stringify({
    action: 'create-post',
    locationId,
    result,
    status: 'created',
  }, null, 2));
}

async function getPost(locationId, postId) {
  const client = getClient();
  const result = await client.socialMediaPosting.getPost(locationId, postId);
  console.log(JSON.stringify({
    action: 'get-post',
    locationId,
    postId,
    post: result,
  }, null, 2));
}

async function editPost(locationId, postId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.socialMediaPosting.editPost(locationId, postId, body);
  log('edit-post', { locationId, postId });
  console.log(JSON.stringify({
    action: 'edit-post',
    locationId,
    postId,
    result,
  }, null, 2));
}

async function deletePost(locationId, postId) {
  const client = getClient();
  const result = await client.socialMediaPosting.deletePost(locationId, postId);
  log('delete-post', { locationId, postId });
  console.log(JSON.stringify({
    action: 'delete-post',
    locationId,
    postId,
    result,
    status: 'deleted',
  }, null, 2));
}

async function bulkDelete(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.socialMediaPosting.bulkDeleteSocialPlannerPosts(locationId, body);
  log('bulk-delete', { locationId, count: body.postIds?.length });
  console.log(JSON.stringify({
    action: 'bulk-delete',
    locationId,
    result,
  }, null, 2));
}

async function listAccounts(locationId) {
  const client = getClient();
  const result = await client.socialMediaPosting.getAccount(locationId);
  const accounts = result?.accounts || result?.data || [];
  console.log(JSON.stringify({
    action: 'list-accounts',
    locationId,
    count: Array.isArray(accounts) ? accounts.length : 1,
    accounts,
  }, null, 2));
}

async function deleteAccount(locationId, accountId) {
  const client = getClient();
  const result = await client.socialMediaPosting.deleteAccount(locationId, accountId);
  log('delete-account', { locationId, accountId });
  console.log(JSON.stringify({
    action: 'delete-account',
    locationId,
    accountId,
    result,
    status: 'deleted',
  }, null, 2));
}

async function listCategories(locationId) {
  const client = getClient();
  const result = await client.socialMediaPosting.getCategoriesLocationId(locationId, {});
  console.log(JSON.stringify({
    action: 'categories',
    locationId,
    categories: result?.categories || result,
  }, null, 2));
}

async function listTags(locationId) {
  const client = getClient();
  const result = await client.socialMediaPosting.getTagsLocationId(locationId, {});
  console.log(JSON.stringify({
    action: 'tags',
    locationId,
    tags: result?.tags || result,
  }, null, 2));
}

async function getStats(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.socialMediaPosting.getSocialMediaStatistics({ locationId }, body);
  console.log(JSON.stringify({
    action: 'stats',
    locationId,
    statistics: result,
  }, null, 2));
}

async function uploadCsv(locationId, filePath) {
  const client = getClient();
  const fileContent = readFileSync(filePath);
  const FormData = (await import('undici')).FormData;
  const formData = new FormData();
  formData.append('file', new Blob([fileContent]), filePath.split(/[\\/]/).pop());
  const result = await client.socialMediaPosting.uploadCsv(locationId, formData);
  log('upload-csv', { locationId, file: filePath });
  console.log(JSON.stringify({
    action: 'upload-csv',
    locationId,
    result,
  }, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'list-posts': () => listPosts(args[0], args[1]),
  'create-post': () => createPost(args[0], args[1]),
  'get-post': () => getPost(args[0], args[1]),
  'edit-post': () => editPost(args[0], args[1], args[2]),
  'delete-post': () => deletePost(args[0], args[1]),
  'bulk-delete': () => bulkDelete(args[0], args[1]),
  'list-accounts': () => listAccounts(args[0]),
  'delete-account': () => deleteAccount(args[0], args[1]),
  'categories': () => listCategories(args[0]),
  'tags': () => listTags(args[0]),
  'stats': () => getStats(args[0], args[1]),
  'upload-csv': () => uploadCsv(args[0], args[1]),
};

if (!command || !commands[command]) {
  console.error(`Usage: node ghl-social-planner.mjs <command> [args...]
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
