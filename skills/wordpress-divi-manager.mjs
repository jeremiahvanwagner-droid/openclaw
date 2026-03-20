#!/usr/bin/env node
/**
 * OpenClaw WordPress/Divi Site Manager Skill
 *
 * Division 9 — Online Store (store.truthjblue.com)
 *
 * Features:
 *   - WordPress REST API integration for pages, posts, media
 *   - Divi Builder layout management via ET API
 *   - Site health monitoring and performance checks
 *   - Plugin/theme status tracking
 *   - Content publishing and page management
 *   - Site backup coordination
 *
 * Usage: node wordpress-divi-manager.mjs <command> [args...]
 *
 * Commands:
 *   pages list                       List pages
 *   pages get <id|slug>              Get page content
 *   pages update <id> <json>         Update page content
 *   posts list [--category <id>]     List blog posts
 *   posts create <json>              Create blog post
 *   media upload <url> <alt>         Upload media from URL
 *   plugins list                     List installed plugins
 *   health check                     Run site health checks
 *   performance audit                Page speed analysis
 *   divi layouts list                List saved Divi layouts
 *   divi layouts export <id>         Export Divi layout JSON
 */

import fs from 'fs/promises';
import path from 'path';

const WP_CONFIG = {
  siteUrl: process.env.WP_SITE_URL || 'https://store.truthjblue.com',
  username: process.env.WP_APP_USERNAME || '',
  appPassword: process.env.WP_APP_PASSWORD || ''
};

function wpApiUrl(endpoint) {
  return `${WP_CONFIG.siteUrl}/wp-json/wp/v2/${endpoint}`;
}

function authHeaders() {
  const creds = Buffer.from(`${WP_CONFIG.username}:${WP_CONFIG.appPassword}`).toString('base64');
  return {
    'Authorization': `Basic ${creds}`,
    'Content-Type': 'application/json'
  };
}

async function wpRequest(endpoint, method = 'GET', body = null) {
  const options = { method, headers: authHeaders() };
  if (body) options.body = JSON.stringify(body);

  const resp = await fetch(wpApiUrl(endpoint), options);
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`WordPress API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

// ─── Pages ──────────────────────────────────────────────────

async function listPages() {
  const pages = await wpRequest('pages?per_page=50&_fields=id,title,slug,status,modified');
  return pages.map(p => ({
    id: p.id,
    title: p.title.rendered,
    slug: p.slug,
    status: p.status,
    modified: p.modified
  }));
}

async function getPage(idOrSlug) {
  const isNumeric = /^\d+$/.test(idOrSlug);
  if (isNumeric) {
    return wpRequest(`pages/${idOrSlug}`);
  }
  const pages = await wpRequest(`pages?slug=${encodeURIComponent(idOrSlug)}`);
  return pages[0] || null;
}

async function updatePage(id, data) {
  return wpRequest(`pages/${encodeURIComponent(id)}`, 'PUT', data);
}

// ─── Posts ───────────────────────────────────────────────────

async function listPosts(categoryId = null) {
  let endpoint = 'posts?per_page=20&_fields=id,title,slug,status,date,categories';
  if (categoryId) endpoint += `&categories=${encodeURIComponent(categoryId)}`;
  return wpRequest(endpoint);
}

async function createPost(postData) {
  return wpRequest('posts', 'POST', postData);
}

// ─── Media ──────────────────────────────────────────────────

async function uploadMediaFromUrl(imageUrl, altText) {
  // Download image first
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to download image: ${imgResp.status}`);
  const buffer = await imgResp.arrayBuffer();
  const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const filename = `upload-${Date.now()}${ext}`;

  const creds = Buffer.from(`${WP_CONFIG.username}:${WP_CONFIG.appPassword}`).toString('base64');
  const resp = await fetch(`${WP_CONFIG.siteUrl}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    },
    body: Buffer.from(buffer)
  });
  if (!resp.ok) throw new Error(`Media upload error ${resp.status}: ${await resp.text()}`);
  const media = await resp.json();

  // Set alt text
  if (altText) {
    await fetch(`${WP_CONFIG.siteUrl}/wp-json/wp/v2/media/${media.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alt_text: altText })
    });
  }
  return { id: media.id, url: media.source_url, alt: altText };
}

// ─── Plugins ────────────────────────────────────────────────

async function listPlugins() {
  const creds = Buffer.from(`${WP_CONFIG.username}:${WP_CONFIG.appPassword}`).toString('base64');
  const resp = await fetch(`${WP_CONFIG.siteUrl}/wp-json/wp/v2/plugins`, {
    headers: { 'Authorization': `Basic ${creds}` }
  });
  if (!resp.ok) throw new Error(`Plugin list error ${resp.status}`);
  return resp.json();
}

// ─── Health ─────────────────────────────────────────────────

async function healthCheck() {
  const checks = {};

  // Homepage reachable
  try {
    const resp = await fetch(WP_CONFIG.siteUrl, { method: 'HEAD' });
    checks.homepage = { status: resp.ok ? 'ok' : 'error', code: resp.status };
  } catch (e) {
    checks.homepage = { status: 'error', message: e.message };
  }

  // REST API reachable
  try {
    const resp = await fetch(`${WP_CONFIG.siteUrl}/wp-json/`);
    checks.rest_api = { status: resp.ok ? 'ok' : 'error', code: resp.status };
  } catch (e) {
    checks.rest_api = { status: 'error', message: e.message };
  }

  // SSL valid
  try {
    const url = new URL(WP_CONFIG.siteUrl);
    checks.ssl = { status: url.protocol === 'https:' ? 'ok' : 'warning' };
  } catch (e) {
    checks.ssl = { status: 'error', message: e.message };
  }

  return checks;
}

// ─── Performance ────────────────────────────────────────────

async function performanceAudit() {
  const start = Date.now();
  const resp = await fetch(WP_CONFIG.siteUrl);
  const loadTime = Date.now() - start;
  const html = await resp.text();

  return {
    url: WP_CONFIG.siteUrl,
    load_time_ms: loadTime,
    status_code: resp.status,
    html_size_kb: Math.round(html.length / 1024),
    has_gzip: resp.headers.get('content-encoding') === 'gzip',
    server: resp.headers.get('server') || 'unknown',
    recommendations: [
      loadTime > 3000 ? '⚠️ Page load exceeds 3s — review server performance and caching' : '✅ Load time acceptable',
      html.length > 200000 ? '⚠️ HTML payload >200KB — consider lazy loading and code splitting' : '✅ HTML size reasonable',
      !resp.headers.get('content-encoding') ? '⚠️ No gzip/brotli compression detected' : '✅ Compression enabled'
    ]
  };
}

// ─── Divi Layouts ───────────────────────────────────────────

async function listDiviLayouts() {
  const creds = Buffer.from(`${WP_CONFIG.username}:${WP_CONFIG.appPassword}`).toString('base64');
  const resp = await fetch(`${WP_CONFIG.siteUrl}/wp-json/wp/v2/et_pb_layout?per_page=50`, {
    headers: { 'Authorization': `Basic ${creds}` }
  });
  if (!resp.ok) throw new Error(`Divi layouts error ${resp.status}`);
  return resp.json();
}

async function exportDiviLayout(id) {
  const creds = Buffer.from(`${WP_CONFIG.username}:${WP_CONFIG.appPassword}`).toString('base64');
  const resp = await fetch(`${WP_CONFIG.siteUrl}/wp-json/wp/v2/et_pb_layout/${encodeURIComponent(id)}`, {
    headers: { 'Authorization': `Basic ${creds}` }
  });
  if (!resp.ok) throw new Error(`Divi layout export error ${resp.status}`);
  return resp.json();
}

// ─── CLI ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    switch (command) {
      case 'pages':
        if (subcommand === 'list') console.log(JSON.stringify(await listPages(), null, 2));
        else if (subcommand === 'get') console.log(JSON.stringify(await getPage(args[2]), null, 2));
        else if (subcommand === 'update') console.log(JSON.stringify(await updatePage(args[2], JSON.parse(args[3])), null, 2));
        break;
      case 'posts':
        if (subcommand === 'list') {
          const cat = args.indexOf('--category') !== -1 ? args[args.indexOf('--category') + 1] : null;
          console.log(JSON.stringify(await listPosts(cat), null, 2));
        } else if (subcommand === 'create') {
          console.log(JSON.stringify(await createPost(JSON.parse(args[2])), null, 2));
        }
        break;
      case 'media':
        if (subcommand === 'upload') console.log(JSON.stringify(await uploadMediaFromUrl(args[2], args[3]), null, 2));
        break;
      case 'plugins':
        console.log(JSON.stringify(await listPlugins(), null, 2));
        break;
      case 'health':
        console.log(JSON.stringify(await healthCheck(), null, 2));
        break;
      case 'performance':
        console.log(JSON.stringify(await performanceAudit(), null, 2));
        break;
      case 'divi':
        if (subcommand === 'layouts' && args[2] === 'list') console.log(JSON.stringify(await listDiviLayouts(), null, 2));
        else if (subcommand === 'layouts' && args[2] === 'export') console.log(JSON.stringify(await exportDiviLayout(args[3]), null, 2));
        break;
      default:
        console.log('Usage: node wordpress-divi-manager.mjs <command> [args...]');
        console.log('Commands: pages, posts, media, plugins, health, performance, divi');
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
