#!/usr/bin/env node
/**
 * OpenClaw Content Personalization Engine
 *
 * Features:
 *   - Dynamic content tokens based on contact attributes
 *   - Testimonial matching by demographics/tier
 *   - Content recommendations based on journey stage
 *   - Personalized CTAs
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execAsync = promisify(exec);

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const PERSONALIZATION_DIR = path.join(DATA_DIR, 'personalization');
const TESTIMONIALS_FILE = path.join(PERSONALIZATION_DIR, 'testimonials.json');
const CONTENT_BLOCKS_FILE = path.join(PERSONALIZATION_DIR, 'content-blocks.json');

const { token: GHL_API_KEY, locationId: GHL_LOCATION_ID } = (await import('../lib/ghl-tenant-resolver.mjs')).resolve();

// Default testimonials by tier
const DEFAULT_TESTIMONIALS = {
  transcendent: [
    {
      id: 't1',
      name: 'Marcus J.',
      tier: 'transcendent',
      demographic: { ageRange: '35-45', profession: 'entrepreneur' },
      product: 'intensive',
      stars: 5,
      text: "The Intensive changed everything. I went from constantly searching for answers to living from a place of certainty and purpose.",
      highlight: "living from a place of certainty"
    },
    {
      id: 't2',
      name: 'Alicia R.',
      tier: 'transcendent',
      demographic: { ageRange: '45-55', profession: 'executive' },
      product: 'operators-circle',
      stars: 5,
      text: "The Operators Circle isn't just coaching - it's a complete transformation framework that elevated every area of my life.",
      highlight: "complete transformation"
    }
  ],
  empowered: [
    {
      id: 'e1',
      name: 'David K.',
      tier: 'empowered',
      demographic: { ageRange: '25-35', profession: 'professional' },
      product: 'course',
      stars: 5,
      text: "This course gave me the clarity I'd been searching for. Within weeks I was making decisions with confidence.",
      highlight: "clarity I'd been searching for"
    },
    {
      id: 'e2',
      name: 'Jennifer M.',
      tier: 'empowered',
      demographic: { ageRange: '35-45', profession: 'coach' },
      product: 'course',
      stars: 5,
      text: "Perfect for anyone ready to move past theory into real transformation. Highly actionable content.",
      highlight: "real transformation"
    }
  ],
  aligned: [
    {
      id: 'a1',
      name: 'Chris L.',
      tier: 'aligned',
      demographic: { ageRange: '35-45', profession: 'manager' },
      product: 'ebook',
      stars: 5,
      text: "The eBook opened my eyes to possibilities I never considered. A perfect starting point for the journey.",
      highlight: "opened my eyes"
    }
  ],
  awakening: [
    {
      id: 'aw1',
      name: 'Sarah T.',
      tier: 'awakening',
      demographic: { ageRange: '25-35', profession: 'creative' },
      product: 'ebook',
      stars: 5,
      text: "I was skeptical at first but the eBook resonated deeply. It's like it was written for me.",
      highlight: "resonated deeply"
    }
  ],
  dormant: [
    {
      id: 'd1',
      name: 'Mike P.',
      tier: 'dormant',
      demographic: { ageRange: '35-45', profession: 'general' },
      product: 'ebook',
      stars: 4,
      text: "A good read that planted seeds for change. Short enough to finish in an evening.",
      highlight: "seeds for change"
    }
  ]
};

// Default content blocks
const DEFAULT_CONTENT_BLOCKS = {
  headlines: {
    transcendent: "Welcome back, visionary. Your next level awaits.",
    empowered: "Ready to amplify your impact?",
    aligned: "Your transformation continues...",
    awakening: "The journey to your true self starts here",
    dormant: "Rediscover what's possible"
  },
  ctas: {
    transcendent: {
      primary: "Join the Inner Circle",
      secondary: "Schedule Your Strategy Call"
    },
    empowered: {
      primary: "Enroll in the Intensive",
      secondary: "Upgrade Your Journey"
    },
    aligned: {
      primary: "Get the Course Now",
      secondary: "Book a Clarity Call"
    },
    awakening: {
      primary: "Download Your Free Guide",
      secondary: "Start the Scorecard"
    },
    dormant: {
      primary: "Take the Free Assessment",
      secondary: "Watch the Introduction"
    }
  },
  valueProps: {
    entrepreneur: [
      "Scale your impact without sacrificing your well-being",
      "Build systems that work while you rest",
      "Lead with purpose, profit follows"
    ],
    executive: [
      "Navigate complexity with clarity",
      "Transform pressure into performance",
      "Lead authentically at every level"
    ],
    coach: [
      "Expand your capacity to serve",
      "Deepen your own practice while growing your business",
      "Master the art of transformational leadership"
    ],
    creative: [
      "Channel your gifts with focus and intention",
      "Turn creative energy into lasting impact",
      "Build a sustainable creative life"
    ],
    professional: [
      "Find deeper meaning in your career",
      "Align your work with your true values",
      "Build influence without burning out"
    ],
    general: [
      "Discover your untapped potential",
      "Create lasting positive change",
      "Live with purpose every day"
    ]
  }
};

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'services.leadconnectorhq.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Load testimonials
 */
async function loadTestimonials() {
  try {
    await fs.mkdir(PERSONALIZATION_DIR, { recursive: true });
    const data = await fs.readFile(TESTIMONIALS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    // Initialize with defaults
    await fs.writeFile(TESTIMONIALS_FILE, JSON.stringify(DEFAULT_TESTIMONIALS, null, 2));
    return DEFAULT_TESTIMONIALS;
  }
}

/**
 * Load content blocks
 */
async function loadContentBlocks() {
  try {
    await fs.mkdir(PERSONALIZATION_DIR, { recursive: true });
    const data = await fs.readFile(CONTENT_BLOCKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    // Initialize with defaults
    await fs.writeFile(CONTENT_BLOCKS_FILE, JSON.stringify(DEFAULT_CONTENT_BLOCKS, null, 2));
    return DEFAULT_CONTENT_BLOCKS;
  }
}

/**
 * Detect alignment tier from contact
 */
function detectTier(contact) {
  const tags = (contact.tags || []).map(t => t.toLowerCase());
  const tiers = ['transcendent', 'empowered', 'aligned', 'awakening', 'dormant'];

  for (const tier of tiers) {
    if (tags.some(t => t.includes(tier))) {
      return tier;
    }
  }

  // Infer tier from purchases
  if (tags.some(t => t.includes('intensive') || t.includes('operators'))) {
    return 'transcendent';
  }
  if (tags.some(t => t.includes('course-buyer'))) {
    return 'empowered';
  }
  if (tags.some(t => t.includes('ebook'))) {
    return 'aligned';
  }
  if (tags.some(t => t.includes('scorecard'))) {
    return 'awakening';
  }

  return 'dormant';
}

/**
 * Detect profession from contact
 */
function detectProfession(contact) {
  const companyName = (contact.companyName || '').toLowerCase();
  const tags = (contact.tags || []).map(t => t.toLowerCase()).join(' ');

  // Check for custom fields
  const professionField = (contact.customFields || []).find(f =>
    f.key?.toLowerCase().includes('profession') || f.key?.toLowerCase().includes('occupation')
  );
  if (professionField?.value) {
    const val = professionField.value.toLowerCase();
    if (val.includes('entrepreneur') || val.includes('founder') || val.includes('owner')) return 'entrepreneur';
    if (val.includes('executive') || val.includes('ceo') || val.includes('director')) return 'executive';
    if (val.includes('coach') || val.includes('consultant')) return 'coach';
    if (val.includes('creative') || val.includes('artist') || val.includes('designer')) return 'creative';
  }

  // Infer from company
  if (companyName.includes('coach') || companyName.includes('consulting')) return 'coach';
  if (tags.includes('entrepreneur')) return 'entrepreneur';
  if (tags.includes('executive')) return 'executive';

  return 'professional';
}

/**
 * Get best matching testimonial
 */
async function getMatchingTestimonial(contactId, productContext = null) {
  const testimonials = await loadTestimonials();

  // Get contact
  const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
  if (!contact.contact && !contact.id) {
    return { error: 'Contact not found' };
  }

  const contactData = contact.contact || contact;
  const tier = detectTier(contactData);
  const profession = detectProfession(contactData);

  // Get testimonials for this tier
  const tierTestimonials = testimonials[tier] || testimonials['awakening'] || [];

  if (tierTestimonials.length === 0) {
    return { error: 'No testimonials available', tier, profession };
  }

  // Score each testimonial
  let bestMatch = null;
  let bestScore = -1;

  for (const t of tierTestimonials) {
    let score = 0;

    // Match profession
    if (t.demographic?.profession === profession) score += 3;

    // Match product context
    if (productContext && t.product === productContext) score += 2;

    // Random factor for variety
    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = t;
    }
  }

  return {
    testimonial: bestMatch,
    tier,
    profession,
    matchScore: bestScore
  };
}

/**
 * Generate personalized content for contact
 */
async function personalizeContent(contactId) {
  const contentBlocks = await loadContentBlocks();

  // Get contact
  const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
  if (!contact.contact && !contact.id) {
    return { error: 'Contact not found' };
  }

  const contactData = contact.contact || contact;
  const tier = detectTier(contactData);
  const profession = detectProfession(contactData);
  const firstName = contactData.firstName || 'there';

  // Get matching testimonial
  const testimonialResult = await getMatchingTestimonial(contactId);

  // Build personalized content
  const personalized = {
    contactId,
    firstName,
    tier,
    profession,

    greeting: `Hey ${firstName}`,
    headline: contentBlocks.headlines[tier] || contentBlocks.headlines.awakening,

    ctas: contentBlocks.ctas[tier] || contentBlocks.ctas.awakening,

    valueProps: contentBlocks.valueProps[profession] || contentBlocks.valueProps.general,

    testimonial: testimonialResult.testimonial || null,

    // Dynamic tokens for email templates
    tokens: {
      '{{first_name}}': firstName,
      '{{tier}}': tier,
      '{{tier_title}}': tier.charAt(0).toUpperCase() + tier.slice(1),
      '{{headline}}': contentBlocks.headlines[tier],
      '{{primary_cta}}': (contentBlocks.ctas[tier] || contentBlocks.ctas.awakening).primary,
      '{{secondary_cta}}': (contentBlocks.ctas[tier] || contentBlocks.ctas.awakening).secondary,
      '{{value_prop_1}}': (contentBlocks.valueProps[profession] || contentBlocks.valueProps.general)[0],
      '{{testimonial_text}}': testimonialResult.testimonial?.text || '',
      '{{testimonial_name}}': testimonialResult.testimonial?.name || '',
      '{{testimonial_highlight}}': testimonialResult.testimonial?.highlight || ''
    }
  };

  return personalized;
}

/**
 * Apply tokens to template
 */
function applyTokens(template, tokens) {
  let result = template;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

/**
 * Get next best offer for contact
 */
async function getNextBestOffer(contactId) {
  const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
  if (!contact.contact && !contact.id) {
    return { error: 'Contact not found' };
  }

  const contactData = contact.contact || contact;
  const tags = (contactData.tags || []).map(t => t.toLowerCase());

  // Determine what they have
  const hasEbook = tags.some(t => t.includes('ebook'));
  const hasCourse = tags.some(t => t.includes('course-buyer'));
  const hasIntensive = tags.some(t => t.includes('intensive'));
  const hasCircle = tags.some(t => t.includes('operators'));

  // Determine next best offer
  if (hasCircle) {
    return {
      offer: 'renewal',
      product: 'operators-circle',
      message: 'Continue your transformation in the Operators Circle',
      priority: 'retain'
    };
  }

  if (hasIntensive || hasCourse) {
    return {
      offer: 'operators-circle',
      product: 'operators-circle',
      message: "You've experienced transformation - now operate at the highest level",
      priority: 'upsell'
    };
  }

  if (hasEbook) {
    return {
      offer: 'course',
      product: 'course',
      message: 'Ready to go deeper? The full course awaits',
      priority: 'upsell'
    };
  }

  return {
    offer: 'ebook',
    product: 'ebook',
    message: 'Start your journey with the foundational eBook',
    priority: 'acquisition'
  };
}

/**
 * Add a new testimonial
 */
async function addTestimonial(tier, testimonial) {
  const testimonials = await loadTestimonials();

  if (!testimonials[tier]) {
    testimonials[tier] = [];
  }

  testimonial.id = `custom_${Date.now()}`;
  testimonials[tier].push(testimonial);

  await fs.writeFile(TESTIMONIALS_FILE, JSON.stringify(testimonials, null, 2));
  return testimonial;
}

/**
 * Show personalization preview
 */
async function showPreview(contactId) {
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 CONTENT PERSONALIZATION PREVIEW');
  console.log('═'.repeat(60) + '\n');

  const personalized = await personalizeContent(contactId);

  if (personalized.error) {
    console.log(`Error: ${personalized.error}`);
    return;
  }

  console.log(`Contact: ${personalized.firstName} (${contactId})`);
  console.log(`Tier: ${personalized.tier.toUpperCase()}`);
  console.log(`Profession: ${personalized.profession}`);
  console.log('');

  console.log('📝 PERSONALIZED CONTENT:\n');
  console.log(`Greeting: "${personalized.greeting}"`);
  console.log(`Headline: "${personalized.headline}"`);
  console.log('');

  console.log('🎯 CTAs:');
  console.log(`  Primary: "${personalized.ctas.primary}"`);
  console.log(`  Secondary: "${personalized.ctas.secondary}"`);
  console.log('');

  console.log('💡 Value Props:');
  for (const vp of personalized.valueProps) {
    console.log(`  • ${vp}`);
  }
  console.log('');

  if (personalized.testimonial) {
    console.log('⭐ MATCHED TESTIMONIAL:');
    console.log(`  "${personalized.testimonial.text}"`);
    console.log(`  — ${personalized.testimonial.name}`);
  }
  console.log('');

  console.log('🏷️ TEMPLATE TOKENS:');
  for (const [token, value] of Object.entries(personalized.tokens)) {
    if (value) {
      console.log(`  ${token} = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
    }
  }

  // Get next best offer
  const nbo = await getNextBestOffer(contactId);
  console.log('\n🎁 NEXT BEST OFFER:');
  console.log(`  Product: ${nbo.product}`);
  console.log(`  Message: ${nbo.message}`);
  console.log(`  Priority: ${nbo.priority}`);

  console.log('\n' + '═'.repeat(60));
}

/**
 * List all testimonials
 */
async function listTestimonials() {
  const testimonials = await loadTestimonials();

  console.log('\n📣 TESTIMONIAL LIBRARY\n');

  for (const [tier, list] of Object.entries(testimonials)) {
    console.log(`\n${tier.toUpperCase()} (${list.length}):`);
    for (const t of list) {
      console.log(`  [${t.id}] ${t.name} — "${t.text.substring(0, 60)}..."`);
    }
  }
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'personalize':
    if (!args[0]) {
      console.log('Usage: content-personalization.mjs personalize <contactId>');
    } else {
      personalizeContent(args[0]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'preview':
    if (!args[0]) {
      console.log('Usage: content-personalization.mjs preview <contactId>');
    } else {
      showPreview(args[0]);
    }
    break;

  case 'testimonial':
    if (!args[0]) {
      console.log('Usage: content-personalization.mjs testimonial <contactId>');
    } else {
      getMatchingTestimonial(args[0], args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'testimonials':
    listTestimonials();
    break;

  case 'nbo':
  case 'next-offer':
    if (!args[0]) {
      console.log('Usage: content-personalization.mjs nbo <contactId>');
    } else {
      getNextBestOffer(args[0]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;

  case 'add-testimonial':
    console.log('Usage: Import and call addTestimonial(tier, testimonialObject)');
    break;

  case 'apply':
    if (args.length < 2) {
      console.log('Usage: content-personalization.mjs apply <contactId> "<template>"');
    } else {
      personalizeContent(args[0]).then(p => {
        if (p.error) {
          console.log(p.error);
        } else {
          const template = args.slice(1).join(' ');
          console.log(applyTokens(template, p.tokens));
        }
      });
    }
    break;

  default:
    console.log(`
Content Personalization Engine

Usage:
  content-personalization.mjs personalize <contactId>    - Get personalized content
  content-personalization.mjs preview <contactId>        - Show visual preview
  content-personalization.mjs testimonial <contactId>    - Get matching testimonial
  content-personalization.mjs testimonials               - List all testimonials
  content-personalization.mjs nbo <contactId>            - Get next best offer
  content-personalization.mjs apply <contactId> "<tpl>"  - Apply tokens to template

Template Tokens:
  {{first_name}}      - Contact first name
  {{tier}}            - Alignment tier
  {{tier_title}}      - Tier (capitalized)
  {{headline}}        - Tier-specific headline
  {{primary_cta}}     - Primary call-to-action
  {{secondary_cta}}   - Secondary call-to-action
  {{value_prop_1}}    - First value proposition
  {{testimonial_text}} - Testimonial content
  {{testimonial_name}} - Testimonial author

Example:
  content-personalization.mjs apply abc123 "Hey {{first_name}}, {{headline}}"
`);
}

export { personalizeContent, getMatchingTestimonial, getNextBestOffer, applyTokens, addTestimonial };
