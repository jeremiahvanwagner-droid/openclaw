#!/usr/bin/env node
/**
 * OpenClaw Script Writer Agent
 * 
 * Content Division - Video and audio script creation
 * 
 * Features:
 *   - YouTube video scripts
 *   - Podcast episode scripts
 *   - VSL (Video Sales Letter) scripts
 *   - Webinar scripts
 *   - Course module scripts
 *   - Short-form scripts (TikTok/Reels)
 * 
 * Usage: node script-writer.mjs <command> [args...]
 * 
 * Commands:
 *   youtube <topic>          Generate YouTube script
 *   podcast <topic>          Generate podcast script
 *   vsl <product>            Generate VSL script
 *   webinar <topic>          Generate webinar script
 *   course <topic>           Generate course module script
 *   shorts <topic>           Generate short-form script
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');

// Script structures by type
const SCRIPT_STRUCTURES = {
  youtube: {
    name: 'YouTube Video Script',
    sections: ['Hook', 'Intro', 'Content', 'Call to Action', 'Outro'],
    idealLength: '8-15 minutes',
    retention: {
      hookTime: '0-30 seconds',
      keyMoments: ['0:30', '3:00', '7:00', 'End'],
      pattern: 'Open loop, deliver value, close loop'
    }
  },
  podcast: {
    name: 'Podcast Episode Script',
    sections: ['Teaser', 'Intro', 'Main Content', 'Key Takeaways', 'Outro'],
    idealLength: '20-45 minutes',
    format: 'conversational'
  },
  vsl: {
    name: 'Video Sales Letter',
    sections: ['Pattern Interrupt', 'Problem', 'Agitation', 'Solution', 'Benefits', 'Social Proof', 'Offer', 'Urgency', 'CTA'],
    idealLength: '15-45 minutes',
    framework: 'AIDA + PAS hybrid'
  },
  webinar: {
    name: 'Webinar Script',
    sections: ['Welcome', 'Hook', 'Content Pillar 1', 'Content Pillar 2', 'Content Pillar 3', 'Transition', 'Offer', 'Q&A'],
    idealLength: '45-90 minutes',
    sellAt: '30-40 minute mark'
  },
  course: {
    name: 'Course Module Script',
    sections: ['Learning Objectives', 'Concept Introduction', 'Deep Dive', 'Examples', 'Action Steps', 'Summary'],
    idealLength: '5-15 minutes',
    style: 'educational'
  },
  shorts: {
    name: 'Short-Form Script',
    sections: ['Hook', 'Value', 'CTA'],
    idealLength: '15-60 seconds',
    platforms: ['TikTok', 'Reels', 'Shorts']
  }
};

// Hook templates
const HOOK_TEMPLATES = {
  question: 'Have you ever wondered why {topic} seems so difficult?',
  statistic: 'Did you know that {statistic} of people struggle with {topic}?',
  controversial: 'Everything you\'ve been told about {topic} is wrong.',
  story: 'Last week, something happened that completely changed how I think about {topic}.',
  promise: 'By the end of this video, you\'ll know exactly how to {outcome}.',
  problem: 'If you\'re struggling with {topic}, you\'re not alone. Here\'s why...',
  curiosity: 'There\'s a secret about {topic} that nobody talks about.',
  empathy: 'I remember when I first started with {topic}. It was overwhelming.'
};

// Transition phrases
const TRANSITIONS = {
  next: ['Now let\'s talk about...', 'Moving on to...', 'Next up...', 'The next thing you need to know...'],
  importance: ['This is crucial because...', 'Here\'s why this matters...', 'Pay attention to this...'],
  example: ['Let me give you an example...', 'Here\'s how this works in practice...', 'For instance...'],
  summary: ['To recap...', 'Let\'s summarize...', 'The key takeaway here is...'],
  objection: ['Now you might be thinking...', 'I know what you\'re wondering...', 'Some people ask...']
};

// B-roll cues
const BROLL_CUES = {
  explanation: '[B-ROLL: Show diagram/illustration]',
  example: '[B-ROLL: Screen recording/demonstration]',
  emotion: '[B-ROLL: Relevant lifestyle footage]',
  data: '[B-ROLL: Stats/graphs on screen]',
  transition: '[B-ROLL: Quick transition clip]'
};

// Data storage
let scriptsData = {
  scripts: [],
  templates: {},
  series: []
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(SCRIPTS_FILE, 'utf8');
    scriptsData = JSON.parse(data);
  } catch {
    scriptsData = { scripts: [], templates: {}, series: [] };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(SCRIPTS_FILE, JSON.stringify(scriptsData, null, 2));
}

/**
 * Generate YouTube video script
 */
async function generateYouTubeScript(topic, options = {}) {
  const duration = options.duration || 10; // minutes
  const style = options.style || 'educational';
  
  const script = {
    id: `yt-${Date.now()}`,
    type: 'youtube',
    topic,
    estimatedDuration: `${duration} minutes`,
    sections: []
  };
  
  // Hook (0-30 seconds)
  script.sections.push({
    name: 'Hook',
    duration: '0:00 - 0:30',
    content: generateHook(topic, 'question'),
    notes: 'Capture attention immediately. No intro logos, jump right in.',
    bRoll: BROLL_CUES.emotion
  });
  
  // Intro (30 seconds - 1 minute)
  script.sections.push({
    name: 'Intro',
    duration: '0:30 - 1:00',
    content: `In this video, I'm going to show you exactly how to master ${topic}. By the end, you'll have a clear, actionable plan you can implement today. If you're new here, I share content about [NICHE] every week, so consider subscribing.`,
    notes: 'Brief intro, set expectations, soft CTA for subscribe',
    bRoll: BROLL_CUES.transition
  });
  
  // Main Content (bulk of video)
  const contentPoints = generateContentPoints(topic, 3);
  let timeMarker = 1;
  
  for (let i = 0; i < contentPoints.length; i++) {
    const endTime = timeMarker + Math.floor((duration - 3) / 3);
    script.sections.push({
      name: `Point ${i + 1}: ${contentPoints[i].title}`,
      duration: `${timeMarker}:00 - ${endTime}:00`,
      content: contentPoints[i].content,
      talking: contentPoints[i].talkingPoints,
      notes: contentPoints[i].notes,
      bRoll: BROLL_CUES.explanation
    });
    timeMarker = endTime;
  }
  
  // Call to Action
  script.sections.push({
    name: 'Call to Action',
    duration: `${duration - 1}:00 - ${duration - 0.5}:00`,
    content: `If you found this helpful, smash that like button and subscribe for more content like this. Drop a comment below and let me know which tip you're going to implement first.`,
    notes: 'Engagement CTAs - like, comment, subscribe',
    bRoll: BROLL_CUES.transition
  });
  
  // Outro
  script.sections.push({
    name: 'Outro',
    duration: `${duration - 0.5}:00 - ${duration}:00`,
    content: `Thanks for watching! I'll see you in the next video. [Point to recommended video]`,
    notes: 'Keep outro brief. Point to next video for continued watch time.',
    endScreen: true
  });
  
  // Add metadata
  script.metadata = {
    suggestedTitle: `How to ${topic} (Complete Guide)`,
    suggestedDescription: generateVideoDescription(topic),
    suggestedTags: generateVideoTags(topic),
    thumbnailIdeas: generateThumbnailIdeas(topic)
  };
  
  script.generatedAt = new Date().toISOString();
  
  scriptsData.scripts.push(script);
  await saveData();
  
  return script;
}

/**
 * Generate content points
 */
function generateContentPoints(topic, count) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Step ${i + 1}`,
    content: `[Content for step ${i + 1} about ${topic}]`,
    talkingPoints: [
      'What this step involves',
      'Why it matters',
      'Common mistakes to avoid',
      'How to do it correctly'
    ],
    notes: `Explain point ${i + 1} clearly with examples`
  }));
}

/**
 * Generate video description
 */
function generateVideoDescription(topic) {
  return `In this video, you'll learn everything you need to know about ${topic}.

📌 Key Timestamps:
0:00 - Hook
0:30 - Introduction
1:00 - Step 1
[Add more timestamps]

🔗 Resources Mentioned:
[Add links]

📱 Follow Me:
Instagram: @[HANDLE]
Twitter: @[HANDLE]

#${topic.replace(/\s+/g, '')} #[NICHE] #Tutorial`;
}

/**
 * Generate video tags
 */
function generateVideoTags(topic) {
  const words = topic.toLowerCase().split(' ');
  return [
    topic,
    `how to ${topic}`,
    `${topic} tutorial`,
    `${topic} guide`,
    `${topic} for beginners`,
    `best ${topic}`,
    ...words
  ];
}

/**
 * Generate thumbnail ideas
 */
function generateThumbnailIdeas(topic) {
  return [
    { style: 'Face + Text', description: `Surprised face with "${topic.toUpperCase()}" in bold` },
    { style: 'Before/After', description: 'Split thumbnail showing transformation' },
    { style: 'Numbered', description: `"3 Steps to ${topic}" with icons` },
    { style: 'Curiosity', description: 'Question mark or blur element to create intrigue' }
  ];
}

/**
 * Generate podcast script
 */
async function generatePodcastScript(topic, options = {}) {
  const duration = options.duration || 30; // minutes
  const format = options.format || 'solo';
  
  const script = {
    id: `pod-${Date.now()}`,
    type: 'podcast',
    topic,
    format,
    estimatedDuration: `${duration} minutes`,
    sections: []
  };
  
  // Teaser
  script.sections.push({
    name: 'Teaser',
    duration: '0:00 - 0:30',
    content: `[COLD OPEN] "What if I told you that everything you know about ${topic} is about to change? Today, we're diving deep into..."`,
    notes: 'Start with a compelling hook before the intro music'
  });
  
  // Intro
  script.sections.push({
    name: 'Intro',
    duration: '0:30 - 2:00',
    content: `[INTRO MUSIC]
Welcome to [PODCAST NAME]. I'm [HOST NAME], and today we're tackling ${topic}. 

Before we dive in, a quick thank you to our sponsor [SPONSOR] - [30 second ad read].

Alright, let's get into it.`,
    notes: 'Include standard intro, sponsor, set the stage'
  });
  
  // Main Content
  const segments = Math.floor((duration - 5) / 8); // ~8 min segments
  for (let i = 0; i < segments; i++) {
    script.sections.push({
      name: `Segment ${i + 1}`,
      duration: `${2 + (i * 8)}:00 - ${10 + (i * 8)}:00`,
      content: `[SEGMENT ${i + 1} TOPIC]
      
Key Points to Cover:
• Point one about ${topic}
• Point two with example
• Point three with actionable advice

[Transition to next segment]`,
      notes: `Natural conversation flow, tell stories, give examples`
    });
  }
  
  // Key Takeaways
  script.sections.push({
    name: 'Key Takeaways',
    duration: `${duration - 3}:00 - ${duration - 1}:00`,
    content: `Let's wrap up with the three biggest takeaways from today:

1. [First key insight]
2. [Second key insight]  
3. [Third key insight]

If you remember nothing else, remember this: [Core message]`,
    notes: 'Summarize value, make it memorable'
  });
  
  // Outro
  script.sections.push({
    name: 'Outro',
    duration: `${duration - 1}:00 - ${duration}:00`,
    content: `That's a wrap for today! If you enjoyed this episode, please subscribe and leave a review - it helps more people find the show.

Got questions? DM me on [PLATFORM] or email [EMAIL].

Until next time, [SIGN OFF CATCHPHRASE].

[OUTRO MUSIC]`,
    notes: 'CTA for subscribe/review, contact info, consistent sign-off'
  });
  
  // Show notes template
  script.showNotes = {
    title: `[EPISODE #]: ${topic}`,
    description: `In this episode, we explore ${topic}. You'll learn [KEY OUTCOMES].`,
    timestamps: script.sections.map(s => `${s.duration.split(' - ')[0]} - ${s.name}`),
    links: ['[RESOURCE 1]', '[RESOURCE 2]'],
    cta: 'Subscribe • Leave a Review • Share with a Friend'
  };
  
  script.generatedAt = new Date().toISOString();
  
  scriptsData.scripts.push(script);
  await saveData();
  
  return script;
}

/**
 * Generate VSL script
 */
async function generateVSLScript(product, options = {}) {
  const price = options.price || 97;
  
  const script = {
    id: `vsl-${Date.now()}`,
    type: 'vsl',
    product,
    price,
    estimatedDuration: '20-30 minutes',
    sections: []
  };
  
  // Pattern Interrupt
  script.sections.push({
    name: 'Pattern Interrupt',
    duration: '0:00 - 0:15',
    content: `Wait! Before you click away, let me ask you something important...`,
    visual: '[Attention-grabbing visual or text on screen]',
    notes: 'Break the pattern, create curiosity'
  });
  
  // Problem
  script.sections.push({
    name: 'Problem',
    duration: '0:15 - 3:00',
    content: `Are you struggling with ${product}? 

Do you feel like no matter what you try, nothing works?

You've probably tried [COMMON SOLUTION 1], [COMMON SOLUTION 2], and [COMMON SOLUTION 3]...

But you're still stuck. Still frustrated. Still searching for answers.

I get it. I've been exactly where you are.`,
    visual: '[Show relatable imagery of struggle]',
    notes: 'Connect with the pain, build empathy'
  });
  
  // Agitation
  script.sections.push({
    name: 'Agitation',
    duration: '3:00 - 6:00',
    content: `Here's the thing... 

Every day you wait, every day you put this off, the problem doesn't get better. It gets worse.

While you're stuck, others are moving forward. Others are getting the results you want.

And the worst part? You know you're capable of more. You KNOW there has to be a better way.

But you've been let down before. You've tried things that didn't work. And now you're skeptical...

I completely understand.`,
    visual: '[Emotional imagery, consequences of inaction]',
    notes: 'Intensify the problem, create urgency'
  });
  
  // Solution
  script.sections.push({
    name: 'Solution',
    duration: '6:00 - 10:00',
    content: `That's exactly why I created ${product}.

Hi, I'm [NAME], and after [X YEARS] of [EXPERIENCE], I discovered something that changed everything.

See, the problem isn't you. The problem is you've been given the wrong tools, the wrong strategies, the wrong approach.

What if there was a system that...
• [BENEFIT 1]
• [BENEFIT 2]
• [BENEFIT 3]

That's exactly what ${product} delivers.`,
    visual: '[Introduce yourself, credibility shots]',
    notes: 'Position yourself as the guide, introduce solution'
  });
  
  // Benefits
  script.sections.push({
    name: 'Benefits',
    duration: '10:00 - 15:00',
    content: `With ${product}, you'll discover:

✓ [BENEFIT 1] - So you can [OUTCOME]
✓ [BENEFIT 2] - Meaning you'll finally [OUTCOME]
✓ [BENEFIT 3] - Which lets you [OUTCOME]
✓ [BENEFIT 4] - Giving you [OUTCOME]
✓ [BENEFIT 5] - Allowing you to [OUTCOME]

Imagine waking up 30 days from now and [DESIRED OUTCOME].

That's not a fantasy. That's what's possible when you have the right system.`,
    visual: '[Benefits on screen, lifestyle imagery]',
    notes: 'Stack benefits, paint the future'
  });
  
  // Social Proof
  script.sections.push({
    name: 'Social Proof',
    duration: '15:00 - 18:00',
    content: `Don't just take my word for it. 

[TESTIMONIAL 1 - Name, result, timeframe]

[TESTIMONIAL 2 - Name, result, quote]

[TESTIMONIAL 3 - Name, skeptic turned believer story]

These are real people who were exactly where you are right now.`,
    visual: '[Testimonial videos or screenshots]',
    notes: 'Show proof, build trust, overcome skepticism'
  });
  
  // Offer
  script.sections.push({
    name: 'Offer',
    duration: '18:00 - 23:00',
    content: `So here's what you get when you join today:

📦 The Complete ${product} System (Value: $[X])
📦 [BONUS 1] (Value: $[X])
📦 [BONUS 2] (Value: $[X])
📦 [BONUS 3] (Value: $[X])

Total Value: $[TOTAL VALUE]

But you won't pay anywhere near that.

You won't even pay half.

Your investment today is just $${price}.`,
    visual: '[Stack the offer visually]',
    notes: 'Build value, then reveal price'
  });
  
  // Guarantee
  script.sections.push({
    name: 'Guarantee',
    duration: '23:00 - 24:00',
    content: `And here's my guarantee to you:

Try ${product} for 30 full days. If you don't see results, if you're not completely satisfied, simply email us and we'll refund every penny.

No questions asked. No hassles. No hard feelings.

You literally have nothing to lose.`,
    visual: '[Guarantee badge/seal]',
    notes: 'Remove risk completely'
  });
  
  // Urgency
  script.sections.push({
    name: 'Urgency',
    duration: '24:00 - 25:00',
    content: `But I need to be honest with you...

This special pricing won't last forever. [REASON FOR URGENCY]

[SCARCITY ELEMENT - limited spots, price going up, bonuses expiring]

The question isn't whether this will work. The question is: are you ready to take action?`,
    visual: '[Timer, limited spots counter]',
    notes: 'Create urgency without being pushy'
  });
  
  // CTA
  script.sections.push({
    name: 'Call to Action',
    duration: '25:00 - 27:00',
    content: `Click the button below right now.

Fill in your details on the next page.

And get instant access to ${product}.

In just a few minutes, you could be starting your transformation.

Don't let this opportunity pass you by.

Click the button now.

[REPEAT CTA]`,
    visual: '[CTA button, checkout page preview]',
    notes: 'Clear, direct CTA. Repeat it.'
  });
  
  script.generatedAt = new Date().toISOString();
  
  scriptsData.scripts.push(script);
  await saveData();
  
  return script;
}

/**
 * Generate short-form script (TikTok/Reels/Shorts)
 */
async function generateShortsScript(topic, options = {}) {
  const duration = options.duration || 30; // seconds
  const style = options.style || 'educational';
  
  const scripts = [];
  
  // Generate multiple variations
  const variations = [
    {
      name: 'Problem-Solution',
      hook: `Stop making this ${topic} mistake 🛑`,
      value: `Here's what to do instead: [QUICK TIP]`,
      cta: `Follow for more ${topic} tips ✨`
    },
    {
      name: 'Myth-Busting',
      hook: `${topic} "experts" don't want you to know this 👀`,
      value: `The truth is: [REVEAL TRUTH]`,
      cta: `Save this before it gets deleted 💾`
    },
    {
      name: 'Quick Tips',
      hook: `3 ${topic} hacks in ${duration} seconds ⚡`,
      value: `1. [TIP]\n2. [TIP]\n3. [TIP]`,
      cta: `Which one are you trying first? Comment below 👇`
    },
    {
      name: 'Story Hook',
      hook: `I ${topic.toLowerCase()} for 30 days straight. Here's what happened...`,
      value: `[TRANSFORMATION/RESULT]`,
      cta: `Full breakdown in bio 🔗`
    },
    {
      name: 'Controversial',
      hook: `Unpopular opinion: ${topic} is overrated.`,
      value: `Here's why: [CONTRARIAN TAKE]`,
      cta: `Agree or disagree? 🤔`
    }
  ];
  
  for (const v of variations) {
    scripts.push({
      id: `short-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'shorts',
      topic,
      duration: `${duration} seconds`,
      style: v.name,
      sections: [
        { name: 'Hook', duration: '0-3s', content: v.hook, notes: 'Stop the scroll!' },
        { name: 'Value', duration: '3-25s', content: v.value, notes: 'Deliver the goods fast' },
        { name: 'CTA', duration: '25-30s', content: v.cta, notes: 'Drive engagement' }
      ],
      hashtags: generateHashtags(topic),
      captionIdea: `${v.hook} | ${topic} #fyp`
    });
  }
  
  // Save all variations
  scriptsData.scripts.push(...scripts);
  await saveData();
  
  return {
    topic,
    variations: scripts,
    bestPractices: [
      'Hook in first 1-3 seconds',
      'Face the camera for connection',
      'Use trending sounds when relevant',
      'Text on screen for accessibility',
      'Call to action that drives comments'
    ]
  };
}

/**
 * Generate hashtags
 */
function generateHashtags(topic) {
  const words = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ');
  return [
    '#fyp',
    '#viral',
    `#${words.join('')}`,
    `#${words[0]}tips`,
    '#learnontiktok',
    '#trending'
  ];
}

/**
 * Generate webinar script
 */
async function generateWebinarScript(topic, options = {}) {
  const duration = options.duration || 60; // minutes
  
  const script = {
    id: `webinar-${Date.now()}`,
    type: 'webinar',
    topic,
    estimatedDuration: `${duration} minutes`,
    sellTime: '40-45 minutes in',
    sections: []
  };
  
  // Welcome (0-5 min)
  script.sections.push({
    name: 'Welcome & Housekeeping',
    duration: '0:00 - 5:00',
    content: `Welcome everyone! So glad you're here.

A few quick things before we dive in:
• This is being recorded
• Chat is open - say hi and where you're from!
• We'll have Q&A at the end
• Stay until the end for a special offer

Let's get started!`,
    slides: 'Welcome slide, housekeeping bullets'
  });
  
  // Hook (5-10 min)
  script.sections.push({
    name: 'Hook & Promise',
    duration: '5:00 - 10:00',
    content: `In the next ${duration} minutes, I'm going to show you exactly how to ${topic}.

By the end, you'll have:
✓ [OUTCOME 1]
✓ [OUTCOME 2]
✓ [OUTCOME 3]

And I'm going to share something at the end that will accelerate your results even faster.`,
    slides: 'Promise slide with outcomes'
  });
  
  // Content Pillars (10-35 min)
  for (let i = 1; i <= 3; i++) {
    const start = 10 + ((i - 1) * 8);
    const end = start + 8;
    script.sections.push({
      name: `Content Pillar ${i}`,
      duration: `${start}:00 - ${end}:00`,
      content: `[PILLAR ${i} TITLE]

Key teaching points:
• Main concept
• Case study or example
• Common mistake to avoid
• Quick win they can implement

[Bridge to next pillar or transition]`,
      slides: `Pillar ${i} content slides`
    });
  }
  
  // Transition to Offer (35-40 min)
  script.sections.push({
    name: 'Transition to Offer',
    duration: '35:00 - 40:00',
    content: `Now, everything I've shared today will help you get started.

But I know that implementing this on your own can be challenging.

That's why I created [PRODUCT NAME].`,
    slides: 'Transition slide'
  });
  
  // Offer (40-55 min)
  script.sections.push({
    name: 'Offer Presentation',
    duration: '40:00 - 55:00',
    content: `[PRODUCT NAME] gives you everything you need to ${topic}.

Here's what's included:
• [MODULE 1] - Value $X
• [MODULE 2] - Value $X
• [MODULE 3] - Value $X

Plus these bonuses:
• [BONUS 1] - Value $X
• [BONUS 2] - Value $X

Total value: $[TOTAL]
Your investment: $[PRICE]

And you're protected by our [GUARANTEE].`,
    slides: 'Offer stack slides'
  });
  
  // Q&A (55-60 min)
  script.sections.push({
    name: 'Q&A',
    duration: '55:00 - 60:00',
    content: `Let's take some questions!

[PREPARED FAQ]
Q1: [COMMON QUESTION] - [ANSWER]
Q2: [OBJECTION] - [OVERCOME]
Q3: [QUESTION] - [ANSWER]

The link to join is [URL]. Any questions?`,
    slides: 'Q&A slide with link'
  });
  
  script.generatedAt = new Date().toISOString();
  
  scriptsData.scripts.push(script);
  await saveData();
  
  return script;
}

/**
 * Generate hook
 */
function generateHook(topic, style) {
  const template = HOOK_TEMPLATES[style] || HOOK_TEMPLATES.question;
  return template
    .replace('{topic}', topic)
    .replace('{outcome}', `master ${topic}`)
    .replace('{statistic}', '73%');
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'youtube': {
        const topic = args.join(' ') || 'productivity tips';
        const script = await generateYouTubeScript(topic);
        
        console.log('YouTube Script Generated');
        console.log('='.repeat(50));
        console.log(`Topic: ${script.topic}`);
        console.log(`Duration: ${script.estimatedDuration}`);
        
        for (const section of script.sections) {
          console.log(`\n[${section.duration}] ${section.name}`);
          console.log(section.content.substring(0, 200) + '...');
        }
        break;
      }
      
      case 'podcast': {
        const topic = args.join(' ') || 'business growth';
        const script = await generatePodcastScript(topic);
        
        console.log('Podcast Script Generated');
        console.log('='.repeat(50));
        console.log(`Topic: ${script.topic}`);
        console.log(`Duration: ${script.estimatedDuration}`);
        
        for (const section of script.sections) {
          console.log(`\n[${section.duration}] ${section.name}`);
        }
        break;
      }
      
      case 'vsl': {
        const product = args.join(' ') || 'Marketing Mastery';
        const script = await generateVSLScript(product);
        
        console.log('VSL Script Generated');
        console.log('='.repeat(50));
        console.log(`Product: ${script.product}`);
        
        for (const section of script.sections) {
          console.log(`\n[${section.duration}] ${section.name}`);
        }
        break;
      }
      
      case 'shorts': {
        const topic = args.join(' ') || 'morning routine';
        const result = await generateShortsScript(topic);
        
        console.log('Short-Form Scripts Generated');
        console.log('='.repeat(50));
        
        for (const v of result.variations) {
          console.log(`\n[${v.style}]`);
          console.log(`Hook: ${v.sections[0].content}`);
          console.log(`CTA: ${v.sections[2].content}`);
        }
        break;
      }
      
      case 'webinar': {
        const topic = args.join(' ') || 'scaling your business';
        const script = await generateWebinarScript(topic);
        
        console.log('Webinar Script Generated');
        console.log('='.repeat(50));
        console.log(`Topic: ${script.topic}`);
        console.log(`Sell Time: ${script.sellTime}`);
        
        for (const section of script.sections) {
          console.log(`  [${section.duration}] ${section.name}`);
        }
        break;
      }
      
      case 'test': {
        console.log('Script Writer Module');
        console.log('====================');
        console.log(`Script types: ${Object.keys(SCRIPT_STRUCTURES).length}`);
        console.log(`Hook templates: ${Object.keys(HOOK_TEMPLATES).length}`);
        console.log(`Scripts generated: ${scriptsData.scripts.length}`);
        break;
      }
      
      default:
        console.log('Script Writer - OpenClaw');
        console.log('Run with "test" to see status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  generateYouTubeScript,
  generatePodcastScript,
  generateVSLScript,
  generateShortsScript,
  generateWebinarScript,
  SCRIPT_STRUCTURES,
  HOOK_TEMPLATES,
  TRANSITIONS,
  BROLL_CUES
};

// Run CLI
main().catch(console.error);
