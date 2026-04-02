import { readFile } from 'fs/promises';
import { describe, it, expect } from 'vitest';

const EXPECTED_TOTAL_AGENTS = 103;
const REQUIRED_TIERS = [
  'anthropic-strategist',
  'anthropic-executor',
  'anthropic-communicator',
  'anthropic-analyst',
  'anthropic-guardian',
];
const SOVEREIGN_TIERS = ['anthropic-strategist', 'anthropic-guardian'];

describe('config/anthropic-tier-assignment.json', () => {
  it('is valid JSON with required top-level fields', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const json = JSON.parse(raw);
    expect(json).toHaveProperty('tier_assignments');
    expect(json).toHaveProperty('statistics');
    expect(json).toHaveProperty('validation_checklist');
  });

  it('contains all 5 required tier keys', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { tier_assignments } = JSON.parse(raw);
    for (const tier of REQUIRED_TIERS) {
      expect(tier_assignments).toHaveProperty(tier);
    }
  });

  it(`all agents across tiers total exactly ${EXPECTED_TOTAL_AGENTS}`, async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { tier_assignments } = JSON.parse(raw);
    const total = Object.values(tier_assignments).reduce(
      (sum: number, tier: { agents: unknown[] }) => sum + tier.agents.length,
      0,
    );
    expect(total).toBe(EXPECTED_TOTAL_AGENTS);
  });

  it('no agent_id appears in more than one tier (no duplicates)', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { tier_assignments } = JSON.parse(raw);
    const allIds = Object.values(tier_assignments).flatMap(
      (t: { agents: Array<{ agent_id: string }> }) => t.agents.map((a) => a.agent_id),
    );
    const unique = new Set(allIds);
    expect(allIds.length).toBe(unique.size);
  });

  it('sovereign_isolation_verified is true', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { validation_checklist } = JSON.parse(raw);
    expect(validation_checklist.sovereign_isolation_verified).toBe(true);
  });

  it('fallback_agent_count is 0', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { validation_checklist, statistics } = JSON.parse(raw);
    expect(validation_checklist.fallback_agent_count).toBe(0);
    expect(statistics.using_default_fallback).toBe(0);
  });

  it('sovereign tiers use ANTHROPIC_API_KEY_SOVEREIGN', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { tier_assignments } = JSON.parse(raw);
    for (const tier of SOVEREIGN_TIERS) {
      expect(tier_assignments[tier].credential_env).toBe('ANTHROPIC_API_KEY_SOVEREIGN');
      expect(tier_assignments[tier].sovereign_isolation).toBe(true);
    }
  });

  it('non-sovereign tiers use ANTHROPIC_API_KEY_SHARED', async () => {
    const raw = await readFile('config/anthropic-tier-assignment.json', 'utf8');
    const { tier_assignments } = JSON.parse(raw);
    const sharedTiers = REQUIRED_TIERS.filter((t) => !SOVEREIGN_TIERS.includes(t));
    for (const tier of sharedTiers) {
      expect(tier_assignments[tier].credential_env).toBe('ANTHROPIC_API_KEY_SHARED');
    }
  });
});
