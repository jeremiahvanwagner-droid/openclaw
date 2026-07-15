import { describe, it, expect } from 'vitest';

import {
  to24h,
  toScheduleISO,
  mediaFor,
  buildCreatePostBody,
  resolveFbAccountId,
} from '../rtl-social-poster.mjs';

// F4 (Connect REGGIE to FB/IG — posting): the RTL calendar must map to GHL
// Social Planner createPost bodies with correct US-Central → UTC schedules.
describe('to24h', () => {
  it('converts 12h clock times', () => {
    expect(to24h('11:00 AM')).toBe('11:00');
    expect(to24h('1:00 PM')).toBe('13:00');
    expect(to24h('12:00 PM')).toBe('12:00'); // noon
    expect(to24h('12:00 AM')).toBe('00:00'); // midnight
    expect(to24h('5:00 PM')).toBe('17:00');
  });
  it('returns null on garbage', () => {
    expect(to24h('later')).toBeNull();
    expect(to24h('25:00')).toBeNull();
  });
});

describe('toScheduleISO (Central → UTC)', () => {
  it('11:00 AM CDT on Jul 20 is 16:00Z', () => {
    expect(toScheduleISO('2026-07-20', '11:00 AM')).toBe('2026-07-20T16:00:00.000Z');
  });
  it('5:00 PM CDT is 22:00Z', () => {
    expect(toScheduleISO('2026-09-04', '5:00 PM')).toBe('2026-09-04T22:00:00.000Z');
  });
});

describe('mediaFor', () => {
  const item = { graphic: 'assets/posts/post-01-welcome-offer.png', carousel: false };
  it('derives a hosted url from the graphic basename + media base', () => {
    expect(mediaFor(item, 'https://readytolaunchmybusiness.com/social'))
      .toEqual([{ url: 'https://readytolaunchmybusiness.com/social/post-01-welcome-offer.png', type: 'image/png' }]);
  });
  it('is empty when no media base is configured', () => {
    expect(mediaFor(item, '')).toEqual([]);
  });
  it('skips carousels (multi-slide handled later)', () => {
    expect(mediaFor({ graphic: 'assets/carousels/post-03/', carousel: true }, 'https://x/s')).toEqual([]);
  });
});

describe('buildCreatePostBody', () => {
  const item = { n: 1, date: '2026-07-20', time: '11:00 AM', caption: 'hi', graphic: 'a/post-01.png', carousel: false };
  it('maps to a Social Planner body: accountIds, summary, draft status, ISO schedule, rtl tag', () => {
    const b = buildCreatePostBody(item, ['ACC1'], { status: 'draft', mediaBase: '' });
    expect(b).toMatchObject({
      accountIds: ['ACC1'],
      summary: 'hi',
      status: 'draft',
      scheduleDate: '2026-07-20T16:00:00.000Z',
      type: 'post',
      tags: ['rtl-fb-60day'],
    });
    expect(b.media).toBeUndefined(); // no media base -> no image
  });
  it('attaches media when a media base is set', () => {
    const b = buildCreatePostBody(item, ['ACC1'], { status: 'scheduled', mediaBase: 'https://x/s' });
    expect(b.status).toBe('scheduled');
    expect(b.media).toEqual([{ url: 'https://x/s/post-01.png', type: 'image/png' }]);
  });
});

describe('resolveFbAccountId', () => {
  it('picks the facebook account from a mixed list', () => {
    expect(resolveFbAccountId([
      { platform: 'instagram', id: 'IG1' },
      { platform: 'facebook', id: 'FB1' },
    ])).toBe('FB1');
  });
  it('handles the {accounts:[...]} envelope', () => {
    expect(resolveFbAccountId({ accounts: [{ platform: 'facebook', _id: 'FB2' }] })).toBe('FB2');
  });
  it('returns null when no facebook account is connected', () => {
    expect(resolveFbAccountId([{ platform: 'instagram', id: 'IG1' }])).toBeNull();
    expect(resolveFbAccountId({})).toBeNull();
  });
});
