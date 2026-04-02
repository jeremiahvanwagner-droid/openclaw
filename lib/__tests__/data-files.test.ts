import { readFile } from 'fs/promises';
import { describe, it, expect } from 'vitest';

describe('data source-of-truth files', () => {
  describe('data/tjb-offer-matrix.json', () => {
    it('exists and is valid JSON with required top-level keys', async () => {
      const raw = await readFile('data/tjb-offer-matrix.json', 'utf8');
      const json = JSON.parse(raw);
      expect(json).toHaveProperty('_meta');
      expect(json).toHaveProperty('offers');
      expect(Array.isArray(json.offers)).toBe(true);
    });

    it('contains all 3 required funnel stages', async () => {
      const raw = await readFile('data/tjb-offer-matrix.json', 'utf8');
      const { offers } = JSON.parse(raw);
      const stages = new Set(offers.map((o: { funnel_stage: string }) => o.funnel_stage));
      expect(stages.has('assessment')).toBe(true);
      expect(stages.has('ebook')).toBe(true);
      expect(stages.has('membership_or_course')).toBe(true);
    });

    it('all paid offers have valid payment_link URLs', async () => {
      const raw = await readFile('data/tjb-offer-matrix.json', 'utf8');
      const { offers } = JSON.parse(raw);
      for (const offer of offers) {
        if (offer.price_usd > 0) {
          expect(offer.payment_link).toMatch(/^https?:\/\//);
        }
      }
    });

    it('all offers have an owner_agent', async () => {
      const raw = await readFile('data/tjb-offer-matrix.json', 'utf8');
      const { offers } = JSON.parse(raw);
      for (const offer of offers) {
        expect(offer.owner_agent).toBeTruthy();
      }
    });
  });

  describe('data/ghl-funnel-paths.json', () => {
    it('exists and is valid JSON with required top-level keys', async () => {
      const raw = await readFile('data/ghl-funnel-paths.json', 'utf8');
      const json = JSON.parse(raw);
      expect(json).toHaveProperty('_meta');
      expect(json).toHaveProperty('funnels');
      expect(json).toHaveProperty('checkout_path_prefixes');
      expect(Array.isArray(json.funnels)).toBe(true);
    });

    it('checkout_path_prefixes includes /order and /checkout', async () => {
      const raw = await readFile('data/ghl-funnel-paths.json', 'utf8');
      const { checkout_path_prefixes } = JSON.parse(raw);
      expect(checkout_path_prefixes).toContain('/order');
      expect(checkout_path_prefixes).toContain('/checkout');
    });

    it('each funnel has required fields', async () => {
      const raw = await readFile('data/ghl-funnel-paths.json', 'utf8');
      const { funnels } = JSON.parse(raw);
      for (const funnel of funnels) {
        expect(funnel.funnel_id).toBeTruthy();
        expect(Array.isArray(funnel.paths)).toBe(true);
        expect(funnel.paths.length).toBeGreaterThan(0);
        expect(funnel.owner_agent).toBeTruthy();
      }
    });
  });

  describe('data/recovery-automation-policies.json', () => {
    it('exists and is valid JSON with required top-level keys', async () => {
      const raw = await readFile('data/recovery-automation-policies.json', 'utf8');
      const json = JSON.parse(raw);
      expect(json).toHaveProperty('_meta');
      expect(json).toHaveProperty('abandoned_cart');
      expect(json).toHaveProperty('payment_failure_dunning');
      expect(json).toHaveProperty('churn_winback');
    });

    it('abandoned_cart has recovery_sequence_hours array', async () => {
      const raw = await readFile('data/recovery-automation-policies.json', 'utf8');
      const { abandoned_cart } = JSON.parse(raw);
      expect(Array.isArray(abandoned_cart.recovery_sequence_hours)).toBe(true);
      expect(abandoned_cart.recovery_sequence_hours.length).toBeGreaterThan(0);
    });

    it('payment_failure_dunning escalation thresholds match codebase constants', async () => {
      const raw = await readFile('data/recovery-automation-policies.json', 'utf8');
      const { payment_failure_dunning } = JSON.parse(raw);
      // handler escalates at amount >= 500 or retry_count >= 3
      expect(payment_failure_dunning.escalate_to_director_on_amount_usd).toBe(500);
      expect(payment_failure_dunning.escalate_to_director_on_retry_count).toBe(3);
    });
  });
});
