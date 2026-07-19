import { describe, it, expect, afterEach } from 'vitest';

import { resolveChannel, buildReplyBody } from '../rtl-lead-engine.mjs';

// F1 (Connect REGGIE to FB/IG): the RTL engine must route replies onto the
// channel a lead messaged in on, while leaving the proven email path intact.
describe('resolveChannel', () => {
  it('detects Facebook from the workflow channel field or GHL messageType', () => {
    expect(resolveChannel({ channel: 'FB' })).toBe('FB');
    expect(resolveChannel({ channel: 'Facebook' })).toBe('FB');
    expect(resolveChannel({ messageType: 'TYPE_FACEBOOK' })).toBe('FB');
    expect(resolveChannel({ messageType: 'Messenger' })).toBe('FB');
    expect(resolveChannel({ customData: { channel: 'FB' } })).toBe('FB');
  });

  it('detects Instagram', () => {
    expect(resolveChannel({ channel: 'IG' })).toBe('IG');
    expect(resolveChannel({ messageType: 'Instagram' })).toBe('IG');
    expect(resolveChannel({ messageType: 'TYPE_INSTAGRAM' })).toBe('IG');
    expect(resolveChannel({ customData: { messageType: 'IG' } })).toBe('IG');
  });

  it('falls back to Email for email/unknown/empty (the proven path)', () => {
    expect(resolveChannel({ messageType: 'Email' })).toBe('Email');
    expect(resolveChannel({ messageType: 'TYPE_EMAIL' })).toBe('Email');
    expect(resolveChannel({})).toBe('Email');
    expect(resolveChannel({ channel: 'SMS' })).toBe('Email'); // RR has no SMS — fail-safe
  });
});

describe('buildReplyBody', () => {
  afterEach(() => {
    delete process.env.RTL_EMAIL_FROM;
    delete process.env.RTL_EMAIL_FROM_NAME;
  });

  it('email body is unchanged: type/subject/html, paragraph-split, no message field', () => {
    const b = buildReplyBody('c1', 'line one\n\nline two', 'Email');
    expect(b.type).toBe('Email');
    expect(b.contactId).toBe('c1');
    expect(b.subject).toBe('Re: Ready to Launch');
    expect(b.html).toBe('<p>line one</p><p>line two</p>');
    expect(b.message).toBeUndefined();
  });

  it('email honors the branded sender env', () => {
    process.env.RTL_EMAIL_FROM = 'hello@readytolaunchmybusiness.com';
    process.env.RTL_EMAIL_FROM_NAME = 'Royal Results';
    expect(buildReplyBody('c1', 'x', 'Email').emailFrom)
      .toBe('Royal Results <hello@readytolaunchmybusiness.com>');
  });

  it('FB and IG replies are plain text — type + contactId + message only', () => {
    expect(buildReplyBody('c1', 'hey there', 'FB'))
      .toEqual({ type: 'FB', contactId: 'c1', message: 'hey there' });
    expect(buildReplyBody('c1', 'hi', 'IG'))
      .toEqual({ type: 'IG', contactId: 'c1', message: 'hi' });
  });

  it('escapes HTML for email but sends DMs raw', () => {
    expect(buildReplyBody('c', '<b>&', 'Email').html).toContain('&lt;b&gt;&amp;');
    expect(buildReplyBody('c', '<b>&', 'FB').message).toBe('<b>&');
  });
});

describe('F6 comment concierge helpers', () => {
  it('bare T1 keywords are trivial (the comment->DM workflow owns them)', async () => {
    const { isTrivialComment } = await import('../rtl-lead-engine.mjs');
    expect(isTrivialComment('LAUNCH')).toBe(true);
    expect(isTrivialComment('launch!!')).toBe(true);
    expect(isTrivialComment('  List ')).toBe(true);
  });
  it('emoji/short/courtesy comments are trivial', async () => {
    const { isTrivialComment } = await import('../rtl-lead-engine.mjs');
    expect(isTrivialComment('🔥🔥🔥')).toBe(true);
    expect(isTrivialComment('')).toBe(true);
    expect(isTrivialComment('ok')).toBe(true);
    expect(isTrivialComment('Thanks!')).toBe(true);
    expect(isTrivialComment('love it')).toBe(true);
  });
  it('substantive comments are NOT trivial', async () => {
    const { isTrivialComment } = await import('../rtl-lead-engine.mjs');
    expect(isTrivialComment('How long does delivery actually take?')).toBe(false);
    expect(isTrivialComment('LAUNCH? this looks like a scam')).toBe(false);
    expect(isTrivialComment('does this work for coaches')).toBe(false);
  });
  it('rtl.comment is a registered event type and the lane defaults dark', async () => {
    const m = await import('../rtl-lead-engine.mjs');
    expect(m.RTL_EVENT_TYPES).toContain('rtl.comment');
    expect(m.COMMENTS_ENABLED).toBe(false); // RTL_COMMENTS_ENABLED unset in tests
  });
});
