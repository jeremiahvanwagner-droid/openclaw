#!/usr/bin/env node
/**
 * OpenClaw Content Pipeline
 * 
 * End-to-end content workflow orchestration
 * 
 * Pipeline Stages:
 *   1. Idea/Research → Content-Strategist approval
 *   2. Draft Creation → Writer agents
 *   3. Review → Editor-Chief
 *   4. Formatting → Formatter agent
 *   5. Publishing → Publisher agent
 *   6. Repurposing → Repurposer agent
 *   7. Archiving → Archivist agent
 * 
 * Usage: node content-pipeline.mjs <command> [args...]
 * 
 * Commands:
 *   create <type> <title> [data]     Create new content item
 *   list [stage]                     List content by stage
 *   move <contentId> <stage>         Move content to stage
 *   assign <contentId> <agentId>     Assign content to agent
 *   review <contentId> <action>      Review action (approve/reject/revise)
 *   publish <contentId> [channels]   Publish content
 *   repurpose <contentId> [formats]  Repurpose content
 *   status <contentId>               Get content status
 */

import fs from 'fs/promises';
import path from 'path';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const PIPELINE_FILE = path.join(DATA_DIR, 'content-pipeline.json');

// Content types
const CONTENT_TYPES = {
  'ebook': { agents: ['WRITER-LONG', 'FORMATTER'], driveFolder: '03-Products/eBooks', repurposeFormats: ['blog-series', 'social-carousel', 'lead-magnet'] },
  'course-module': { agents: ['WRITER-LONG', 'VIDEO-SCRIPTER'], driveFolder: '03-Products/Courses', repurposeFormats: ['lesson-summary', 'quiz', 'worksheet'] },
  'blog-post': { agents: ['WRITER-LONG'], driveFolder: '02-Content-Pipeline/Published', repurposeFormats: ['social-posts', 'email', 'thread'] },
  'social-post': { agents: ['WRITER-SHORT'], driveFolder: '04-Marketing-Assets/Copy', repurposeFormats: ['story', 'reel-caption'] },
  'email': { agents: ['WRITER-SHORT', 'WRITER-SALES'], driveFolder: '04-Marketing-Assets/Copy', repurposeFormats: ['sms', 'push-notification'] },
  'landing-page': { agents: ['WRITER-SALES'], driveFolder: '05-Sales-Materials/Presentations', repurposeFormats: ['ad-copy', 'email-sequence'] },
  'video-script': { agents: ['VIDEO-SCRIPTER'], driveFolder: '04-Marketing-Assets/Videos', repurposeFormats: ['short-clips', 'social-posts', 'blog-post'] },
  'ad-copy': { agents: ['WRITER-SALES'], driveFolder: '04-Marketing-Assets/Ads', repurposeFormats: ['variants'] },
  'sales-script': { agents: ['WRITER-SALES'], driveFolder: '05-Sales-Materials/Scripts', repurposeFormats: ['email-sequence', 'objection-responses'] },
  'template': { agents: ['WRITER-LONG', 'FORMATTER'], driveFolder: '03-Products/Templates', repurposeFormats: ['checklist', 'guide'] },
  'lead-magnet': { agents: ['WRITER-LONG', 'GRAPHIC-DESIGNER'], driveFolder: '03-Products/Downloads', repurposeFormats: ['landing-page', 'social-posts'] },
  'graphic': { agents: ['GRAPHIC-DESIGNER'], driveFolder: '04-Marketing-Assets/Graphics', repurposeFormats: ['sizes', 'variants'] }
};

// Pipeline stages
const PIPELINE_STAGES = {
  'idea': { order: 1, nextStage: 'approved', agents: ['CONTENT-STRATEGIST'] },
  'approved': { order: 2, nextStage: 'drafting', agents: [] },
  'drafting': { order: 3, nextStage: 'review', agents: ['WRITER-LONG', 'WRITER-SHORT', 'WRITER-SALES', 'VIDEO-SCRIPTER'] },
  'review': { order: 4, nextStage: 'formatting', agents: ['EDITOR-CHIEF'] },
  'revisions': { order: 4.5, nextStage: 'review', agents: [] },
  'formatting': { order: 5, nextStage: 'ready', agents: ['FORMATTER', 'GRAPHIC-DESIGNER', 'VIDEO-PRODUCER'] },
  'ready': { order: 6, nextStage: 'published', agents: ['PUBLISHER'] },
  'published': { order: 7, nextStage: 'repurposing', agents: [] },
  'repurposing': { order: 8, nextStage: 'archived', agents: ['REPURPOSER'] },
  'archived': { order: 9, nextStage: null, agents: ['ARCHIVIST'] }
};

// Pipeline data
let pipelineData = {
  content: {},
  stats: {
    totalCreated: 0,
    totalPublished: 0,
    byType: {},
    byStage: {}
  }
};

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(PIPELINE_FILE, 'utf8');
    pipelineData = JSON.parse(data);
  } catch {
    pipelineData = {
      content: {},
      stats: { totalCreated: 0, totalPublished: 0, byType: {}, byStage: {} }
    };
  }
}

/**
 * Save pipeline data
 */
async function saveData() {
  await fs.writeFile(PIPELINE_FILE, JSON.stringify(pipelineData, null, 2));
}

/**
 * Generate content ID
 */
function generateId() {
  return `content-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Create content item
 */
async function createContent(type, title, data = {}) {
  const contentType = CONTENT_TYPES[type];
  if (!contentType) {
    return { success: false, error: `Unknown content type: ${type}. Valid types: ${Object.keys(CONTENT_TYPES).join(', ')}` };
  }
  
  const id = generateId();
  const content = {
    id,
    type,
    title,
    stage: 'idea',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedTo: null,
    driveFileId: null,
    drivePath: contentType.driveFolder,
    data: {
      description: data.description || '',
      keywords: data.keywords || [],
      targetAudience: data.targetAudience || '',
      outline: data.outline || '',
      draft: '',
      finalVersion: '',
      feedback: [],
      repurposedTo: [],
      publishedTo: [],
      ...data
    },
    history: [
      { stage: 'idea', timestamp: new Date().toISOString(), action: 'created', by: 'system' }
    ],
    metrics: {
      views: 0,
      engagement: 0,
      conversions: 0
    }
  };
  
  pipelineData.content[id] = content;
  pipelineData.stats.totalCreated++;
  pipelineData.stats.byType[type] = (pipelineData.stats.byType[type] || 0) + 1;
  pipelineData.stats.byStage['idea'] = (pipelineData.stats.byStage['idea'] || 0) + 1;
  
  await saveData();
  
  console.log(`Created: ${id} - "${title}" (${type})`);
  return { success: true, content };
}

/**
 * Move content to stage
 */
async function moveToStage(contentId, newStage) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  const stageConfig = PIPELINE_STAGES[newStage];
  if (!stageConfig) {
    return { success: false, error: `Invalid stage: ${newStage}. Valid stages: ${Object.keys(PIPELINE_STAGES).join(', ')}` };
  }
  
  const oldStage = content.stage;
  
  // Update stage counts
  pipelineData.stats.byStage[oldStage] = Math.max(0, (pipelineData.stats.byStage[oldStage] || 1) - 1);
  pipelineData.stats.byStage[newStage] = (pipelineData.stats.byStage[newStage] || 0) + 1;
  
  content.stage = newStage;
  content.updatedAt = new Date().toISOString();
  content.history.push({
    stage: newStage,
    timestamp: new Date().toISOString(),
    action: 'moved',
    from: oldStage,
    by: 'system'
  });
  
  // Clear assignment when moving
  content.assignedTo = null;
  
  await saveData();
  
  console.log(`Moved: ${contentId} from ${oldStage} -> ${newStage}`);
  return { success: true, content };
}

/**
 * Assign content to agent
 */
async function assignContent(contentId, agentId) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  content.assignedTo = agentId;
  content.updatedAt = new Date().toISOString();
  content.history.push({
    stage: content.stage,
    timestamp: new Date().toISOString(),
    action: 'assigned',
    to: agentId,
    by: 'system'
  });
  
  await saveData();
  
  console.log(`Assigned: ${contentId} -> ${agentId}`);
  return { success: true, content };
}

/**
 * Review content
 */
async function reviewContent(contentId, action, feedback = '') {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  if (content.stage !== 'review') {
    return { success: false, error: `Content not in review stage (current: ${content.stage})` };
  }
  
  content.data.feedback.push({
    timestamp: new Date().toISOString(),
    action,
    feedback,
    by: 'EDITOR-CHIEF'
  });
  
  content.history.push({
    stage: content.stage,
    timestamp: new Date().toISOString(),
    action: `review-${action}`,
    feedback,
    by: 'EDITOR-CHIEF'
  });
  
  let newStage = content.stage;
  
  switch (action) {
    case 'approve':
      newStage = 'formatting';
      break;
    case 'reject':
      newStage = 'archived';
      content.data.rejectionReason = feedback;
      break;
    case 'revise':
      newStage = 'revisions';
      break;
    default:
      return { success: false, error: `Invalid action: ${action}. Use: approve, reject, revise` };
  }
  
  // Update stage counts
  pipelineData.stats.byStage[content.stage] = Math.max(0, (pipelineData.stats.byStage[content.stage] || 1) - 1);
  pipelineData.stats.byStage[newStage] = (pipelineData.stats.byStage[newStage] || 0) + 1;
  
  content.stage = newStage;
  content.updatedAt = new Date().toISOString();
  content.assignedTo = null;
  
  await saveData();
  
  console.log(`Review: ${contentId} -> ${action} -> ${newStage}`);
  return { success: true, content };
}

/**
 * Publish content
 */
async function publishContent(contentId, channels = []) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  if (content.stage !== 'ready') {
    return { success: false, error: `Content not ready for publishing (current: ${content.stage})` };
  }
  
  const defaultChannels = ['drive'];
  const publishChannels = channels.length > 0 ? channels : defaultChannels;
  
  const publishResults = [];
  
  for (const channel of publishChannels) {
    const result = {
      channel,
      timestamp: new Date().toISOString(),
      success: true,
      url: null
    };
    
    // Simulate publishing (actual publishing via respective managers)
    switch (channel) {
      case 'drive':
        result.url = `https://drive.google.com/file/d/${content.driveFileId || 'pending'}`;
        break;
      case 'youtube':
        result.url = `https://youtube.com/watch?v=pending`;
        break;
      case 'instagram':
      case 'facebook':
      case 'tiktok':
        result.url = `https://${channel}.com/post/pending`;
        break;
      case 'blog':
        result.url = `/blog/${content.id}`;
        break;
      case 'email':
        result.url = `ghl:campaign:${content.id}`;
        break;
    }
    
    content.data.publishedTo.push(result);
    publishResults.push(result);
  }
  
  // Move to published stage
  pipelineData.stats.byStage[content.stage] = Math.max(0, (pipelineData.stats.byStage[content.stage] || 1) - 1);
  pipelineData.stats.byStage['published'] = (pipelineData.stats.byStage['published'] || 0) + 1;
  pipelineData.stats.totalPublished++;
  
  content.stage = 'published';
  content.updatedAt = new Date().toISOString();
  content.publishedAt = new Date().toISOString();
  content.history.push({
    stage: 'published',
    timestamp: new Date().toISOString(),
    action: 'published',
    channels: publishChannels,
    by: 'PUBLISHER'
  });
  
  await saveData();
  
  console.log(`Published: ${contentId} to ${publishChannels.join(', ')}`);
  return { success: true, content, publishResults };
}

/**
 * Repurpose content
 */
async function repurposeContent(contentId, formats = []) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  const contentType = CONTENT_TYPES[content.type];
  const repurposeFormats = formats.length > 0 ? formats : (contentType?.repurposeFormats || []);
  
  if (repurposeFormats.length === 0) {
    return { success: false, error: `No repurpose formats defined for type: ${content.type}` };
  }
  
  const createdContent = [];
  
  for (const format of repurposeFormats) {
    // Create new content item for each format
    const newContent = await createContent(
      format.includes('social') ? 'social-post' : format.includes('email') ? 'email' : 'blog-post',
      `[Repurposed] ${content.title} - ${format}`,
      {
        sourceContentId: content.id,
        sourceType: content.type,
        repurposeFormat: format,
        outline: `Repurposed from: ${content.title}`
      }
    );
    
    if (newContent.success) {
      content.data.repurposedTo.push({
        contentId: newContent.content.id,
        format,
        timestamp: new Date().toISOString()
      });
      createdContent.push(newContent.content);
    }
  }
  
  // Move to repurposing stage
  pipelineData.stats.byStage[content.stage] = Math.max(0, (pipelineData.stats.byStage[content.stage] || 1) - 1);
  pipelineData.stats.byStage['repurposing'] = (pipelineData.stats.byStage['repurposing'] || 0) + 1;
  
  content.stage = 'repurposing';
  content.updatedAt = new Date().toISOString();
  content.history.push({
    stage: 'repurposing',
    timestamp: new Date().toISOString(),
    action: 'repurposed',
    formats: repurposeFormats,
    createdIds: createdContent.map(c => c.id),
    by: 'REPURPOSER'
  });
  
  await saveData();
  
  console.log(`Repurposed: ${contentId} into ${createdContent.length} pieces`);
  return { success: true, content, createdContent };
}

/**
 * List content by stage
 */
function listContent(stage = null) {
  let contentList = Object.values(pipelineData.content);
  
  if (stage) {
    contentList = contentList.filter(c => c.stage === stage);
  }
  
  return contentList.map(c => ({
    id: c.id,
    title: c.title.substring(0, 40),
    type: c.type,
    stage: c.stage,
    assignedTo: c.assignedTo,
    createdAt: c.createdAt.split('T')[0],
    updatedAt: c.updatedAt.split('T')[0]
  }));
}

/**
 * Get content status
 */
function getContentStatus(contentId) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  return {
    success: true,
    content: {
      ...content,
      stageInfo: PIPELINE_STAGES[content.stage],
      typeInfo: CONTENT_TYPES[content.type],
      historyCount: content.history.length,
      feedbackCount: content.data.feedback.length,
      publishedCount: content.data.publishedTo.length,
      repurposedCount: content.data.repurposedTo.length
    }
  };
}

/**
 * Get pipeline stats
 */
function getStats() {
  return {
    ...pipelineData.stats,
    contentCount: Object.keys(pipelineData.content).length,
    byStage: Object.entries(PIPELINE_STAGES).map(([stage, config]) => ({
      stage,
      order: config.order,
      count: pipelineData.stats.byStage[stage] || 0
    })).sort((a, b) => a.order - b.order)
  };
}

/**
 * Get next actions for content
 */
function getNextActions(contentId) {
  const content = pipelineData.content[contentId];
  if (!content) {
    return { success: false, error: `Content not found: ${contentId}` };
  }
  
  const stageConfig = PIPELINE_STAGES[content.stage];
  const contentType = CONTENT_TYPES[content.type];
  
  const actions = [];
  
  // Stage-specific actions
  switch (content.stage) {
    case 'idea':
      actions.push({ action: 'approve', description: 'Approve idea and move to drafting' });
      actions.push({ action: 'reject', description: 'Reject idea' });
      break;
    case 'approved':
      actions.push({ action: 'assign', description: 'Assign to writer', suggestedAgents: contentType.agents });
      break;
    case 'drafting':
      actions.push({ action: 'submit', description: 'Submit draft for review' });
      break;
    case 'review':
      actions.push({ action: 'approve', description: 'Approve and move to formatting' });
      actions.push({ action: 'revise', description: 'Request revisions' });
      actions.push({ action: 'reject', description: 'Reject content' });
      break;
    case 'revisions':
      actions.push({ action: 'resubmit', description: 'Resubmit for review' });
      break;
    case 'formatting':
      actions.push({ action: 'complete', description: 'Mark formatting complete' });
      break;
    case 'ready':
      actions.push({ action: 'publish', description: 'Publish content', suggestedChannels: ['drive', 'blog'] });
      break;
    case 'published':
      actions.push({ action: 'repurpose', description: 'Repurpose content', suggestedFormats: contentType.repurposeFormats });
      break;
    case 'repurposing':
      actions.push({ action: 'archive', description: 'Move to archive' });
      break;
  }
  
  return { success: true, contentId, stage: content.stage, actions };
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'create': {
        const type = args[0];
        const title = args[1];
        const data = args[2] ? JSON.parse(args[2]) : {};
        if (!type || !title) {
          console.error('Usage: create <type> <title> [data]');
          console.error('Types:', Object.keys(CONTENT_TYPES).join(', '));
          process.exit(1);
        }
        const result = await createContent(type, title, data);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'list': {
        const stage = args[0];
        const content = listContent(stage);
        console.log(`Content${stage ? ` in ${stage}` : ''} (${content.length} items):`);
        console.log('='.repeat(80));
        for (const c of content) {
          console.log(`${c.id.substring(0, 20)}... | ${c.title.padEnd(30)} | ${c.type.padEnd(12)} | ${c.stage.padEnd(10)} | ${c.assignedTo || '-'}`);
        }
        break;
      }
      
      case 'move': {
        const contentId = args[0];
        const stage = args[1];
        if (!contentId || !stage) {
          console.error('Usage: move <contentId> <stage>');
          console.error('Stages:', Object.keys(PIPELINE_STAGES).join(', '));
          process.exit(1);
        }
        const result = await moveToStage(contentId, stage);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'assign': {
        const contentId = args[0];
        const agentId = args[1];
        if (!contentId || !agentId) {
          console.error('Usage: assign <contentId> <agentId>');
          process.exit(1);
        }
        const result = await assignContent(contentId, agentId);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'review': {
        const contentId = args[0];
        const action = args[1];
        const feedback = args.slice(2).join(' ');
        if (!contentId || !action) {
          console.error('Usage: review <contentId> <approve|reject|revise> [feedback]');
          process.exit(1);
        }
        const result = await reviewContent(contentId, action, feedback);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'publish': {
        const contentId = args[0];
        const channels = args.slice(1);
        if (!contentId) {
          console.error('Usage: publish <contentId> [channels...]');
          process.exit(1);
        }
        const result = await publishContent(contentId, channels);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'repurpose': {
        const contentId = args[0];
        const formats = args.slice(1);
        if (!contentId) {
          console.error('Usage: repurpose <contentId> [formats...]');
          process.exit(1);
        }
        const result = await repurposeContent(contentId, formats);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'status': {
        const contentId = args[0];
        if (!contentId) {
          console.error('Usage: status <contentId>');
          process.exit(1);
        }
        const result = getContentStatus(contentId);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'next': {
        const contentId = args[0];
        if (!contentId) {
          console.error('Usage: next <contentId>');
          process.exit(1);
        }
        const result = getNextActions(contentId);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'stats': {
        const stats = getStats();
        console.log('Content Pipeline Statistics');
        console.log('='.repeat(50));
        console.log(`Total Created:   ${stats.totalCreated}`);
        console.log(`Total Published: ${stats.totalPublished}`);
        console.log(`Active Content:  ${stats.contentCount}`);
        console.log('\nBy Stage:');
        for (const s of stats.byStage) {
          const bar = ''.repeat(Math.min(s.count, 20));
          console.log(`  ${s.stage.padEnd(12)} ${String(s.count).padStart(3)} ${bar}`);
        }
        console.log('\nBy Type:');
        for (const [type, count] of Object.entries(stats.byType)) {
          console.log(`  ${type.padEnd(15)} ${count}`);
        }
        break;
      }
      
      case 'types': {
        console.log('Content Types');
        console.log('='.repeat(50));
        for (const [type, config] of Object.entries(CONTENT_TYPES)) {
          console.log(`\n${type}:`);
          console.log(`  Agents:    ${config.agents.join(', ')}`);
          console.log(`  Folder:    ${config.driveFolder}`);
          console.log(`  Repurpose: ${config.repurposeFormats.join(', ')}`);
        }
        break;
      }
      
      case 'stages': {
        console.log('Pipeline Stages');
        console.log('='.repeat(50));
        for (const [stage, config] of Object.entries(PIPELINE_STAGES)) {
          console.log(`${String(config.order).padStart(3)}. ${stage.padEnd(12)} -> ${config.nextStage || 'END'}`);
          if (config.agents.length > 0) {
            console.log(`      Agents: ${config.agents.join(', ')}`);
          }
        }
        break;
      }
      
      case 'test': {
        console.log('Content Pipeline Module');
        console.log('=======================');
        console.log('\nPipeline Flow:');
        console.log('  idea -> approved -> drafting -> review -> formatting -> ready -> published -> repurposing -> archived');
        console.log('\nCommands:');
        console.log('  create <type> <title>      - Create content');
        console.log('  list [stage]               - List content');
        console.log('  move <id> <stage>          - Move to stage');
        console.log('  assign <id> <agent>        - Assign agent');
        console.log('  review <id> <action>       - Review action');
        console.log('  publish <id> [channels]    - Publish');
        console.log('  repurpose <id> [formats]   - Repurpose');
        console.log('  status <id>                - Get status');
        console.log('  stats                      - Pipeline stats');
        console.log('  types                      - Content types');
        console.log('  stages                     - Pipeline stages');
        break;
      }
      
      default:
        console.log('Content Pipeline - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  createContent,
  moveToStage,
  assignContent,
  reviewContent,
  publishContent,
  repurposeContent,
  listContent,
  getContentStatus,
  getNextActions,
  getStats,
  CONTENT_TYPES,
  PIPELINE_STAGES
};

// Run CLI
main().catch(console.error);
