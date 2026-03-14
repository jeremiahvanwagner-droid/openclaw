#!/usr/bin/env node
/**
 * OpenClaw Email Sequence Agent
 * 
 * Content Division - Email marketing automation
 * 
 * Features:
 *   - Welcome sequences
 *   - Launch sequences
 *   - Nurture sequences
 *   - Cart abandonment
 *   - Re-engagement campaigns
 *   - Newsletter templates
 * 
 * Usage: node email-sequence.mjs <command> [args...]
 * 
 * Commands:
 *   welcome <product>        Generate welcome sequence
 *   launch <product>         Generate launch sequence
 *   nurture <niche>          Generate nurture sequence
 *   cart <product>           Generate cart abandonment
 *   newsletter <topic>       Generate newsletter email
 *   single <purpose>         Generate single email
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const EMAILS_FILE = path.join(DATA_DIR, 'email-sequences.json');

// Sequence types
const SEQUENCE_TYPES = {
  welcome: {
    name: 'Welcome Sequence',
    emails: 5,
    timeframe: '7 days',
    purpose: 'Build relationship, set expectations, deliver quick win'
  },
  launch: {
    name: 'Launch Sequence',
    emails: 7,
    timeframe: '7-10 days',
    purpose: 'Build anticipation, overcome objections, drive conversions'
  },
  nurture: {
    name: 'Nurture Sequence',
    emails: 8,
    timeframe: '30 days',
    purpose: 'Provide value, build trust, segment subscribers'
  },
  cart: {
    name: 'Cart Abandonment',
    emails: 3,
    timeframe: '24-72 hours',
    purpose: 'Recover abandoned carts, overcome hesitation'
  },
  reengagement: {
    name: 'Re-engagement Sequence',
    emails: 4,
    timeframe: '14 days',
    purpose: 'Wake up cold subscribers, clean list'
  }
};

// Email frameworks
const EMAIL_FRAMEWORKS = {
  AIDA: ['Attention', 'Interest', 'Desire', 'Action'],
  PAS: ['Problem', 'Agitate', 'Solution'],
  BAB: ['Before', 'After', 'Bridge'],
  '4Ps': ['Promise', 'Picture', 'Proof', 'Push'],
  storytelling: ['Hook', 'Challenge', 'Journey', 'Resolution', 'Lesson']
};

// Subject line formulas
const SUBJECT_FORMULAS = {
  curiosity: [
    'The one thing about {topic} nobody talks about',
    'I made a mistake with {topic}...',
    'About {topic}...',
    'Quick question about {topic}'
  ],
  benefit: [
    'How to {benefit} in {timeframe}',
    '{Number} ways to {benefit}',
    'The {adjective} way to {benefit}'
  ],
  urgency: [
    '[{timeframe} left] {offer}',
    'Last chance: {offer}',
    'Closing soon: {offer}'
  ],
  personal: [
    '{Name}, I noticed something...',
    'Did you see this, {Name}?',
    'A quick note for {Name}'
  ]
};

// Email components
const EMAIL_COMPONENTS = {
  greetings: ['Hey {Name}!', 'Hi {Name},', 'Hello {Name}!', '{Name},', 'Hey there!'],
  signoffs: ['Best,', 'Cheers,', 'Talk soon,', 'To your success,', 'Warmly,'],
  ps: [
    'P.S. {reminder about offer}',
    'P.S. Don\'t forget - {deadline}',
    'P.S. Hit reply if you have any questions!',
    'P.S. {social proof element}'
  ]
};

// Data storage
let emailsData = {
  sequences: [],
  emails: [],
  campaigns: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(EMAILS_FILE, 'utf8');
    emailsData = JSON.parse(data);
  } catch {
    emailsData = { sequences: [], emails: [], campaigns: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(EMAILS_FILE, JSON.stringify(emailsData, null, 2));
}

/**
 * Generate welcome sequence
 */
async function generateWelcomeSequence(product, options = {}) {
  const senderName = options.senderName || '[YOUR NAME]';
  
  const sequence = {
    id: `welcome-${Date.now()}`,
    type: 'welcome',
    product,
    emails: []
  };
  
  // Email 1: Welcome & Deliver (Immediate)
  sequence.emails.push({
    day: 0,
    delay: 'Immediate',
    subject: `Welcome! Here's your ${product}`,
    purpose: 'Deliver the promised resource, set expectations',
    body: `Hey {Name}!

Welcome to the community! I'm so glad you're here.

As promised, here's your ${product}:

👉 [DOWNLOAD LINK]

Here's what I recommend:
1. Download it right now (takes 2 seconds)
2. Save it somewhere you'll remember
3. Take action on Step 1 today

Over the next few days, I'll send you some of my best strategies for [DESIRED OUTCOME].

These are the exact methods I've used to [CREDIBILITY STATEMENT].

Keep an eye on your inbox!

${senderName}

P.S. Hit reply and tell me - what's your #1 challenge with [TOPIC]? I read every response.`
  });
  
  // Email 2: Story + Quick Win (Day 1)
  sequence.emails.push({
    day: 1,
    delay: '24 hours',
    subject: 'My story (and why I created this)',
    purpose: 'Build connection through story, deliver quick win',
    body: `Hey {Name}!

Let me tell you how I got started with [TOPIC]...

[2-3 paragraphs sharing your origin story]

The thing that changed everything for me? [KEY INSIGHT]

Here's a quick win you can implement today:

🎯 [ACTIONABLE TIP]

Try it and let me know how it goes.

${senderName}

P.S. Did you download your ${product} yet? If not, grab it here: [LINK]`
  });
  
  // Email 3: Common Mistake (Day 2)
  sequence.emails.push({
    day: 2,
    delay: '24 hours',
    subject: 'The #1 mistake with {topic}',
    purpose: 'Provide value, build authority',
    body: `Hey {Name}!

When most people try to [DESIRED OUTCOME], they make this critical mistake:

❌ [COMMON MISTAKE]

I see it all the time. And it's costing them [NEGATIVE OUTCOME].

Here's what to do instead:

✅ [CORRECT APPROACH]

This simple shift makes all the difference.

Tomorrow, I'll share my [FRAMEWORK/SYSTEM] for [OUTCOME].

${senderName}`
  });
  
  // Email 4: Framework/System (Day 3)
  sequence.emails.push({
    day: 3,
    delay: '24 hours',
    subject: 'My {topic} framework (steal this)',
    purpose: 'Deliver high-value content, build trust',
    body: `Hey {Name}!

I promised I'd share my [FRAMEWORK] with you.

Here it is:

📋 The [NAME] Framework:

Step 1: [STEP]
Step 2: [STEP]
Step 3: [STEP]
Step 4: [STEP]

This is exactly what I use to [RESULT].

The best part? You can start implementing this TODAY.

[BRIEF EXPLANATION OF HOW TO USE IT]

Try it out and let me know your results!

${senderName}`
  });
  
  // Email 5: Soft Pitch (Day 5)
  sequence.emails.push({
    day: 5,
    delay: '48 hours',
    subject: 'Want to take this further?',
    purpose: 'Introduce paid offering, soft pitch',
    body: `Hey {Name}!

Over the past few days, I've shared some of my best strategies for [TOPIC].

But here's the thing...

What I've shared is just the tip of the iceberg.

If you're serious about [DESIRED OUTCOME], I have something that might help.

It's called [PRODUCT NAME].

Inside, you'll discover:
• [BENEFIT 1]
• [BENEFIT 2]
• [BENEFIT 3]

[BRIEF DESCRIPTION]

[CTA BUTTON/LINK]

No pressure at all. Take a look when you have a chance.

${senderName}

P.S. Got questions? Just hit reply - I'm here to help.`
  });
  
  sequence.generatedAt = new Date().toISOString();
  
  emailsData.sequences.push(sequence);
  await saveData();
  
  return sequence;
}

/**
 * Generate launch sequence
 */
async function generateLaunchSequence(product, options = {}) {
  const price = options.price || 97;
  const launchDate = options.launchDate || '[LAUNCH DATE]';
  
  const sequence = {
    id: `launch-${Date.now()}`,
    type: 'launch',
    product,
    price,
    emails: []
  };
  
  // Pre-Launch Emails
  sequence.emails.push({
    phase: 'Pre-Launch',
    day: -7,
    subject: 'Something exciting is coming...',
    purpose: 'Create anticipation',
    body: `Hey {Name}!

I've been working on something behind the scenes for months.

And I'm finally ready to share it with you.

Next week, I'm launching [PRODUCT NAME].

It's designed to help you [CORE BENEFIT].

I'll share all the details soon.

For now, just know that something big is coming.

Stay tuned!

[NAME]`
  });
  
  sequence.emails.push({
    phase: 'Pre-Launch',
    day: -3,
    subject: '[Sneak Peek] Here\'s what\'s inside',
    purpose: 'Build desire with content preview',
    body: `Hey {Name}!

Remember that thing I mentioned?

I wanted to give you a sneak peek of what's inside [PRODUCT NAME].

Here's a taste:

📦 Module 1: [NAME] - [BRIEF DESCRIPTION]
📦 Module 2: [NAME] - [BRIEF DESCRIPTION]
📦 Module 3: [NAME] - [BRIEF DESCRIPTION]

Plus:
🎁 [BONUS 1]
🎁 [BONUS 2]

Doors open in 3 days.

Mark your calendar: ${launchDate}

[NAME]`
  });
  
  // Launch Day
  sequence.emails.push({
    phase: 'Launch',
    day: 0,
    subject: '🚀 [PRODUCT] is LIVE!',
    purpose: 'Announce launch, drive sales',
    body: `Hey {Name}!

The wait is over.

[PRODUCT NAME] is officially open!

👉 [CTA LINK]

Here's everything you get:

✓ [FEATURE 1]
✓ [FEATURE 2]
✓ [FEATURE 3]

Plus these bonuses:
🎁 [BONUS 1] (Value: $X)
🎁 [BONUS 2] (Value: $X)

Total Value: $[TOTAL]
Launch Price: $${price}

⚠️ This launch pricing is only available for [TIME LIMIT].

[CTA BUTTON]

Got questions? Hit reply!

[NAME]

P.S. [GUARANTEE/RISK REVERSAL]`
  });
  
  // Day 2 - Social Proof
  sequence.emails.push({
    phase: 'Launch',
    day: 2,
    subject: 'People are saying...',
    purpose: 'Share testimonials, build trust',
    body: `Hey {Name}!

Since launching [PRODUCT NAME], I've been blown away by the response.

Here's what people are saying:

"[TESTIMONIAL 1]" - [NAME]

"[TESTIMONIAL 2]" - [NAME]

"[TESTIMONIAL 3]" - [NAME]

These are real people getting real results.

You could be next.

👉 [CTA LINK]

[NAME]`
  });
  
  // Day 4 - FAQ/Objections
  sequence.emails.push({
    phase: 'Launch',
    day: 4,
    subject: 'Your questions, answered',
    purpose: 'Overcome objections',
    body: `Hey {Name}!

I've been getting a ton of questions about [PRODUCT NAME].

Let me answer the most common ones:

❓ "Is this right for me if I'm a beginner?"
[ANSWER]

❓ "How much time does this take?"
[ANSWER]

❓ "What if it doesn't work for me?"
[ANSWER - INCLUDE GUARANTEE]

❓ "When do I get access?"
[ANSWER - USUALLY INSTANT]

Any other questions? Hit reply!

👉 [CTA LINK]

[NAME]`
  });
  
  // Day 6 - Final Warning
  sequence.emails.push({
    phase: 'Close',
    day: 6,
    subject: '⏰ 24 hours left...',
    purpose: 'Create urgency',
    body: `Hey {Name}!

Quick heads up:

[PRODUCT NAME] closes tomorrow at [TIME].

After that:
• The price goes up
• The bonuses disappear
• The doors close

If you've been thinking about it, now is the time.

👉 [CTA LINK]

Don't wait until it's too late.

[NAME]`
  });
  
  // Final Day
  sequence.emails.push({
    phase: 'Close',
    day: 7,
    subject: '[LAST CHANCE] Doors closing tonight',
    purpose: 'Final push',
    body: `Hey {Name}!

This is it.

[PRODUCT NAME] closes TONIGHT at midnight.

This is your last chance to:
• Get in at the launch price
• Grab all the bonuses
• Start your transformation

👉 [CTA LINK]

In 24 hours, this opportunity will be gone.

No exceptions. No extensions.

[CTA BUTTON]

To your success,
[NAME]

P.S. The clock is ticking: [LINK]`
  });
  
  sequence.generatedAt = new Date().toISOString();
  
  emailsData.sequences.push(sequence);
  await saveData();
  
  return sequence;
}

/**
 * Generate cart abandonment sequence
 */
async function generateCartAbandonmentSequence(product, options = {}) {
  const price = options.price || 97;
  
  const sequence = {
    id: `cart-${Date.now()}`,
    type: 'cart-abandonment',
    product,
    emails: []
  };
  
  // Email 1: Reminder (1 hour)
  sequence.emails.push({
    delay: '1 hour',
    subject: 'Did something go wrong?',
    purpose: 'Remind, check for technical issues',
    body: `Hey {Name}!

I noticed you started checking out for [PRODUCT] but didn't complete your order.

Did something go wrong? Sometimes these things happen.

If you ran into any issues, just hit reply and let me know - I'll help you out!

Your cart is still saved:
👉 [CART LINK]

[NAME]`
  });
  
  // Email 2: Overcome Objections (24 hours)
  sequence.emails.push({
    delay: '24 hours',
    subject: 'Still thinking about it?',
    purpose: 'Address hesitation',
    body: `Hey {Name}!

Still on the fence about [PRODUCT]?

I get it. Making a decision can be tough.

Let me address a few common concerns:

😟 "What if it doesn't work for me?"
→ Remember, you're protected by our [X]-day guarantee. If you're not satisfied, you get a full refund.

😟 "Is now the right time?"
→ There's never a "perfect" time. But the cost of waiting is [CONSEQUENCE].

😟 "Can I afford it?"
→ Think about it this way: [VALUE REFRAME]

Your cart is waiting:
👉 [CART LINK]

Questions? Just reply!

[NAME]`
  });
  
  // Email 3: Final + Incentive (72 hours)
  sequence.emails.push({
    delay: '72 hours',
    subject: 'Last chance + something special',
    purpose: 'Final push with incentive',
    body: `Hey {Name}!

Your cart for [PRODUCT] is about to expire.

Before it does, I wanted to offer you something special:

🎁 [SPECIAL INCENTIVE - discount, bonus, etc.]

This is my way of saying "I really want to help you [OUTCOME]."

But this expires in 24 hours.

Complete your order now:
👉 [CART LINK]

After that, your cart (and this offer) will be gone.

[NAME]

P.S. If you've decided this isn't for you, no worries at all. But if you're still interested, don't let this slip away.`
  });
  
  sequence.generatedAt = new Date().toISOString();
  
  emailsData.sequences.push(sequence);
  await saveData();
  
  return sequence;
}

/**
 * Generate nurture sequence
 */
async function generateNurtureSequence(niche, options = {}) {
  const sequence = {
    id: `nurture-${Date.now()}`,
    type: 'nurture',
    niche,
    emails: []
  };
  
  const topics = [
    { day: 1, topic: 'Quick Win', purpose: 'Deliver immediate value' },
    { day: 3, topic: 'Common Mistake', purpose: 'Build authority' },
    { day: 5, topic: 'Case Study', purpose: 'Social proof through story' },
    { day: 7, topic: 'Framework', purpose: 'Deliver high-value content' },
    { day: 10, topic: 'Behind the Scenes', purpose: 'Build personal connection' },
    { day: 14, topic: 'FAQ', purpose: 'Address common questions' },
    { day: 21, topic: 'Resource List', purpose: 'Provide massive value' },
    { day: 28, topic: 'Soft Pitch', purpose: 'Introduce offer naturally' }
  ];
  
  for (const { day, topic, purpose } of topics) {
    sequence.emails.push({
      day,
      subject: `[${topic}] ${niche} email`,
      purpose,
      body: `[TEMPLATE FOR ${topic.toUpperCase()} EMAIL]

Purpose: ${purpose}

Key Elements:
• Open with hook
• Deliver ${topic.toLowerCase()} content
• Include actionable takeaway
• End with engagement CTA or soft pitch

[CUSTOMIZE FOR YOUR ${niche.toUpperCase()} AUDIENCE]`
    });
  }
  
  sequence.generatedAt = new Date().toISOString();
  
  emailsData.sequences.push(sequence);
  await saveData();
  
  return sequence;
}

/**
 * Generate newsletter email
 */
async function generateNewsletterEmail(topic, options = {}) {
  const style = options.style || 'value-first';
  
  const newsletter = {
    id: `newsletter-${Date.now()}`,
    topic,
    style,
    subject: {
      options: [
        `This week: ${topic}`,
        `[Newsletter] ${topic}`,
        `Your weekly dose of ${topic}`,
        `📬 ${topic} (+ something special)`
      ]
    },
    body: `Hey {Name}!

Welcome to this week's edition.

Today, I'm diving into ${topic}.

---

📌 THE BIG IDEA

[1-2 paragraphs on the main concept]

---

💡 3 KEY TAKEAWAYS

1. [First insight with brief explanation]

2. [Second insight with brief explanation]

3. [Third insight with brief explanation]

---

🎯 YOUR ACTION STEP

This week, try this:

[Specific, actionable task they can complete]

---

📚 RESOURCES

• [Resource 1 - with link]
• [Resource 2 - with link]
• [Resource 3 - with link]

---

That's all for this week!

See you next time,
[NAME]

P.S. What did you think of today's newsletter? Hit reply and let me know!`,
    generatedAt: new Date().toISOString()
  };
  
  emailsData.emails.push(newsletter);
  await saveData();
  
  return newsletter;
}

/**
 * Generate single email
 */
async function generateSingleEmail(purpose, options = {}) {
  const framework = options.framework || 'PAS';
  
  const templates = {
    announcement: {
      subject: '🎉 Big news: [ANNOUNCEMENT]',
      body: `Hey {Name}!

I have some exciting news to share...

[ANNOUNCEMENT DETAILS]

Here's what this means for you:
• [BENEFIT 1]
• [BENEFIT 2]
• [BENEFIT 3]

[CTA IF APPLICABLE]

[NAME]`
    },
    valueEmail: {
      subject: 'Quick tip: [TOPIC]',
      body: `Hey {Name}!

Here's something I learned this week about [TOPIC]:

[KEY INSIGHT]

Why does this matter?

[EXPLANATION]

Here's how to apply it:
1. [STEP 1]
2. [STEP 2]
3. [STEP 3]

Try it out and let me know how it goes!

[NAME]`
    },
    promotionalEmail: {
      subject: '[LIMITED TIME] [OFFER]',
      body: `Hey {Name}!

Quick heads up:

[OFFER DETAILS]

Here's what you get:
✓ [FEATURE/BENEFIT 1]
✓ [FEATURE/BENEFIT 2]
✓ [FEATURE/BENEFIT 3]

But hurry - this ends [DEADLINE].

👉 [CTA LINK]

[NAME]

P.S. [URGENCY/SCARCITY REMINDER]`
    },
    reengagement: {
      subject: 'Are you still there, {Name}?',
      body: `Hey {Name}!

I noticed it's been a while since we connected.

I just wanted to check in and see how you're doing with [TOPIC].

Are you:
A) Crushing it? 💪
B) Still working on it? 🔨
C) Need some help? 🤝

Hit reply and let me know!

If you're no longer interested in hearing from me, no worries - just click here to unsubscribe: [LINK]

But if you want to stick around, I've got some great stuff planned for the coming weeks.

[NAME]`
    }
  };
  
  const template = templates[purpose] || templates.valueEmail;
  
  return {
    id: `single-${Date.now()}`,
    purpose,
    framework,
    ...template,
    generatedAt: new Date().toISOString()
  };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'welcome': {
        const product = args.join(' ') || 'Ultimate Guide';
        const sequence = await generateWelcomeSequence(product);
        
        console.log('Welcome Sequence Generated');
        console.log('='.repeat(50));
        console.log(`Product: ${sequence.product}`);
        console.log(`Emails: ${sequence.emails.length}`);
        
        for (const email of sequence.emails) {
          console.log(`\n📧 Day ${email.day}: ${email.subject}`);
          console.log(`   Purpose: ${email.purpose}`);
        }
        break;
      }
      
      case 'launch': {
        const product = args.join(' ') || 'Course Launch';
        const sequence = await generateLaunchSequence(product);
        
        console.log('Launch Sequence Generated');
        console.log('='.repeat(50));
        console.log(`Product: ${sequence.product}`);
        console.log(`Emails: ${sequence.emails.length}`);
        
        for (const email of sequence.emails) {
          console.log(`\n📧 ${email.phase} - Day ${email.day}: ${email.subject}`);
        }
        break;
      }
      
      case 'cart': {
        const product = args.join(' ') || 'Digital Course';
        const sequence = await generateCartAbandonmentSequence(product);
        
        console.log('Cart Abandonment Sequence Generated');
        console.log('='.repeat(50));
        
        for (const email of sequence.emails) {
          console.log(`\n📧 ${email.delay}: ${email.subject}`);
          console.log(`   Purpose: ${email.purpose}`);
        }
        break;
      }
      
      case 'nurture': {
        const niche = args.join(' ') || 'digital marketing';
        const sequence = await generateNurtureSequence(niche);
        
        console.log('Nurture Sequence Generated');
        console.log('='.repeat(50));
        
        for (const email of sequence.emails) {
          console.log(`Day ${email.day}: ${email.subject}`);
        }
        break;
      }
      
      case 'newsletter': {
        const topic = args.join(' ') || 'Weekly Insights';
        const newsletter = await generateNewsletterEmail(topic);
        
        console.log('Newsletter Template Generated');
        console.log('='.repeat(50));
        console.log('Subject Options:');
        for (const subj of newsletter.subject.options) {
          console.log(`  • ${subj}`);
        }
        break;
      }
      
      case 'single': {
        const purpose = args[0] || 'valueEmail';
        const email = await generateSingleEmail(purpose);
        
        console.log('Single Email Generated');
        console.log('='.repeat(50));
        console.log(`Subject: ${email.subject}`);
        console.log(`Purpose: ${email.purpose}`);
        break;
      }
      
      case 'test': {
        console.log('Email Sequence Module');
        console.log('=====================');
        console.log(`Sequence types: ${Object.keys(SEQUENCE_TYPES).length}`);
        console.log(`Email frameworks: ${Object.keys(EMAIL_FRAMEWORKS).length}`);
        console.log(`Subject formulas: ${Object.keys(SUBJECT_FORMULAS).length}`);
        console.log(`Sequences created: ${emailsData.sequences.length}`);
        break;
      }
      
      default:
        console.log('Email Sequence - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateWelcomeSequence,
  generateLaunchSequence,
  generateCartAbandonmentSequence,
  generateNurtureSequence,
  generateNewsletterEmail,
  generateSingleEmail,
  SEQUENCE_TYPES,
  EMAIL_FRAMEWORKS,
  SUBJECT_FORMULAS,
  EMAIL_COMPONENTS
};

// Run CLI
main().catch(console.error);
