import { describe, expect, it, beforeEach } from 'vitest';

import {
  enforceGhlScope,
  enforceGhlMethod,
  getAgentPermissions,
  getAgentTokenGroup,
  resolveTokenGroupPermissions,
  GhlScopeViolation,
  resetCache,
} from '../ghl-scope-enforcer.mjs';

beforeEach(() => {
  resetCache();
});

describe('ghl-scope-enforcer', () => {
  describe('getAgentTokenGroup', () => {
    it('returns the token group for a GHL-touching agent', () => {
      expect(getAgentTokenGroup('d1_ceo')).toBe('token_insight_ops');
      expect(getAgentTokenGroup('d1_cmo')).toBe('token_marketing_nurture');
      expect(getAgentTokenGroup('d1_customer_success')).toBe('token_support_inbox');
      expect(getAgentTokenGroup('d1_sales_manager')).toBe('token_sales_pipeline');
      expect(getAgentTokenGroup('d2_store_manager')).toBe('token_payments_readonly');
      expect(getAgentTokenGroup('d8_membership_director')).toBe('token_value_ladder');
    });

    it('returns null for non-GHL agents', () => {
      expect(getAgentTokenGroup('d1_fullstack_dev')).toBeNull();
    });
  });

  describe('resolveTokenGroupPermissions', () => {
    it('returns a Set of permissions for token_insight_ops', () => {
      const perms = resolveTokenGroupPermissions('token_insight_ops');
      expect(perms).toBeInstanceOf(Set);
      expect(perms.has('contacts:read')).toBe(true);
      expect(perms.has('conversations:read')).toBe(true);
      // insight_ops should NOT have conversations:write
      expect(perms.has('conversations:write')).toBe(false);
    });

    it('returns write permissions for token_marketing_nurture', () => {
      const perms = resolveTokenGroupPermissions('token_marketing_nurture');
      expect(perms.has('contacts:write')).toBe(true);
      expect(perms.has('conversations:write')).toBe(true);
    });

    it('throws for unknown token group', () => {
      expect(() => resolveTokenGroupPermissions('nonexistent')).toThrow('Unknown token group');
    });
  });

  describe('getAgentPermissions', () => {
    it('returns sorted array of permissions for d1_ceo', () => {
      const perms = getAgentPermissions('d1_ceo');
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
      // Should be sorted
      const sorted = [...perms].sort();
      expect(perms).toEqual(sorted);
    });

    it('returns empty array for non-GHL agents', () => {
      expect(getAgentPermissions('d1_fullstack_dev')).toEqual([]);
    });
  });

  describe('enforceGhlScope', () => {
    it('allows d1_ceo to read contacts', () => {
      const result = enforceGhlScope('d1_ceo', 'contacts', 'read');
      expect(result.tokenGroup).toBe('token_insight_ops');
      expect(result.permission).toBe('contacts:read');
    });

    it('blocks d1_ceo from writing conversations', () => {
      expect(() => enforceGhlScope('d1_ceo', 'conversations', 'write')).toThrow(GhlScopeViolation);
    });

    it('allows d1_cmo to write contacts (marketing nurture)', () => {
      const result = enforceGhlScope('d1_cmo', 'contacts', 'write');
      expect(result.tokenGroup).toBe('token_marketing_nurture');
    });

    it('blocks d2_store_manager from writing transactions', () => {
      // payments_readonly should not have transactions:write
      expect(() => enforceGhlScope('d2_store_manager', 'transactions', 'write')).toThrow(GhlScopeViolation);
    });

    it('allows d2_store_manager to read transactions', () => {
      const result = enforceGhlScope('d2_store_manager', 'transactions', 'read');
      expect(result.tokenGroup).toBe('token_payments_readonly');
    });

    it('throws for agents with no GHL access', () => {
      expect(() => enforceGhlScope('d1_fullstack_dev', 'contacts', 'read')).toThrow(GhlScopeViolation);
    });

    it('includes agent and permission info in the error', () => {
      try {
        enforceGhlScope('d1_ceo', 'conversations', 'write');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GhlScopeViolation);
        expect(err.agentId).toBe('d1_ceo');
        expect(err.permission).toBe('conversations:write');
        expect(err.tokenGroup).toBe('token_insight_ops');
      }
    });
  });

  describe('enforceGhlMethod', () => {
    it('allows d1_cmo to call contacts.create', () => {
      const result = enforceGhlMethod('d1_cmo', 'contacts.create');
      expect(result.permission).toBe('contacts:write');
    });

    it('blocks d1_ceo from calling conversations.messages.send', () => {
      expect(() => enforceGhlMethod('d1_ceo', 'conversations.messages.send')).toThrow(GhlScopeViolation);
    });

    it('throws for unknown method paths', () => {
      expect(() => enforceGhlMethod('d1_ceo', 'nonexistent.method')).toThrow('Unknown GHL method path');
    });
  });

  describe('all 27 agents have valid token groups', () => {
    const ghlAgents = [
      'biz_01_pod_lead', 'biz_02_pod_lead', 'biz_03_pod_lead', 'biz_04_pod_lead', 'biz_05_pod_lead',
      'biz_06_pod_lead', 'biz_07_pod_lead', 'biz_08_pod_lead', 'biz_09_pod_lead', 'biz_10_pod_lead',
      'browser_primary', 'd1_ceo', 'd1_cmo', 'd1_customer_success', 'd1_sales_manager',
      'd2_director', 'd2_store_manager', 'd3_biz_dev', 'd4_enrollment', 'd4_funnel_strategist',
      'd8_automation_architect', 'd8_crm_ops', 'd8_funnel_engineer', 'd8_membership_director',
      'd8_platform_architect', 'd8_revenue_ops', 'd8_saas_director',
    ];

    it.each(ghlAgents)('%s has a valid token group', (agentId) => {
      const group = getAgentTokenGroup(agentId);
      expect(group).toBeTruthy();
      // Should not throw
      const perms = resolveTokenGroupPermissions(group);
      expect(perms.size).toBeGreaterThan(0);
    });
  });
});
