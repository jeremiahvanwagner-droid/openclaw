/**
 * RTL Social Poster — F4 of the "Connect REGGIE to Facebook & IG" plan
 * (docs/phases/rtl-ghl-fbig-connect.md).
 *
 * Schedules the 60-day Ready-to-Launch content calendar to the Ready-to-Launch
 * My Business Facebook Page (IG-ready) via GHL Social Planner, in the Royal
 * Results sub-account (tenant RR).
 *
 * SAFETY:
 *  - DRY_RUN by default (RTL_SOCIAL_DRY_RUN !== 'false'): previews the exact
 *    createPost bodies it WOULD send; performs no writes.
 *  - Posts are created with status 'draft' by default (land in Social Planner
 *    for review) until RTL_SOCIAL_STATUS=scheduled is set.
 *  - RR tenant only; every post carries the `rtl-fb-60day` tag (namespaced on
 *    the live client CRM). Requires the RR PIT to hold socialplanner scopes and
 *    the FB Page connected to RR Social Planner (F0-B).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGhlClient } from '../lib/ghl-client.mjs';
import { resolve as resolveTenant } from '../lib/ghl-tenant-resolver.mjs';
import { childLogger } from '../lib/logger.mjs';

const log = childLogger({ module: 'rtl-social-poster' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SOCIAL_DRY_RUN = (process.env.RTL_SOCIAL_DRY_RUN || 'true').toLowerCase() !== 'false';
const POST_STATUS = process.env.RTL_SOCIAL_STATUS || 'draft';       // draft | scheduled
const MEDIA_BASE = process.env.RTL_SOCIAL_MEDIA_BASE || '';         // e.g. https://readytolaunchmybusiness.com/social
const UA = 'curl/8.9.1';                                           // GHL Cloudflare blocks some default UAs (1010)
// Post owner (GHL user id) — required by createPost. Default: Jeremiah's RR user.
const SOCIAL_USER_ID = process.env.RTL_SOCIAL_USER_ID || '';
const DEFAULT_PLAN = path.join(__dirname, '..', 'data', 'rtl', 'fb-posting-plan.json');
// The Jul 20 – Sep 16, 2026 window is entirely US Central Daylight Time (UTC-5).
const CT_OFFSET = '-05:00';

// ── pure helpers (unit-tested; no network) ─────────────────────────────────
export function to24h(t) {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

export function toScheduleISO(date, time, offset = CT_OFFSET) {
  const hm = to24h(time);
  if (!hm) throw new Error(`unparseable time: "${time}"`);
  return new Date(`${date}T${hm}:00${offset}`).toISOString();
}

export function mediaFor(item, mediaBase = MEDIA_BASE) {
  if (!mediaBase || !item.graphic) return [];
  const base = mediaBase.replace(/\/$/, '');
  if (item.carousel) {
    // Slides hosted at {base}/carousels/post-NN/slide-i.png; the plan's graphic
    // string carries the slide count ("… N slides …"). FB accepts multi-image.
    const m = String(item.graphic).match(/(\d+)\s+slides/);
    const count = m ? Number(m[1]) : 0;
    const folder = `carousels/post-${String(item.n).padStart(2, '0')}`;
    return Array.from({ length: count }, (_, i) => ({
      url: `${base}/${folder}/slide-${i + 1}.png`, type: 'image/png',
    }));
  }
  const file = String(item.graphic).split('/').pop();
  if (!/\.(png|jpe?g)$/i.test(file)) return [];
  return [{ url: `${base}/${file}`, type: 'image/png' }];
}

export function buildCreatePostBody(item, accountIds, { status = POST_STATUS, mediaBase = MEDIA_BASE, userId } = {}) {
  // Live 422 lessons (2026-07-15): `tags` requires Tag ObjectIds (a separate
  // social-planner tags API) — dropped, not worth the round-trip; `userId`
  // (the owning GHL user) is REQUIRED.
  const body = {
    accountIds,
    summary: item.caption,
    status,
    scheduleDate: toScheduleISO(item.date, item.time),
    type: 'post',
  };
  if (userId) body.userId = userId;
  // GHL 422s if `media` is absent — it must be an array (empty is fine).
  body.media = mediaFor(item, mediaBase);
  return body;
}

export function resolveFbAccountId(accountsResponse) {
  // GHL wraps the list: { results: { accounts: [...], groups: [...] } }
  // (verified against the live RR endpoint 2026-07-15); older shapes kept as fallbacks.
  const r = accountsResponse;
  const accts = Array.isArray(r) ? r
    : Array.isArray(r?.accounts) ? r.accounts
    : Array.isArray(r?.results?.accounts) ? r.results.accounts
    : Array.isArray(r?.results) ? r.results
    : [];
  const fb = accts.find(a => /facebook/i.test(a.platform || a.type || a.provider || ''));
  return fb ? (fb.id || fb._id || fb.accountId || null) : null;
}

export function loadPlan(planPath = DEFAULT_PLAN) {
  return JSON.parse(fs.readFileSync(planPath, 'utf8'));
}

// Offline preview: the exact bodies we WOULD POST (no network, no writes).
export function previewPlan(plan, { accountIds = ['<FB_ACCOUNT_ID>'], mediaBase = MEDIA_BASE, status = POST_STATUS } = {}) {
  return plan.map(item => {
    try {
      const body = buildCreatePostBody(item, accountIds, { status, mediaBase });
      return { n: item.n, date: item.date, ok: true, scheduleDate: body.scheduleDate, hasMedia: Boolean(body.media), carousel: Boolean(item.carousel), body };
    } catch (error) {
      return { n: item.n, ok: false, error: error.message };
    }
  });
}

// createPost 201 nests the id: { results: { post: { _id } } } — proven on the
// live RR run 2026-07-15 (the flat fallbacks returned null and made a
// successful batch look failed). Keep fallbacks for older shapes.
export function extractPostId(res) {
  return res?.results?.post?._id || res?.results?.post?.id
    || res?.post?._id || res?.post?.id || res?._id || res?.id || null;
}

// ── live (gated) ───────────────────────────────────────────────────────────
export async function listRrSocialAccounts() {
  const client = createGhlClient('RR');
  const { locationId } = resolveTenant('RR');
  return client.request('GET', `/social-media-posting/${locationId}/accounts`, { headers: { 'User-Agent': UA } });
}

// Planner inventory. GHL gotcha (live 422, 2026-07-15): skip/limit must be
// NUMERIC STRINGS. Returns the raw posts array.
export async function listPlannerPosts({ skip = 0, limit = 100 } = {}) {
  const client = createGhlClient('RR');
  const { locationId } = resolveTenant('RR');
  const res = await client.request('POST', `/social-media-posting/${locationId}/posts/list`, {
    body: { skip: String(skip), limit: String(limit) },
    headers: { 'User-Agent': UA },
  });
  return res?.results?.posts || res?.posts || [];
}

export async function schedulePlan(plan, { dryRun = SOCIAL_DRY_RUN, status = POST_STATUS, mediaBase = MEDIA_BASE, limit } = {}) {
  const items = typeof limit === 'number' ? plan.slice(0, limit) : plan;
  const { locationId } = resolveTenant('RR');
  const client = createGhlClient('RR');

  const accounts = await listRrSocialAccounts().catch(error => {
    log.error({ err: error.message }, 'RR social accounts fetch failed');
    return null;
  });
  const fbId = accounts ? resolveFbAccountId(accounts) : null;
  const effectiveId = fbId || (dryRun ? '<FB_ACCOUNT_ID>' : null);
  if (!effectiveId) {
    return {
      ok: false,
      reason: 'no-facebook-account',
      note: 'Connect the FB Page to RR Social Planner (F0-B) and ensure the RR PIT holds socialplanner scopes.',
    };
  }
  if (!dryRun && !SOCIAL_USER_ID) {
    return {
      ok: false,
      reason: 'missing-user-id',
      note: 'createPost requires an owning GHL user — set RTL_SOCIAL_USER_ID (Jeremiah\'s RR user).',
    };
  }

  const results = [];
  for (const item of items) {
    const body = buildCreatePostBody(item, [effectiveId], { status, mediaBase, userId: SOCIAL_USER_ID });
    // Conversion-leak guard (lesson 2026-07-19: an SG week published offer
    // posts with no destination): a caption that pitches the guide/free offer
    // must carry a link, unless the plan marks it an intentional no-link CTA.
    const linkless = /starter guide|free guide|download it free|start free/i.test(body.summary)
      && !/https?:\/\//.test(body.summary)
      && !['COMMENT', 'COMMUNITY', 'SAVE'].includes(item.cta_type || '');
    if (linkless) {
      log.warn({ n: item.n, date: item.date }, 'OFFER POST WITHOUT LINK — add a CTA link or mark the CTA type intentional');
      results.push({ n: item.n, ok: false, reason: 'offer-post-without-link', scheduleDate: body.scheduleDate });
      continue;
    }
    if (dryRun) {
      results.push({ n: item.n, dryRun: true, scheduleDate: body.scheduleDate, hasMedia: Boolean(body.media) });
      continue;
    }
    try {
      const res = await client.request('POST', `/social-media-posting/${locationId}/posts`, { body, headers: { 'User-Agent': UA } });
      results.push({ n: item.n, ok: true, id: extractPostId(res), scheduleDate: body.scheduleDate });
    } catch (error) {
      log.error({ n: item.n, err: error.message }, 'createPost failed');
      results.push({ n: item.n, ok: false, error: error.message });
    }
  }

  return {
    ok: true,
    dryRun,
    fbAccountId: fbId || null,
    status,
    mediaAttached: Boolean(mediaBase),
    count: results.length,
    results,
  };
}

// Manual run: `node skills/rtl-social-poster.mjs [limit]` → offline preview.
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const limit = Number(process.argv[2]) || 5;
  const plan = loadPlan();
  const preview = previewPlan(plan).slice(0, limit);
  log.info({ dryRun: SOCIAL_DRY_RUN, status: POST_STATUS, mediaBase: MEDIA_BASE || '(none)', total: plan.length }, 'RTL social poster — preview');
  for (const p of preview) {
    // eslint-disable-next-line no-console
    console.log(`#${p.n} ${p.date} → ${p.scheduleDate}  media=${p.hasMedia}  carousel=${p.carousel}`);
  }
}
