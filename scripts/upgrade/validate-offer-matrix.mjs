#!/usr/bin/env node

import fs from 'fs/promises';

const DEFAULT_FILE = 'data/tjb-offer-matrix.json';

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[i + 1];
  }
  return args;
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(opts.file, 'utf8'));
  const offers = Array.isArray(payload.offers) ? payload.offers : [];

  const missingRequiredStages = [];
  const invalidPaidLinks = [];
  const missingOwners = [];

  const requiredStages = new Set(['assessment', 'ebook', 'membership_or_course']);
  const stagesFound = new Set();

  for (const offer of offers) {
    if (offer.funnel_stage) stagesFound.add(offer.funnel_stage);
    if (!offer.owner_agent) missingOwners.push(offer.offer_id);

    const isPaid = offer.price_usd > 0;
    if (isPaid && !isValidUrl(offer.payment_link || '')) {
      invalidPaidLinks.push(offer.offer_id);
    }
  }

  for (const stage of requiredStages) {
    if (!stagesFound.has(stage)) missingRequiredStages.push(stage);
  }

  const ok = missingRequiredStages.length === 0
    && invalidPaidLinks.length === 0
    && missingOwners.length === 0;

  console.log(JSON.stringify({
    action: 'validate-offer-matrix',
    file: opts.file,
    offerCount: offers.length,
    missingRequiredStages,
    invalidPaidLinks,
    missingOwners,
    ok,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
