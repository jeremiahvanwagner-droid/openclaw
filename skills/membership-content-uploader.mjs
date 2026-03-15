#!/usr/bin/env node
/**
 * Membership Content Uploader
 * Upload and organize course content in GHL membership areas
 *
 * Usage: node membership-content-uploader.mjs <command> [args...]
 *
 * Commands:
 *   create-product <location_id> --name "<n>" --type "course"
 *   add-category <location_id> <product_id> --name "<n>" [--drip_days <d>]
 *   add-post <location_id> <product_id> <category_id> --title "<t>" --content "<html>" [--video_url "<u>"]
 *   list-products <location_id>
 *   list-content <location_id> <product_id>
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

async function createProduct(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<product_name>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('POST', `/membership/products`, token, {
    locationId, name: opts.name, type: opts.type || 'course',
    description: opts.description || ''
  });
  console.log(JSON.stringify({
    action: 'create-product', locationId,
    productId: result.product?.id || result.id,
    name: opts.name, type: opts.type || 'course',
    status: 'created'
  }, null, 2));
}

async function addCategory(locationId, productId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<category_name>"');
  const token = findTokenForLocation(locationId);
  const body = { name: opts.name, productId };
  if (opts.drip_days) body.dripDays = parseInt(opts.drip_days, 10);
  const result = await apiCall('POST', `/membership/products/${productId}/categories`, token, body);
  console.log(JSON.stringify({
    action: 'add-category', locationId, productId,
    categoryId: result.category?.id || result.id,
    name: opts.name, dripDays: opts.drip_days || 0,
    status: 'created'
  }, null, 2));
}

async function addPost(locationId, productId, categoryId, args) {
  const opts = parseArgs(args);
  if (!opts.title || !opts.content) throw new Error('Required: --title "<title>" --content "<html>"');
  const token = findTokenForLocation(locationId);
  const body = { title: opts.title, content: opts.content, categoryId, productId };
  if (opts.video_url) body.videoUrl = opts.video_url;
  if (opts.downloadable) body.downloadableUrl = opts.downloadable;
  const result = await apiCall('POST', `/membership/products/${productId}/posts`, token, body);
  console.log(JSON.stringify({
    action: 'add-post', locationId, productId, categoryId,
    postId: result.post?.id || result.id,
    title: opts.title, hasVideo: !!opts.video_url,
    status: 'created'
  }, null, 2));
}

async function listProducts(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/membership/products?locationId=${locationId}`, token);
  const products = (result.products || []).map(p => ({ id: p.id, name: p.name, type: p.type, categories: (p.categories || []).length }));
  console.log(JSON.stringify({ action: 'list-products', locationId, total: products.length, products }, null, 2));
}

async function listContent(locationId, productId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/membership/products/${productId}?locationId=${locationId}`, token);
  const categories = (result.categories || []).map(c => ({
    id: c.id, name: c.name, dripDays: c.dripDays,
    posts: (c.posts || []).map(p => ({ id: p.id, title: p.title }))
  }));
  console.log(JSON.stringify({ action: 'list-content', locationId, productId, categories }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node membership-content-uploader.mjs <command> [args...]'); console.log('Commands: create-product, add-category, add-post, list-products, list-content'); process.exit(1); }
  try {
    switch (command) {
      case 'create-product': if (!args[0]) throw new Error('Missing location_id'); await createProduct(args[0], args.slice(1)); break;
      case 'add-category': if (!args[0] || !args[1]) throw new Error('Missing location_id or product_id'); await addCategory(args[0], args[1], args.slice(2)); break;
      case 'add-post': if (!args[0] || !args[1] || !args[2]) throw new Error('Missing location_id, product_id, or category_id'); await addPost(args[0], args[1], args[2], args.slice(3)); break;
      case 'list-products': if (!args[0]) throw new Error('Missing location_id'); await listProducts(args[0]); break;
      case 'list-content': if (!args[0] || !args[1]) throw new Error('Missing location_id or product_id'); await listContent(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
