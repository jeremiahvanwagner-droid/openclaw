import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const OPENCLAW_HOME = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
export const DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH = join(
  OPENCLAW_HOME,
  'data',
  'workflow-webhook-registry.json',
);

function defaultRegistry() {
  return {
    version: 1,
    updatedAt: null,
    webhooks: [],
  };
}

export function loadWorkflowWebhookRegistry(registryPath = DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH) {
  if (!existsSync(registryPath)) {
    return defaultRegistry();
  }

  const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
  return {
    ...defaultRegistry(),
    ...parsed,
    webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : [],
  };
}

export function saveWorkflowWebhookRegistry(
  registry,
  registryPath = DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH,
) {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

export function createWorkflowWebhookId(prefix = 'wf') {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export function getWorkflowWebhookFingerprint(entry) {
  return [
    entry.business_id || '',
    entry.locationId || '',
    entry.locationSelector || '',
    entry.direction || '',
    entry.event || '',
    entry.url || '',
    entry.method || 'POST',
    entry.workflowId || '',
    entry.source || 'manual',
  ].join('|').toLowerCase();
}

export function upsertWorkflowWebhookEntries(
  registry,
  entries,
  { replaceBusinessIds = [], replaceSource } = {},
) {
  const replaceSet = new Set(replaceBusinessIds);
  const retainedEntries = (registry.webhooks || []).filter(entry => {
    if (replaceSet.size === 0) return true;
    if (!replaceSet.has(entry.business_id)) return true;
    if (!replaceSource) return false;
    return entry.source !== replaceSource;
  });

  const byFingerprint = new Map(
    retainedEntries.map(entry => [getWorkflowWebhookFingerprint(entry), entry]),
  );
  const now = new Date().toISOString();

  for (const entry of entries) {
    const fingerprint = getWorkflowWebhookFingerprint(entry);
    const existing = byFingerprint.get(fingerprint);
    byFingerprint.set(fingerprint, {
      ...existing,
      ...entry,
      id: existing?.id || entry.id || createWorkflowWebhookId(),
      createdAt: existing?.createdAt || entry.createdAt || now,
      updatedAt: now,
      active: entry.active ?? existing?.active ?? true,
    });
  }

  return {
    ...registry,
    version: registry.version || 1,
    updatedAt: now,
    webhooks: Array.from(byFingerprint.values()).sort((left, right) => {
      const businessSort = (left.business_id || '').localeCompare(right.business_id || '');
      if (businessSort !== 0) return businessSort;
      const directionSort = (left.direction || '').localeCompare(right.direction || '');
      if (directionSort !== 0) return directionSort;
      return (left.event || '').localeCompare(right.event || '');
    }),
  };
}
