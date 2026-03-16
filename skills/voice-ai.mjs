#!/usr/bin/env node
/**
 * OpenClaw Voice AI Integration
 * 
 * Features:
 *   - Twilio/Vapi integration for voice calls
 *   - AI-powered voice conversations
 *   - Call scheduling and management
 *   - Conversation transcripts
 *   - Lead qualification via voice
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { openclawSend } from '../lib/safe-exec.mjs';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const VOICE_DIR = path.join(DATA_DIR, 'voice');
const CALLS_FILE = path.join(VOICE_DIR, 'calls.json');
const CONFIG_FILE = path.join(VOICE_DIR, 'config.json');

const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Voice service credentials (set via config)
let TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
let TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
let TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '';
let VAPI_KEY = process.env.VAPI_API_KEY || '';

// Call templates
const CALL_TEMPLATES = {
  'lead-qualification': {
    name: 'Lead Qualification',
    greeting: "Hi, this is an assistant calling from Truth J Blue's team. I'm reaching out to learn more about your journey and see how we might be able to help. Do you have a few minutes to chat?",
    questions: [
      "What initially drew you to explore personal transformation?",
      "On a scale of 1 to 10, how committed are you to making a change right now?",
      "What's the biggest obstacle standing in your way currently?",
      "If we could solve that obstacle, what would that mean for your life?"
    ],
    closing: "Thank you so much for sharing. Based on what you've told me, I think there might be a great opportunity for you. Would you be open to scheduling a deeper conversation with our team?",
    tags: ['voice-qualified', 'lead-call-completed']
  },
  'follow-up': {
    name: 'Follow-Up Call',
    greeting: "Hi! I'm calling from Truth J Blue's team to follow up on your recent inquiry. Thanks for your interest! How are you doing today?",
    questions: [
      "Did you get a chance to check out the eBook?",
      "What resonated most with you?",
      "Are there any questions I can help answer?"
    ],
    closing: "Great chatting with you. We have some exciting programs that might be a perfect fit. Can I have someone from our team reach out to tell you more?",
    tags: ['follow-up-completed']
  },
  'appointment-reminder': {
    name: 'Appointment Reminder',
    greeting: "Hi! This is a friendly reminder about your upcoming appointment with Truth J Blue's team. Just wanted to confirm you're still available. Can we count on seeing you?",
    questions: [],
    closing: "Perfect! We're looking forward to speaking with you. See you soon!",
    tags: ['reminded']
  }
};

/**
 * Load voice config
 */
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    TWILIO_SID = config.twilio?.sid || TWILIO_SID;
    TWILIO_TOKEN = config.twilio?.token || TWILIO_TOKEN;
    TWILIO_PHONE = config.twilio?.phone || TWILIO_PHONE;
    VAPI_KEY = config.vapi?.key || VAPI_KEY;
    return config;
  } catch {
    return {
      twilio: { sid: '', token: '', phone: '' },
      vapi: { key: '' },
      defaultProvider: 'twilio'
    };
  }
}

/**
 * Save voice config
 */
async function saveConfig(config) {
  await fs.mkdir(VOICE_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Load calls
 */
async function loadCalls() {
  try {
    const data = await fs.readFile(CALLS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { scheduled: [], completed: [], failed: [] };
  }
}

/**
 * Save calls
 */
async function saveCalls(calls) {
  await fs.mkdir(VOICE_DIR, { recursive: true });
  await fs.writeFile(CALLS_FILE, JSON.stringify(calls, null, 2));
}

/**
 * Make GHL API request
 */
function ghlRequest(method, urlPath, body = null) {
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
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Send Telegram notification
 */
async function sendNotification(message) {
  try {
    await openclawSend({ agent: 'main', channel: 'telegram', to: TELEGRAM_CHAT_ID, message });
    return true;
  } catch {
    return false;
  }
}

/**
 * Make HTTP request (generic)
 */
function httpRequest(hostname, urlPath, method, headers, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port: 443,
      path: urlPath,
      method,
      headers
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Schedule a call via Twilio
 */
async function scheduleCallTwilio(phoneNumber, templateId, scheduledTime = null) {
  await loadConfig();
  
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    return { error: 'Twilio not configured. Run: voice-ai.mjs configure twilio' };
  }
  
  const template = CALL_TEMPLATES[templateId];
  if (!template) {
    return { error: `Template not found: ${templateId}` };
  }
  
  const callId = `call_${Date.now()}`;
  const calls = await loadCalls();
  
  const callRecord = {
    id: callId,
    phoneNumber,
    templateId,
    templateName: template.name,
    scheduledAt: scheduledTime || new Date().toISOString(),
    status: scheduledTime ? 'scheduled' : 'initiating',
    provider: 'twilio',
    createdAt: new Date().toISOString()
  };
  
  if (scheduledTime && new Date(scheduledTime) > new Date()) {
    // Future call - add to scheduled
    calls.scheduled.push(callRecord);
    await saveCalls(calls);
    return { success: true, callId, status: 'scheduled', scheduledAt: scheduledTime };
  }
  
  // Immediate call
  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
    
    // Build TwiML for the call
    const twimlContent = buildTwiML(template);
    
    // For production, you'd host this TwiML at a URL
    // For now, we'll use Twilio's raw TwiML parameter
    const params = new URLSearchParams({
      To: phoneNumber,
      From: TWILIO_PHONE,
      Twiml: twimlContent
    });
    
    const result = await httpRequest(
      'api.twilio.com',
      `/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`,
      'POST',
      {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      params.toString()
    );
    
    if (result.status >= 200 && result.status < 300) {
      callRecord.status = 'initiated';
      callRecord.twilioSid = result.data.sid;
      calls.completed.push(callRecord);
      await saveCalls(calls);
      
      await sendNotification(`📞 Call initiated to ${phoneNumber}\nTemplate: ${template.name}`);
      
      return { success: true, callId, status: 'initiated', twilioSid: result.data.sid };
    } else {
      callRecord.status = 'failed';
      callRecord.error = result.data;
      calls.failed.push(callRecord);
      await saveCalls(calls);
      
      return { success: false, error: result.data };
    }
  } catch (error) {
    callRecord.status = 'failed';
    callRecord.error = error.message;
    calls.failed.push(callRecord);
    await saveCalls(calls);
    
    return { success: false, error: error.message };
  }
}

/**
 * Build TwiML for call
 */
function buildTwiML(template) {
  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
  
  // Greeting
  twiml += `<Say voice="alice">${escapeXml(template.greeting)}</Say>`;
  twiml += '<Pause length="2"/>';
  
  // Questions (if any)
  for (const question of template.questions) {
    twiml += `<Say voice="alice">${escapeXml(question)}</Say>`;
    twiml += '<Pause length="3"/>';
  }
  
  // Closing
  twiml += `<Say voice="alice">${escapeXml(template.closing)}</Say>`;
  
  twiml += '</Response>';
  return twiml;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Schedule call via Vapi (AI voice agent)
 */
async function scheduleCallVapi(phoneNumber, templateId, contactId = null) {
  await loadConfig();
  
  if (!VAPI_KEY) {
    return { error: 'Vapi not configured. Run: voice-ai.mjs configure vapi' };
  }
  
  const template = CALL_TEMPLATES[templateId];
  if (!template) {
    return { error: `Template not found: ${templateId}` };
  }
  
  // Get contact info if provided
  let contactInfo = {};
  if (contactId) {
    try {
      const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
      contactInfo = {
        firstName: contact.contact?.firstName || contact.firstName || '',
        lastName: contact.contact?.lastName || contact.lastName || '',
        email: contact.contact?.email || contact.email || ''
      };
    } catch {}
  }
  
  const callId = `vapi_${Date.now()}`;
  const calls = await loadCalls();
  
  try {
    // Build Vapi assistant config
    const assistantConfig = {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a friendly assistant calling on behalf of Truth J Blue's team. 
Your goal is to have a natural conversation while gathering information.
Be warm, empathetic, and professional.

Contact info: ${JSON.stringify(contactInfo)}

Call script:
- Greeting: ${template.greeting}
- Questions: ${template.questions.join('; ')}
- Closing: ${template.closing}

Adapt naturally to the conversation while covering these points.`
          }
        ]
      },
      voice: {
        provider: '11labs',
        voiceId: 'rachel'
      },
      firstMessage: template.greeting.replace("this is an assistant", 
        `this is ${contactInfo.firstName ? `reaching out to ${contactInfo.firstName}` : 'reaching out'}`),
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2'
      }
    };
    
    const result = await httpRequest(
      'api.vapi.ai',
      '/call/phone',
      'POST',
      {
        'Authorization': `Bearer ${VAPI_KEY}`,
        'Content-Type': 'application/json'
      },
      {
        phoneNumber: phoneNumber,
        assistant: assistantConfig
      }
    );
    
    const callRecord = {
      id: callId,
      phoneNumber,
      templateId,
      templateName: template.name,
      contactId,
      status: result.status < 300 ? 'initiated' : 'failed',
      provider: 'vapi',
      vapiId: result.data?.id,
      createdAt: new Date().toISOString()
    };
    
    if (result.status < 300) {
      calls.completed.push(callRecord);
      await saveCalls(calls);
      
      await sendNotification(`🤖 AI Call initiated to ${phoneNumber}\nTemplate: ${template.name}`);
      
      return { success: true, callId, status: 'initiated', vapiId: result.data?.id };
    } else {
      callRecord.error = result.data;
      calls.failed.push(callRecord);
      await saveCalls(calls);
      
      return { success: false, error: result.data };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Call contact by ID
 */
async function callContact(contactId, templateId, provider = 'twilio') {
  // Get contact phone
  const contact = await ghlRequest('GET', `/contacts/${contactId}?locationId=${GHL_LOCATION_ID}`);
  const phone = contact.contact?.phone || contact.phone;
  
  if (!phone) {
    return { error: 'Contact has no phone number' };
  }
  
  console.log(`\n📞 Initiating ${provider} call to: ${phone}`);
  
  if (provider === 'vapi') {
    return await scheduleCallVapi(phone, templateId, contactId);
  } else {
    return await scheduleCallTwilio(phone, templateId);
  }
}

/**
 * Process scheduled calls
 */
async function processScheduledCalls() {
  const calls = await loadCalls();
  const now = new Date();
  let processed = 0;
  
  const stillScheduled = [];
  
  for (const call of calls.scheduled) {
    const scheduledTime = new Date(call.scheduledAt);
    
    if (scheduledTime <= now) {
      console.log(`\n⏰ Processing scheduled call: ${call.id}`);
      
      const result = call.provider === 'vapi'
        ? await scheduleCallVapi(call.phoneNumber, call.templateId)
        : await scheduleCallTwilio(call.phoneNumber, call.templateId);
      
      if (result.success) {
        call.status = 'initiated';
        calls.completed.push(call);
        processed++;
      } else {
        call.status = 'failed';
        call.error = result.error;
        calls.failed.push(call);
      }
    } else {
      stillScheduled.push(call);
    }
  }
  
  calls.scheduled = stillScheduled;
  await saveCalls(calls);
  
  console.log(`\n✅ Processed ${processed} scheduled calls`);
  return processed;
}

/**
 * Add tags after call
 */
async function tagAfterCall(contactId, templateId, outcome = 'completed') {
  const template = CALL_TEMPLATES[templateId];
  if (!template) return;
  
  const tags = [...template.tags];
  if (outcome === 'no-answer') {
    tags.push('voice-no-answer');
  } else if (outcome === 'voicemail') {
    tags.push('voice-voicemail');
  }
  
  try {
    await ghlRequest('PUT', `/contacts/${contactId}`, {
      locationId: GHL_LOCATION_ID,
      tags
    });
    console.log(`  Tagged contact with: ${tags.join(', ')}`);
  } catch {}
}

/**
 * Configure voice provider
 */
async function configureProvider(provider, credentials) {
  const config = await loadConfig();
  
  if (provider === 'twilio') {
    config.twilio = {
      sid: credentials.sid,
      token: credentials.token,
      phone: credentials.phone
    };
  } else if (provider === 'vapi') {
    config.vapi = {
      key: credentials.key
    };
  }
  
  config.defaultProvider = provider;
  await saveConfig(config);
  
  console.log(`\n✅ ${provider} configured successfully`);
}

/**
 * List call templates
 */
function listTemplates() {
  console.log('\n📋 CALL TEMPLATES\n');
  
  for (const [id, template] of Object.entries(CALL_TEMPLATES)) {
    console.log(`${id}:`);
    console.log(`  Name: ${template.name}`);
    console.log(`  Questions: ${template.questions.length}`);
    console.log(`  Tags: ${template.tags.join(', ')}`);
    console.log('');
  }
}

/**
 * Show call history
 */
async function showHistory() {
  const calls = await loadCalls();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📞 CALL HISTORY');
  console.log('═'.repeat(60) + '\n');
  
  console.log(`Scheduled: ${calls.scheduled.length}`);
  console.log(`Completed: ${calls.completed.length}`);
  console.log(`Failed: ${calls.failed.length}\n`);
  
  console.log('Recent Calls:');
  const recent = [...calls.completed, ...calls.failed]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
  
  for (const call of recent) {
    const icon = call.status === 'initiated' ? '✅' : '❌';
    console.log(`  ${icon} ${call.phoneNumber} - ${call.templateName} (${call.provider})`);
    console.log(`     ${call.createdAt}`);
  }
  
  if (calls.scheduled.length > 0) {
    console.log('\nUpcoming Scheduled:');
    for (const call of calls.scheduled.slice(0, 5)) {
      console.log(`  ⏰ ${call.phoneNumber} - ${call.templateName} at ${call.scheduledAt}`);
    }
  }
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'call':
    if (args.length < 2) {
      console.log('Usage: voice-ai.mjs call <phone> <templateId> [provider]');
      console.log('  provider: twilio (default) or vapi');
    } else {
      const phone = args[0];
      const template = args[1];
      const provider = args[2] || 'twilio';
      
      if (provider === 'vapi') {
        scheduleCallVapi(phone, template);
      } else {
        scheduleCallTwilio(phone, template);
      }
    }
    break;
    
  case 'call-contact':
    if (args.length < 2) {
      console.log('Usage: voice-ai.mjs call-contact <contactId> <templateId> [provider]');
    } else {
      callContact(args[0], args[1], args[2] || 'twilio').then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;
    
  case 'schedule':
    if (args.length < 3) {
      console.log('Usage: voice-ai.mjs schedule <phone> <templateId> <datetime>');
      console.log('  datetime: ISO format (e.g., 2026-07-10T14:00:00)');
    } else {
      scheduleCallTwilio(args[0], args[1], args[2]).then(r => console.log(JSON.stringify(r, null, 2)));
    }
    break;
    
  case 'process':
    processScheduledCalls();
    break;
    
  case 'templates':
    listTemplates();
    break;
    
  case 'history':
    showHistory();
    break;
    
  case 'configure':
    if (args[0] === 'twilio' && args.length >= 4) {
      configureProvider('twilio', { sid: args[1], token: args[2], phone: args[3] });
    } else if (args[0] === 'vapi' && args[1]) {
      configureProvider('vapi', { key: args[1] });
    } else {
      console.log('Usage:');
      console.log('  voice-ai.mjs configure twilio <sid> <token> <phone>');
      console.log('  voice-ai.mjs configure vapi <api-key>');
    }
    break;
    
  case 'tag':
    if (args.length < 2) {
      console.log('Usage: voice-ai.mjs tag <contactId> <templateId> [outcome]');
    } else {
      tagAfterCall(args[0], args[1], args[2] || 'completed');
    }
    break;
    
  default:
    console.log(`
Voice AI Integration

Usage:
  voice-ai.mjs call <phone> <template> [provider]       - Make immediate call
  voice-ai.mjs call-contact <id> <template> [provider]  - Call contact by ID
  voice-ai.mjs schedule <phone> <template> <datetime>   - Schedule future call
  voice-ai.mjs process                                  - Process scheduled calls
  voice-ai.mjs templates                                - List call templates
  voice-ai.mjs history                                  - Show call history
  voice-ai.mjs configure <provider> <credentials>       - Configure provider
  voice-ai.mjs tag <contactId> <template> [outcome]     - Tag contact after call

Providers:
  twilio  - Traditional phone call with TwiML script
  vapi    - AI-powered conversational voice agent

Templates:
  lead-qualification  - Qualify new leads
  follow-up           - Follow up on inquiry
  appointment-reminder - Remind about appointment

Configuration:
  voice-ai.mjs configure twilio <sid> <token> <phone>
  voice-ai.mjs configure vapi <api-key>
`);
}

export { 
  scheduleCallTwilio, 
  scheduleCallVapi, 
  callContact, 
  processScheduledCalls,
  configureProvider,
  tagAfterCall 
};
