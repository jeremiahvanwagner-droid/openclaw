import { readFile } from 'fs/promises';
import { describe, it, expect } from 'vitest';

describe('business-registry.json wave alignment', () => {
  it('parses as valid JSON with a businesses array', async () => {
    const raw = await readFile('data/business-registry.json', 'utf8');
    const json = JSON.parse(raw);
    expect(Array.isArray(json.businesses)).toBe(true);
    expect(json.businesses.length).toBeGreaterThan(0);
  });

  // Wave numbers pin the dashboard truth (Supabase business_registry),
  // reconciled 2026-07-12 per CVO — audit entries 2026-07-12-004/-006.
  it('Beyond the Veil (biz_02) is in rollout wave 3', async () => {
    const raw = await readFile('data/business-registry.json', 'utf8');
    const { businesses } = JSON.parse(raw);
    const btv = businesses.find(
      (b: { business_id: string }) => b.business_id === 'biz_02_beyond_the_veil',
    );
    expect(btv).toBeDefined();
    expect(btv.rollout_wave).toBe(3);
  });

  it('Divine Path Walkers (biz_03) is in rollout wave 3', async () => {
    const raw = await readFile('data/business-registry.json', 'utf8');
    const { businesses } = JSON.parse(raw);
    const dpw = businesses.find(
      (b: { business_id: string }) => b.business_id === 'biz_03_divine_path_walkers',
    );
    expect(dpw).toBeDefined();
    expect(dpw.rollout_wave).toBe(3);
  });

  it('MVP Cashflow (biz_11) and Royal Results (biz_12) are Wave 0', async () => {
    const raw = await readFile('data/business-registry.json', 'utf8');
    const { businesses } = JSON.parse(raw);
    for (const id of ['biz_11_mvp_cashflow', 'biz_12_royal_results']) {
      const biz = businesses.find((b: { business_id: string }) => b.business_id === id);
      expect(biz).toBeDefined();
      expect(biz.rollout_wave).toBe(0);
    }
  });

  it('all businesses have a rollout_wave field', async () => {
    const raw = await readFile('data/business-registry.json', 'utf8');
    const { businesses } = JSON.parse(raw);
    for (const biz of businesses) {
      expect(typeof biz.rollout_wave).toBe('number');
    }
  });
});
