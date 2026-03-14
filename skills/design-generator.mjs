#!/usr/bin/env node
/**
 * OpenClaw Design Generator
 * 
 * Branded visual content generation via Canva API
 * 
 * Features:
 *   - YouTube thumbnail generation
 *   - Social media post graphics
 *   - Banner/cover image creation
 *   - Book cover design
 *   - Brand kit enforcement (Truth J Blue)
 *   - Template-based design
 *   - Auto-queue to social pipeline
 *   - Telegram preview notifications
 * 
 * Usage: node design-generator.mjs <command> [args...]
 * 
 * Commands:
 *   thumbnail <topic> [style]           Generate YouTube thumbnail
 *   social <topic> <platform>           Generate social post image
 *   banner <topic> <width> <height>     Generate banner
 *   book-cover <title> <subtitle>       Generate book cover
 *   templates                           List brand templates
 *   brand-kit                           Show brand kit details
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { getCanvaAccessToken, canvaRequest as canvaApiRequest, authorizeCanva } from './canva-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const ASSETS_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'assets');
const DESIGNS_DIR = path.join(ASSETS_DIR, 'designs');
const BRAND_DIR = path.join(ASSETS_DIR, 'brand');

// Canva API Configuration (OAuth 2.0 with PKCE)
const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID || '';
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET || '';

// Telegram notification config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '';

// Truth J Blue Brand Kit
const BRAND_KIT = {
  name: 'Truth J Blue',
  colors: {
    imperialBlue: '#081F3A',    // Primary backgrounds
    solarGold: '#C9A24D',       // Accents, CTAs
    sacredWhite: '#F5F7FA',     // Text on dark
    stoneGray: '#8A8F98',       // Secondary text
    veilBlack: '#0A0D14'        // Dark mode base
  },
  fonts: {
    title: 'Playfair Display',
    heading: 'Open Sans',
    body: 'Libre Baskerville'
  },
  logo: path.join(BRAND_DIR, 'logo.png'),
  logoLight: path.join(BRAND_DIR, 'logo-light.png'),
  logoDark: path.join(BRAND_DIR, 'logo-dark.png')
};

// Design templates and sizes
const DESIGN_SPECS = {
  thumbnail: {
    width: 1280,
    height: 720,
    format: 'png',
    directory: 'thumbnails'
  },
  social: {
    instagram: { width: 1080, height: 1080, format: 'png' },
    instagramStory: { width: 1080, height: 1920, format: 'png' },
    facebook: { width: 1200, height: 630, format: 'png' },
    twitter: { width: 1200, height: 675, format: 'png' },
    linkedin: { width: 1200, height: 627, format: 'png' },
    tiktok: { width: 1080, height: 1920, format: 'png' },
    directory: 'social'
  },
  banner: {
    youtube: { width: 2560, height: 1440 },
    facebook: { width: 820, height: 312 },
    linkedin: { width: 1584, height: 396 },
    twitter: { width: 1500, height: 500 },
    directory: 'banners'
  },
  bookCover: {
    kindle6x9: { width: 1600, height: 2560 },
    kindle5x8: { width: 1400, height: 2240 },
    paperback6x9: { width: 1875, height: 2850, bleed: 38 },
    directory: 'book-covers'
  }
};

// Style presets
const STYLE_PRESETS = {
  'spiritual-elegant': {
    background: BRAND_KIT.colors.imperialBlue,
    accent: BRAND_KIT.colors.solarGold,
    text: BRAND_KIT.colors.sacredWhite,
    overlay: 'gradient-radial',
    mood: 'mystical, divine, transformative'
  },
  'tech-futuristic': {
    background: BRAND_KIT.colors.veilBlack,
    accent: BRAND_KIT.colors.solarGold,
    text: BRAND_KIT.colors.sacredWhite,
    overlay: 'grid-pattern',
    mood: 'innovative, cutting-edge, AI-powered'
  },
  'clean-professional': {
    background: BRAND_KIT.colors.sacredWhite,
    accent: BRAND_KIT.colors.imperialBlue,
    text: BRAND_KIT.colors.imperialBlue,
    overlay: 'minimal',
    mood: 'trustworthy, clear, business-focused'
  },
  'bold-impact': {
    background: BRAND_KIT.colors.solarGold,
    accent: BRAND_KIT.colors.imperialBlue,
    text: BRAND_KIT.colors.veilBlack,
    overlay: 'diagonal-stripes',
    mood: 'attention-grabbing, energetic, motivational'
  }
};

/**
 * Initialize directories
 */
async function initDirs() {
  const dirs = [
    DATA_DIR,
    ASSETS_DIR,
    DESIGNS_DIR,
    BRAND_DIR,
    path.join(DESIGNS_DIR, 'thumbnails'),
    path.join(DESIGNS_DIR, 'social'),
    path.join(DESIGNS_DIR, 'banners'),
    path.join(DESIGNS_DIR, 'book-covers')
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Generate slug from text
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Create design from template
 */
async function createFromTemplate(templateId, variables) {
  try {
    // Create design from template
    const design = await canvaApiRequest('/designs', 'POST', {
      template_id: templateId,
      brand_kit_id: process.env.CANVA_BRAND_KIT_ID,
      title: variables.title || 'OpenClaw Generated Design'
    });
    
    // Fill in template variables
    // Note: Canva Connect API autofill endpoint
    if (variables.fills) {
      await canvaApiRequest(`/designs/${design.design.id}/autofill`, 'POST', {
        data: variables.fills
      });
    }
    
    return { success: true, designId: design.design.id, editUrl: design.design.edit_url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export design to file
 */
async function exportDesign(designId, format = 'png', outputPath) {
  try {
    // Request export
    const exportJob = await canvaApiRequest('/exports', 'POST', {
      design_id: designId,
      format: { type: format }
    });
    
    // Poll for completion
    let exportResult;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      exportResult = await canvaApiRequest(`/exports/${exportJob.job.id}`);
      
      if (exportResult.job.status === 'success') {
        break;
      } else if (exportResult.job.status === 'failed') {
        throw new Error('Export failed');
      }
      attempts++;
    }
    
    // Download file
    const downloadUrl = exportResult.job.result.url;
    await downloadFile(downloadUrl, outputPath);
    
    return { success: true, path: outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Download file from URL
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

/**
 * Generate using local fallback (Sharp + text overlay)
 * Used when Canva API is unavailable
 */
async function generateLocalFallback(config) {
  try {
    const sharp = (await import('sharp')).default;
    
    // Create base image with brand color
    const style = STYLE_PRESETS[config.style] || STYLE_PRESETS['spiritual-elegant'];
    const bgColor = style.background;
    
    // Parse hex color to RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 8, g: 31, b: 58 };
    };
    
    const rgb = hexToRgb(bgColor);
    
    // Create base image
    const image = sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: 4,
        background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1 }
      }
    });
    
    // Add text overlay using SVG
    const textColor = style.text;
    const accentColor = style.accent;
    
    const svgText = `
      <svg width="${config.width}" height="${config.height}">
        <style>
          .title { 
            font-family: 'Playfair Display', serif; 
            font-size: ${Math.floor(config.height / 8)}px; 
            fill: ${textColor};
            font-weight: bold;
          }
          .subtitle { 
            font-family: 'Open Sans', sans-serif; 
            font-size: ${Math.floor(config.height / 16)}px; 
            fill: ${accentColor};
          }
        </style>
        <text x="50%" y="40%" text-anchor="middle" class="title">
          ${config.title || config.topic}
        </text>
        ${config.subtitle ? `
        <text x="50%" y="55%" text-anchor="middle" class="subtitle">
          ${config.subtitle}
        </text>
        ` : ''}
      </svg>
    `;
    
    const result = await image
      .composite([{
        input: Buffer.from(svgText),
        top: 0,
        left: 0
      }])
      .png()
      .toFile(config.outputPath);
    
    return { success: true, path: config.outputPath, method: 'local-fallback' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate YouTube thumbnail
 */
async function generateThumbnail(topic, style = 'spiritual-elegant', textOverlay = null) {
  const spec = DESIGN_SPECS.thumbnail;
  const timestamp = Date.now();
  const slug = slugify(topic);
  const filename = `${timestamp}-${slug}.${spec.format}`;
  const outputPath = path.join(DESIGNS_DIR, spec.directory, filename);
  
  const config = {
    width: spec.width,
    height: spec.height,
    topic,
    title: textOverlay || topic.toUpperCase(),
    style,
    outputPath
  };
  
  let result;
  
  // Try Canva API first
  if (CANVA_CLIENT_ID && CANVA_CLIENT_SECRET) {
    try {
      const templateId = process.env.CANVA_THUMBNAIL_TEMPLATE_ID;
      if (templateId) {
        const design = await createFromTemplate(templateId, {
          title: topic,
          fills: { title: textOverlay || topic }
        });
        
        if (design.success) {
          result = await exportDesign(design.designId, 'png', outputPath);
        }
      }
    } catch (error) {
      console.log('Canva API unavailable, using local fallback');
    }
  }
  
  // Fall back to local generation
  if (!result || !result.success) {
    result = await generateLocalFallback(config);
  }
  
  if (result.success) {
    // Send preview to Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendPreviewToTelegram(outputPath, `ðŸŽ¬ Thumbnail: ${topic}`);
    }
  }
  
  return result;
}

/**
 * Generate social post image
 */
async function generateSocialPost(topic, platform, style = 'spiritual-elegant') {
  const platformKey = platform.toLowerCase();
  const platformSpec = DESIGN_SPECS.social[platformKey] || DESIGN_SPECS.social.instagram;
  
  const timestamp = Date.now();
  const slug = slugify(topic);
  const filename = `${timestamp}-${platformKey}-${slug}.${platformSpec.format || 'png'}`;
  const outputPath = path.join(DESIGNS_DIR, DESIGN_SPECS.social.directory, filename);
  
  const config = {
    width: platformSpec.width,
    height: platformSpec.height,
    topic,
    title: topic,
    style,
    outputPath
  };
  
  let result;
  
  // Try Canva API first
  if (CANVA_CLIENT_ID && CANVA_CLIENT_SECRET) {
    try {
      const templateId = process.env[`CANVA_${platformKey.toUpperCase()}_TEMPLATE_ID`];
      if (templateId) {
        const design = await createFromTemplate(templateId, {
          title: topic,
          fills: { headline: topic }
        });
        
        if (design.success) {
          result = await exportDesign(design.designId, 'png', outputPath);
        }
      }
    } catch (error) {
      console.log('Canva API unavailable, using local fallback');
    }
  }
  
  // Fall back to local generation
  if (!result || !result.success) {
    result = await generateLocalFallback(config);
  }
  
  if (result.success) {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendPreviewToTelegram(outputPath, `ðŸ“± Social (${platform}): ${topic}`);
    }
  }
  
  return result;
}

/**
 * Generate banner
 */
async function generateBanner(topic, width, height, style = 'clean-professional') {
  const timestamp = Date.now();
  const slug = slugify(topic);
  const filename = `${timestamp}-banner-${width}x${height}-${slug}.png`;
  const outputPath = path.join(DESIGNS_DIR, DESIGN_SPECS.banner.directory, filename);
  
  const config = {
    width: parseInt(width),
    height: parseInt(height),
    topic,
    title: topic,
    style,
    outputPath
  };
  
  let result;
  
  // Try Canva API first
  if (CANVA_CLIENT_ID && CANVA_CLIENT_SECRET) {
    try {
      const templateId = process.env.CANVA_BANNER_TEMPLATE_ID;
      if (templateId) {
        const design = await createFromTemplate(templateId, {
          title: topic,
          fills: { headline: topic }
        });
        
        if (design.success) {
          result = await exportDesign(design.designId, 'png', outputPath);
        }
      }
    } catch (error) {
      console.log('Canva API unavailable, using local fallback');
    }
  }
  
  if (!result || !result.success) {
    result = await generateLocalFallback(config);
  }
  
  if (result.success) {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendPreviewToTelegram(outputPath, `ðŸŽ¨ Banner: ${topic}`);
    }
  }
  
  return result;
}

/**
 * Generate book cover
 */
async function generateBookCover(title, subtitle, author, format = 'kindle6x9', style = 'spiritual-elegant') {
  const spec = DESIGN_SPECS.bookCover[format] || DESIGN_SPECS.bookCover.kindle6x9;
  
  const timestamp = Date.now();
  const slug = slugify(title);
  const filename = `${timestamp}-bookcover-${format}-${slug}.png`;
  const outputPath = path.join(DESIGNS_DIR, DESIGN_SPECS.bookCover.directory, filename);
  
  const config = {
    width: spec.width,
    height: spec.height,
    topic: title,
    title: title.toUpperCase(),
    subtitle: subtitle,
    author: author || 'Jeremiah Van Wagner',
    style,
    outputPath
  };
  
  let result;
  
  // Try Canva API first
  if (CANVA_CLIENT_ID && CANVA_CLIENT_SECRET) {
    try {
      const templateId = process.env.CANVA_BOOKCOVER_TEMPLATE_ID;
      if (templateId) {
        const design = await createFromTemplate(templateId, {
          title: title,
          fills: { 
            title: title,
            subtitle: subtitle,
            author: author || 'Jeremiah Van Wagner'
          }
        });
        
        if (design.success) {
          result = await exportDesign(design.designId, 'png', outputPath);
        }
      }
    } catch (error) {
      console.log('Canva API unavailable, using local fallback');
    }
  }
  
  // Enhanced local fallback for book covers
  if (!result || !result.success) {
    result = await generateBookCoverLocal(config);
  }
  
  if (result.success) {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendPreviewToTelegram(outputPath, `ðŸ“š Book Cover: ${title}`);
    }
  }
  
  return result;
}

/**
 * Generate book cover locally with enhanced styling
 */
async function generateBookCoverLocal(config) {
  try {
    const sharp = (await import('sharp')).default;
    const style = STYLE_PRESETS[config.style] || STYLE_PRESETS['spiritual-elegant'];
    
    // Parse hex color
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 8, g: 31, b: 58 };
    };
    
    const bgRgb = hexToRgb(style.background);
    
    // Create gradient background SVG
    const gradientSvg = `
      <svg width="${config.width}" height="${config.height}">
        <defs>
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${style.background};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${BRAND_KIT.colors.veilBlack};stop-opacity:1" />
          </linearGradient>
          <linearGradient id="accent-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:transparent" />
            <stop offset="50%" style="stop-color:${style.accent}" />
            <stop offset="100%" style="stop-color:transparent" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
        
        <!-- Decorative accent line -->
        <rect x="10%" y="${config.height * 0.35}" width="80%" height="3" fill="url(#accent-line)"/>
        <rect x="10%" y="${config.height * 0.65}" width="80%" height="3" fill="url(#accent-line)"/>
        
        <style>
          .book-title { 
            font-family: 'Playfair Display', 'Times New Roman', serif; 
            font-size: ${Math.floor(config.height / 12)}px; 
            fill: ${style.text};
            font-weight: bold;
            letter-spacing: 2px;
          }
          .book-subtitle { 
            font-family: 'Open Sans', Arial, sans-serif; 
            font-size: ${Math.floor(config.height / 28)}px; 
            fill: ${style.accent};
            font-style: italic;
          }
          .book-author { 
            font-family: 'Libre Baskerville', 'Georgia', serif; 
            font-size: ${Math.floor(config.height / 24)}px; 
            fill: ${style.text};
            letter-spacing: 3px;
          }
        </style>
        
        <text x="50%" y="45%" text-anchor="middle" class="book-title">
          ${config.title}
        </text>
        
        ${config.subtitle ? `
        <text x="50%" y="55%" text-anchor="middle" class="book-subtitle">
          ${config.subtitle}
        </text>
        ` : ''}
        
        <text x="50%" y="80%" text-anchor="middle" class="book-author">
          ${config.author}
        </text>
      </svg>
    `;
    
    await sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: 4,
        background: { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, alpha: 1 }
      }
    })
    .composite([{
      input: Buffer.from(gradientSvg),
      top: 0,
      left: 0
    }])
    .png()
    .toFile(config.outputPath);
    
    return { success: true, path: config.outputPath, method: 'local-enhanced' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send preview to Telegram
 */
async function sendPreviewToTelegram(imagePath, caption) {
  try {
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    const imageBuffer = await fs.readFile(imagePath);
    form.append('photo', imageBuffer, { filename: path.basename(imagePath) });
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('caption', `${caption}\nðŸ• ${new Date().toLocaleString()}`);
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: 'POST', body: form }
    );
    
    if (!response.ok) {
      console.error('Telegram send failed');
    } else {
      console.log('Preview sent to Telegram');
    }
  } catch (error) {
    console.error('Telegram error:', error.message);
  }
}

/**
 * Auto-queue to social pipeline
 */
async function queueToSocial(imagePath, platforms, caption) {
  try {
    const socialPublisher = await import('./social-media-publisher.mjs');
    
    for (const platform of platforms) {
      await socialPublisher.addToQueue(platform, caption, imagePath);
    }
    
    return { success: true, queued: platforms.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List available templates
 */
async function listTemplates() {
  if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
    return {
      available: false,
      message: 'Canva API not configured. Using local generation.',
      localStyles: Object.keys(STYLE_PRESETS)
    };
  }
  
  try {
    const templates = await canvaApiRequest('/brand-templates');
    return { available: true, templates: templates.data };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * Show brand kit
 */
function showBrandKit() {
  return BRAND_KIT;
}

// CLI interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  await initDirs();
  
  switch (command) {
    case 'thumbnail':
      if (!args[0]) {
        console.error('Usage: design-generator.mjs thumbnail <topic> [style] [textOverlay]');
        process.exit(1);
      }
      const thumbResult = await generateThumbnail(args[0], args[1], args[2]);
      console.log(JSON.stringify(thumbResult, null, 2));
      break;
      
    case 'social':
      if (!args[0] || !args[1]) {
        console.error('Usage: design-generator.mjs social <topic> <platform> [style]');
        process.exit(1);
      }
      const socialResult = await generateSocialPost(args[0], args[1], args[2]);
      console.log(JSON.stringify(socialResult, null, 2));
      break;
      
    case 'banner':
      if (!args[0] || !args[1] || !args[2]) {
        console.error('Usage: design-generator.mjs banner <topic> <width> <height> [style]');
        process.exit(1);
      }
      const bannerResult = await generateBanner(args[0], args[1], args[2], args[3]);
      console.log(JSON.stringify(bannerResult, null, 2));
      break;
      
    case 'book-cover':
      if (!args[0]) {
        console.error('Usage: design-generator.mjs book-cover <title> [subtitle] [author] [format] [style]');
        process.exit(1);
      }
      const bookResult = await generateBookCover(args[0], args[1], args[2], args[3], args[4]);
      console.log(JSON.stringify(bookResult, null, 2));
      break;
      
    case 'test-canva':
      console.log('🔍 Testing Canva API connection...\n');
      
      if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
        console.error('❌ Canva credentials not configured');
        console.log('\nSet environment variables:');
        console.log('  [Environment]::SetEnvironmentVariable(\'CANVA_CLIENT_ID\', \'your-id\', \'User\')');
        console.log('  [Environment]::SetEnvironmentVariable(\'CANVA_CLIENT_SECRET\', \'your-secret\', \'User\')');
        process.exit(1);
      }
      
      try {
        console.log('🔐 Authenticating with Canva...');
        const token = await getCanvaAccessToken();
        console.log('✅ Authentication successful');
        console.log(`📝 Token: ${token.substring(0, 20)}...`);
        
        console.log('\n📦 Fetching brand kits...');
        const brandKits = await canvaApiRequest('/brand-templates');
        
        if (brandKits.data && brandKits.data.length > 0) {
          console.log(`✅ Found ${brandKits.data.length} brand kit(s):\n`);
          brandKits.data.forEach((kit, i) => {
            console.log(`${i + 1}. ${kit.name || 'Unnamed'}`);
            console.log(`   ID: ${kit.id}`);
            console.log(`   Type: ${kit.type || 'N/A'}`);
            console.log('');
          });
          
          console.log('💡 Set your brand kit ID:');
          console.log(`   [Environment]::SetEnvironmentVariable('CANVA_BRAND_KIT_ID', '${brandKits.data[0].id}', 'User')`);
        } else {
          console.log('⚠️  No brand kits found. Create one in Canva first.');
        }
      } catch (error) {
        console.error('❌ Canva API test failed:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Verify Client ID and Secret are correct');
        console.log('2. Enable required scopes in Canva Connect');
        console.log('3. Register for Data Autofill APIs access');
        console.log('4. Check docs/CANVA-API-SETUP.md for setup guide');
        process.exit(1);
      }
      break;
      
    case 'templates':
      const templates = await listTemplates();
      console.log(JSON.stringify(templates, null, 2));
      break;
      
    case 'brand-kit':
      console.log(JSON.stringify(showBrandKit(), null, 2));
      break;
      
    default:
      console.log(`
OpenClaw Design Generator

Commands:
  thumbnail <topic> [style] [text]       Generate YouTube thumbnail (1280x720)
  social <topic> <platform> [style]      Generate social post image
  banner <topic> <width> <height>        Generate banner
  book-cover <title> [subtitle] [author] Generate book cover
  test-canva                             Test Canva API connection & list brand kits
  templates                              List available Canva templates
  brand-kit                              Show brand kit details

Platforms: instagram, instagramStory, facebook, twitter, linkedin, tiktok

Styles:
  spiritual-elegant    Imperial Blue bg, Gold accents
  tech-futuristic      Veil Black bg, Gold accents
  clean-professional   Sacred White bg, Imperial Blue text
  bold-impact          Solar Gold bg, Imperial Blue accents

Brand Colors:
  Imperial Blue:  #081F3A
  Solar Gold:     #C9A24D
  Sacred White:   #F5F7FA
  Stone Gray:     #8A8F98
  Veil Black:     #0A0D14

Fonts:
  Titles:    Playfair Display
  Headings:  Open Sans
  Body:      Libre Baskerville

Environment:
  CANVA_CLIENT_ID                Canva Connect Client ID
  CANVA_CLIENT_SECRET            Canva Connect Client Secret
  CANVA_BRAND_KIT_ID            Canva Brand Kit ID
  CANVA_THUMBNAIL_TEMPLATE_ID   Template for thumbnails
  TELEGRAM_BOT_TOKEN            For preview notifications
  OPENCLAW_ALERT_TELEGRAM_CHAT_ID  Telegram chat ID
      `);
  }
}

main().catch(console.error);

// Export for programmatic use
export {
  generateThumbnail,
  generateSocialPost,
  generateBanner,
  generateBookCover,
  createFromTemplate,
  exportDesign,
  listTemplates,
  showBrandKit,
  queueToSocial,
  BRAND_KIT,
  STYLE_PRESETS,
  DESIGN_SPECS
};
