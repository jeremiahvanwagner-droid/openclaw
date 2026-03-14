#!/usr/bin/env node
/**
 * OpenClaw YouTube Manager
 * 
 * YouTube Data API for video upload, scheduling, and analytics
 * 
 * Features:
 *   - Video upload and scheduling
 *   - Title, description, tags optimization
 *   - Thumbnail management
 *   - Playlist management
 *   - Analytics retrieval
 *   - Comment moderation
 * 
 * Usage: node youtube-manager.mjs <command> [args...]
 * 
 * Commands:
 *   upload <videoPath> <title> [desc]   Upload video
 *   schedule <videoPath> <title> <time> Schedule video
 *   optimize <title>                    Optimize title/description
 *   playlists                           List playlists
 *   playlist-add <playlistId> <videoId> Add video to playlist
 *   analytics [days]                    Get channel analytics
 *   comments <videoId>                  Get video comments
 *   reply <commentId> <reply>           Reply to comment
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const YOUTUBE_FILE = path.join(DATA_DIR, 'youtube-data.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'google-credentials.json');
const TOKEN_FILE = path.join(DATA_DIR, 'google-token.json');

// API Configuration
const API_CONFIG = {
  channelId: process.env.YOUTUBE_CHANNEL_ID || '',
  apiKey: process.env.YOUTUBE_API_KEY || '',
  uploadEndpoint: 'https://www.googleapis.com/upload/youtube/v3/videos',
  dataEndpoint: 'https://www.googleapis.com/youtube/v3'
};

// Video categories
const CATEGORIES = {
  'Education': 27,
  'Howto & Style': 26,
  'Science & Technology': 28,
  'Entertainment': 24,
  'People & Blogs': 22,
  'News & Politics': 25,
  'Gaming': 20,
  'Music': 10
};

// Video templates
const VIDEO_TEMPLATES = {
  'tutorial': {
    descriptionPrefix: 'In this tutorial, you\'ll learn ',
    descriptionSuffix: '\n\n📚 RESOURCES:\n• Link 1\n• Link 2\n\n⏰ TIMESTAMPS:\n0:00 Introduction\n\n💬 CONNECT WITH ME:\n• Website: \n• Instagram: \n\n#tutorial #howto #learning',
    tags: ['tutorial', 'how to', 'guide', 'learn', 'education'],
    category: 27
  },
  'vlog': {
    descriptionPrefix: 'Join me as I ',
    descriptionSuffix: '\n\n👇 LET ME KNOW IN THE COMMENTS:\nWhat did you think?\n\n📱 FOLLOW ME:\n• Instagram: \n• TikTok: \n\n#vlog #lifestyle #dayinmylife',
    tags: ['vlog', 'day in my life', 'lifestyle'],
    category: 22
  },
  'course': {
    descriptionPrefix: '📘 Module Overview: ',
    descriptionSuffix: '\n\n🎓 FULL COURSE:\nGet the complete course at: [LINK]\n\n📋 WHAT YOU\'LL LEARN:\n• Point 1\n• Point 2\n• Point 3\n\n⚡ QUICK LINKS:\n• Resources: \n• Worksheet: \n\n#course #onlinelearning #education',
    tags: ['course', 'online course', 'education', 'learning', 'training'],
    category: 27
  },
  'product': {
    descriptionPrefix: 'Discover ',
    descriptionSuffix: '\n\n🛒 GET IT HERE:\n[PRODUCT LINK]\n\n✨ FEATURES:\n• Feature 1\n• Feature 2\n• Feature 3\n\n💰 SPECIAL OFFER:\nUse code [CODE] for discount!\n\n#product #review #unboxing',
    tags: ['product', 'review', 'unboxing'],
    category: 28
  }
};

// SEO Keywords database
const SEO_KEYWORDS = {
  'business': ['entrepreneur', 'startup', 'business tips', 'entrepreneurship', 'small business', 'success', 'money'],
  'marketing': ['digital marketing', 'social media marketing', 'marketing strategy', 'content marketing', 'growth hacking'],
  'education': ['online learning', 'course', 'tutorial', 'how to', 'learn', 'training', 'education'],
  'motivation': ['motivation', 'inspiration', 'success', 'mindset', 'goals', 'self improvement'],
  'tech': ['technology', 'software', 'ai', 'automation', 'coding', 'programming']
};

// Data storage
let youtubeData = { videos: [], playlists: [], analytics: {} };

/**
 * Initialize data
 */
async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  try {
    const data = await fs.readFile(YOUTUBE_FILE, 'utf8');
    youtubeData = JSON.parse(data);
  } catch {
    youtubeData = { videos: [], playlists: [], analytics: {} };
  }
}

/**
 * Save data
 */
async function saveData() {
  await fs.writeFile(YOUTUBE_FILE, JSON.stringify(youtubeData, null, 2));
}

/**
 * Load OAuth token
 */
async function loadToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Make YouTube API request
 */
async function ytRequest(endpoint, method = 'GET', body = null, isUpload = false) {
  const token = await loadToken();
  if (!token) {
    throw new Error('Not authenticated. Run YouTube auth first.');
  }
  
  const baseUrl = isUpload ? API_CONFIG.uploadEndpoint : API_CONFIG.dataEndpoint;
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`YouTube API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(120000, () => {
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
 * Upload video
 */
async function uploadVideo(videoPath, title, description, options = {}) {
  const token = await loadToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Read video file
  let videoContent;
  try {
    videoContent = await fs.readFile(videoPath);
  } catch (error) {
    return { success: false, error: `Cannot read video file: ${error.message}` };
  }
  
  const metadata = {
    snippet: {
      title: title.substring(0, 100),
      description: description.substring(0, 5000),
      tags: options.tags || [],
      categoryId: String(options.category || 27)
    },
    status: {
      privacyStatus: options.privacy || 'private',
      selfDeclaredMadeForKids: options.madeForKids || false
    }
  };
  
  if (options.scheduledTime) {
    metadata.status.publishAt = new Date(options.scheduledTime).toISOString();
    metadata.status.privacyStatus = 'private';
  }
  
  // Create multipart upload
  const boundary = 'openclaw_boundary_' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const metadataPart = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata);
  
  const mediaPart = 
    delimiter +
    'Content-Type: video/*\r\n\r\n';
  
  const bodyBuffer = Buffer.concat([
    Buffer.from(metadataPart),
    Buffer.from(mediaPart),
    videoContent,
    Buffer.from(closeDelimiter)
  ]);
  
  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.googleapis.com',
        port: 443,
        path: '/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length
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
      req.setTimeout(300000); // 5 minute timeout for uploads
      req.write(bodyBuffer);
      req.end();
    });
    
    if (result.id) {
      const videoRecord = {
        id: result.id,
        title,
        description: description.substring(0, 200),
        uploadedAt: new Date().toISOString(),
        status: result.status?.privacyStatus || 'private',
        scheduledFor: options.scheduledTime || null,
        url: `https://youtube.com/watch?v=${result.id}`
      };
      
      youtubeData.videos.push(videoRecord);
      await saveData();
      
      console.log(`Uploaded: ${result.id}`);
      return { success: true, video: result, url: videoRecord.url };
    } else {
      return { success: false, error: 'Upload failed', response: result };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Schedule video upload
 */
async function scheduleVideo(videoPath, title, description, scheduledTime, options = {}) {
  const scheduleDate = new Date(scheduledTime);
  if (isNaN(scheduleDate.getTime())) {
    return { success: false, error: `Invalid date: ${scheduledTime}` };
  }
  
  if (scheduleDate <= new Date()) {
    return { success: false, error: 'Scheduled time must be in the future' };
  }
  
  return uploadVideo(videoPath, title, description, {
    ...options,
    scheduledTime: scheduleDate.toISOString(),
    privacy: 'private'
  });
}

/**
 * Update video
 */
async function updateVideo(videoId, updates) {
  const body = {
    id: videoId,
    snippet: {}
  };
  
  if (updates.title) body.snippet.title = updates.title;
  if (updates.description) body.snippet.description = updates.description;
  if (updates.tags) body.snippet.tags = updates.tags;
  if (updates.category) body.snippet.categoryId = String(updates.category);
  
  const result = await ytRequest(`/videos?part=snippet`, 'PUT', body);
  return { success: !!result.id, video: result };
}

/**
 * Optimize title and description
 */
function optimizeContent(title, topic = 'education', template = 'tutorial') {
  const templateConfig = VIDEO_TEMPLATES[template] || VIDEO_TEMPLATES.tutorial;
  const keywords = SEO_KEYWORDS[topic] || SEO_KEYWORDS.education;
  
  // Optimize title
  const optimizedTitle = title.length > 60 
    ? title.substring(0, 57) + '...'
    : title;
  
  // Generate optimized description
  const description = [
    templateConfig.descriptionPrefix + title.toLowerCase(),
    '',
    '🔔 Subscribe for more content like this!',
    '',
    templateConfig.descriptionSuffix
  ].join('\n');
  
  // Generate tags
  const tags = [
    ...templateConfig.tags,
    ...keywords,
    ...title.toLowerCase().split(' ').filter(w => w.length > 3)
  ].slice(0, 30);
  
  return {
    title: optimizedTitle,
    description,
    tags: [...new Set(tags)],
    category: templateConfig.category,
    tips: [
      'Add specific timestamps in description',
      'Include a call-to-action',
      'Add relevant links',
      'Use 3-5 hashtags max',
      'First 150 chars are most important for SEO'
    ]
  };
}

/**
 * Get playlists
 */
async function getPlaylists() {
  const result = await ytRequest(
    `/playlists?part=snippet,contentDetails&mine=true&maxResults=50`
  );
  
  youtubeData.playlists = result.items?.map(p => ({
    id: p.id,
    title: p.snippet.title,
    description: p.snippet.description,
    itemCount: p.contentDetails.itemCount,
    url: `https://youtube.com/playlist?list=${p.id}`
  })) || [];
  
  await saveData();
  return youtubeData.playlists;
}

/**
 * Add video to playlist
 */
async function addToPlaylist(playlistId, videoId) {
  const result = await ytRequest('/playlistItems?part=snippet', 'POST', {
    snippet: {
      playlistId,
      resourceId: {
        kind: 'youtube#video',
        videoId
      }
    }
  });
  
  return { success: !!result.id, playlistItem: result };
}

/**
 * Create playlist
 */
async function createPlaylist(title, description, privacy = 'private') {
  const result = await ytRequest('/playlists?part=snippet,status', 'POST', {
    snippet: {
      title,
      description
    },
    status: {
      privacyStatus: privacy
    }
  });
  
  return { success: !!result.id, playlist: result };
}

/**
 * Get video comments
 */
async function getComments(videoId, maxResults = 20) {
  const result = await ytRequest(
    `/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=time`
  );
  
  return result.items?.map(c => ({
    id: c.id,
    author: c.snippet.topLevelComment.snippet.authorDisplayName,
    text: c.snippet.topLevelComment.snippet.textDisplay,
    likes: c.snippet.topLevelComment.snippet.likeCount,
    publishedAt: c.snippet.topLevelComment.snippet.publishedAt,
    canReply: c.snippet.canReply
  })) || [];
}

/**
 * Reply to comment
 */
async function replyToComment(parentId, text) {
  const result = await ytRequest('/comments?part=snippet', 'POST', {
    snippet: {
      parentId,
      textOriginal: text
    }
  });
  
  return { success: !!result.id, comment: result };
}

/**
 * Get channel analytics
 */
async function getAnalytics(days = 28) {
  // Note: Requires YouTube Analytics API scope
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    const result = await ytRequest(
      `/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,estimatedMinutesWatched,subscribersGained,likes,comments`
    );
    
    return {
      period: `${startDate} to ${endDate}`,
      metrics: result.rows?.[0] || [],
      headers: result.columnHeaders?.map(h => h.name) || []
    };
  } catch (error) {
    // Fallback to basic channel stats
    const channelResult = await ytRequest(
      `/channels?part=statistics&mine=true`
    );
    
    const stats = channelResult.items?.[0]?.statistics || {};
    return {
      period: `${startDate} to ${endDate}`,
      totalViews: stats.viewCount,
      totalSubscribers: stats.subscriberCount,
      totalVideos: stats.videoCount,
      note: 'Full analytics requires YouTube Analytics API'
    };
  }
}

/**
 * Get video list
 */
async function getVideos(maxResults = 20) {
  const result = await ytRequest(
    `/search?part=snippet&forMine=true&type=video&maxResults=${maxResults}&order=date`
  );
  
  return result.items?.map(v => ({
    id: v.id.videoId,
    title: v.snippet.title,
    description: v.snippet.description.substring(0, 100),
    publishedAt: v.snippet.publishedAt,
    thumbnail: v.snippet.thumbnails?.default?.url,
    url: `https://youtube.com/watch?v=${v.id.videoId}`
  })) || [];
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initData();
  
  try {
    switch (command) {
      case 'upload': {
        const videoPath = args[0];
        const title = args[1];
        const description = args.slice(2).join(' ') || '';
        
        if (!videoPath || !title) {
          console.error('Usage: upload <videoPath> <title> [description]');
          process.exit(1);
        }
        
        const result = await uploadVideo(videoPath, title, description);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'schedule': {
        const videoPath = args[0];
        const title = args[1];
        const time = args[2];
        const description = args.slice(3).join(' ') || '';
        
        if (!videoPath || !title || !time) {
          console.error('Usage: schedule <videoPath> <title> <scheduledTime> [description]');
          process.exit(1);
        }
        
        const result = await scheduleVideo(videoPath, title, description, time);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'optimize': {
        const title = args.join(' ');
        const topic = 'education'; // Could be another arg
        
        if (!title) {
          console.error('Usage: optimize <title>');
          process.exit(1);
        }
        
        const result = optimizeContent(title, topic);
        console.log('Optimized Content');
        console.log('='.repeat(50));
        console.log('Title:', result.title);
        console.log('\nDescription:');
        console.log(result.description);
        console.log('\nTags:', result.tags.join(', '));
        console.log('\nTips:');
        result.tips.forEach(t => console.log('  •', t));
        break;
      }
      
      case 'playlists': {
        const playlists = await getPlaylists();
        console.log('Your Playlists');
        console.log('='.repeat(50));
        for (const p of playlists) {
          console.log(`${p.title} (${p.itemCount} videos)`);
          console.log(`  ID: ${p.id}`);
          console.log(`  ${p.url}\n`);
        }
        break;
      }
      
      case 'playlist-add': {
        const playlistId = args[0];
        const videoId = args[1];
        
        if (!playlistId || !videoId) {
          console.error('Usage: playlist-add <playlistId> <videoId>');
          process.exit(1);
        }
        
        const result = await addToPlaylist(playlistId, videoId);
        console.log(result.success ? 'Added to playlist' : 'Failed');
        break;
      }
      
      case 'playlist-create': {
        const title = args[0];
        const description = args.slice(1).join(' ') || '';
        
        if (!title) {
          console.error('Usage: playlist-create <title> [description]');
          process.exit(1);
        }
        
        const result = await createPlaylist(title, description);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'videos': {
        const limit = parseInt(args[0]) || 20;
        const videos = await getVideos(limit);
        console.log(`Recent Videos (${videos.length})`);
        console.log('='.repeat(60));
        for (const v of videos) {
          console.log(`${v.title.substring(0, 50)}`);
          console.log(`  Published: ${v.publishedAt.split('T')[0]}`);
          console.log(`  ${v.url}\n`);
        }
        break;
      }
      
      case 'comments': {
        const videoId = args[0];
        
        if (!videoId) {
          console.error('Usage: comments <videoId>');
          process.exit(1);
        }
        
        const comments = await getComments(videoId);
        console.log(`Comments (${comments.length})`);
        console.log('='.repeat(50));
        for (const c of comments) {
          console.log(`${c.author} (${c.likes} likes)`);
          console.log(`  ${c.text.substring(0, 100)}`);
          console.log(`  ID: ${c.id}\n`);
        }
        break;
      }
      
      case 'reply': {
        const commentId = args[0];
        const reply = args.slice(1).join(' ');
        
        if (!commentId || !reply) {
          console.error('Usage: reply <commentId> <reply text>');
          process.exit(1);
        }
        
        const result = await replyToComment(commentId, reply);
        console.log(result.success ? 'Reply posted' : 'Failed');
        break;
      }
      
      case 'analytics': {
        const days = parseInt(args[0]) || 28;
        const analytics = await getAnalytics(days);
        console.log('Channel Analytics');
        console.log('='.repeat(50));
        console.log(`Period: ${analytics.period}`);
        for (const [key, value] of Object.entries(analytics)) {
          if (key !== 'period') {
            console.log(`${key}: ${value}`);
          }
        }
        break;
      }
      
      case 'templates': {
        console.log('Video Templates');
        console.log('='.repeat(50));
        for (const [name, config] of Object.entries(VIDEO_TEMPLATES)) {
          console.log(`\n${name.toUpperCase()}:`);
          console.log(`  Category: ${Object.keys(CATEGORIES).find(k => CATEGORIES[k] === config.category)}`);
          console.log(`  Tags: ${config.tags.slice(0, 5).join(', ')}`);
        }
        break;
      }
      
      case 'categories': {
        console.log('Video Categories');
        console.log('='.repeat(30));
        for (const [name, id] of Object.entries(CATEGORIES)) {
          console.log(`  ${id}: ${name}`);
        }
        break;
      }
      
      case 'test': {
        console.log('YouTube Manager Module');
        console.log('======================');
        console.log('\nCommands:');
        console.log('  upload <path> <title>       - Upload video');
        console.log('  schedule <path> <title> <t> - Schedule upload');
        console.log('  optimize <title>            - Optimize content');
        console.log('  videos [limit]              - List videos');
        console.log('  playlists                   - List playlists');
        console.log('  playlist-add <pl> <vid>     - Add to playlist');
        console.log('  playlist-create <title>     - Create playlist');
        console.log('  comments <videoId>          - Get comments');
        console.log('  reply <commentId> <text>    - Reply to comment');
        console.log('  analytics [days]            - Channel analytics');
        console.log('  templates                   - Video templates');
        console.log('  categories                  - Video categories');
        break;
      }
      
      default:
        console.log('YouTube Manager - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  uploadVideo,
  scheduleVideo,
  updateVideo,
  optimizeContent,
  getPlaylists,
  addToPlaylist,
  createPlaylist,
  getComments,
  replyToComment,
  getAnalytics,
  getVideos,
  VIDEO_TEMPLATES,
  CATEGORIES
};

// Run CLI
main().catch(console.error);
