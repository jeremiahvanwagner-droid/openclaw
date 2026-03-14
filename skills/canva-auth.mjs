#!/usr/bin/env node
/**
 * Canva OAuth 2.0 Authentication Handler
 * 
 * Implements Authorization Code flow with PKCE for Canva Connect API
 * 
 * Features:
 *   - Authorization Code flow with PKCE
 *   - Local callback server for OAuth redirect
 *   - Secure token storage
 *   - Automatic token refresh
 *   - Browser-based user authorization
 * 
 * Usage: 
 *   import { getCanvaAccessToken, authorizeCanva } from './canva-auth.mjs';
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID || '';
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET || '';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const REDIRECT_URI = 'http://127.0.0.1:3000/api/canva/callback';
const CALLBACK_PORT = 3000;

// Required scopes for design generation
const SCOPES = [
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read'
].join(' ');

// Token storage path
const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'canva-tokens.json');

// In-memory token cache
let tokenCache = {
  access_token: null,
  refresh_token: null,
  expires_at: 0
};

/**
 * Initialize - load tokens from storage
 */
async function init() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    try {
      const data = await fs.readFile(TOKEN_FILE, 'utf8');
      tokenCache = JSON.parse(data);
    } catch (err) {
      // File doesn't exist yet, that's OK
    }
  } catch (error) {
    console.error('Failed to initialize token storage:', error.message);
  }
}

/**
 * Save tokens to storage
 */
async function saveTokens() {
  try {
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokenCache, null, 2));
  } catch (error) {
    console.error('Failed to save tokens:', error.message);
  }
}

/**
 * Generate code verifier and challenge for PKCE
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(96).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

/**
 * Generate state parameter
 */
function generateState() {
  return crypto.randomBytes(96).toString('base64url');
}

/**
 * Start local callback server and open browser for authorization
 */
async function authorizeCanva() {
  if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
    throw new Error('CANVA_CLIENT_ID and CANVA_CLIENT_SECRET environment variables required');
  }
  
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  
  // Build authorization URL
  const authUrl = new URL(CANVA_AUTH_URL);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CANVA_CLIENT_ID);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  
  console.log('🔐 Canva Authorization Required\n');
  console.log('Opening browser for authorization...');
  console.log('If browser doesn\'t open, visit:\n');
  console.log(authUrl.toString());
  console.log('');
  
  // Return promise that resolves when callback is received
  return new Promise((resolve, reject) => {
    let server;
    const timeout = setTimeout(() => {
      server?.close();
      reject(new Error('Authorization timeout after 5 minutes'));
    }, 300000); // 5 minute timeout
    
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`);
      
      if (url.pathname === '/api/canva/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>❌ Authorization Failed</h1><p>No authorization code received.</p>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }
        
        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>❌ Authorization Failed</h1><p>State mismatch - possible CSRF attack.</p>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('State parameter mismatch'));
          return;
        }
        
        try {
          // Exchange authorization code for access token
          await exchangeCodeForToken(code, codeVerifier);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>OpenClaw - Canva Authorized</title>
                <style>
                  body { font-family: system-ui; text-align: center; padding: 50px; background: #0A0D14; color: #F5F7FA; }
                  h1 { color: #C9A24D; }
                  p { color: #8A8F98; }
                </style>
              </head>
              <body>
                <h1>✅ Authorization Successful</h1>
                <p>OpenClaw is now connected to Canva.</p>
                <p>You can close this window and return to your terminal.</p>
              </body>
            </html>
          `);
          
          clearTimeout(timeout);
          server.close();
          resolve();
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>❌ Token Exchange Failed</h1><p>${error.message}</p>`);
          clearTimeout(timeout);
          server.close();
          reject(error);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      console.log(`✓ Callback server started on http://127.0.0.1:${CALLBACK_PORT}\n`);
      
      // Open browser
      const opener = process.platform === 'win32' ? 'start' :
                     process.platform === 'darwin' ? 'open' : 'xdg-open';
      
      exec(`${opener} "${authUrl.toString()}"`, (error) => {
        if (error) {
          console.log('⚠️  Could not open browser automatically. Please visit the URL above manually.');
        }
      });
    });
  });
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code, codeVerifier) {
  const credentials = Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64');
  
  const postData = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI
  }).toString();
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: '/rest/v1/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.access_token) {
            tokenCache.access_token = json.access_token;
            tokenCache.refresh_token = json.refresh_token;
            tokenCache.expires_at = Date.now() + (json.expires_in * 1000);
            
            await saveTokens();
            
            console.log('✅ Access token obtained and saved');
            resolve(json);
          } else {
            reject(new Error(`Token exchange failed: ${json.error || json.error_description || res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Token exchange parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken() {
  if (!tokenCache.refresh_token) {
    throw new Error('No refresh token available. Re-authorization required.');
  }
  
  const credentials = Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64');
  
  const postData = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenCache.refresh_token
  }).toString();
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: '/rest/v1/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.access_token) {
            tokenCache.access_token = json.access_token;
            tokenCache.refresh_token = json.refresh_token;
            tokenCache.expires_at = Date.now() + (json.expires_in * 1000);
            
            await saveTokens();
            
            console.log('✅ Access token refreshed');
            resolve(json.access_token);
          } else {
            reject(new Error(`Token refresh failed: ${json.error || res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Token refresh parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get valid access token (main entry point)
 * Auto-refreshes if expired, or triggers re-authorization if needed
 */
async function getCanvaAccessToken(autoAuthorize = true) {
  await init();
  
  if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
    throw new Error('CANVA_CLIENT_ID and CANVA_CLIENT_SECRET environment variables required');
  }
  
  // Check if we have a valid token
  if (tokenCache.access_token && Date.now() < tokenCache.expires_at - 60000) {
    return tokenCache.access_token;
  }
  
  // Try to refresh if we have a refresh token
  if (tokenCache.refresh_token) {
    try {
      return await refreshAccessToken();
    } catch (error) {
      console.log('⚠️  Token refresh failed:', error.message);
      if (!autoAuthorize) {
        throw error;
      }
    }
  }
  
  // Need to re-authorize
  if (autoAuthorize) {
    console.log('🔄 Authorization required...');
    await authorizeCanva();
    return tokenCache.access_token;
  } else {
    throw new Error('No valid access token. Run with --authorize flag.');
  }
}

/**
 * Make authenticated Canva API request
 */
async function canvaRequest(endpoint, method = 'GET', body = null) {
  const token = await getCanvaAccessToken();
  const url = new URL(endpoint, CANVA_API_BASE);
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
    options.headers['Content-Length'] = Buffer.byteLength(options.body);
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Canva API error (${res.statusCode}): ${json.error || json.message || 'Unknown error'}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Response parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Revoke current tokens
 */
async function revokeCanvaTokens() {
  if (!tokenCache.access_token) {
    console.log('No active tokens to revoke');
    return;
  }
  
  const credentials = Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64');
  
  const postData = new URLSearchParams({
    token: tokenCache.access_token
  }).toString();
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: '/rest/v1/oauth/revoke',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, async (res) => {
      if (res.statusCode === 200) {
        tokenCache = { access_token: null, refresh_token: null, expires_at: 0 };
        await saveTokens();
        console.log('✅ Tokens revoked');
        resolve();
      } else {
        reject(new Error(`Token revocation failed: ${res.statusCode}`));
      }
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
});
}

// CLI interface - check if this file is being run directly
const isMainModule = process.argv[1] && (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url.endsWith(path.basename(process.argv[1]))
);

if (isMainModule) {
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'authorize':
          await authorizeCanva();
          console.log('\n✅ Canva authorization complete!');
          break;
          
        case 'test':
          console.log('🔍 Testing Canva API connection...\n');
          const token = await getCanvaAccessToken();
          console.log(`✅ Valid token obtained: ${token.substring(0, 20)}...`);
          
          console.log('\n📦 Fetching brand templates...');
          const templates = await canvaRequest('/brand-templates');
          console.log(`✅ Found ${templates.data?.length || 0} template(s)`);
          
          if (templates.data && templates.data.length > 0) {
            console.log('\nAvailable templates:');
            templates.data.forEach((t, i) => {
              console.log(`  ${i + 1}. ${t.name || 'Unnamed'} (${t.id})`);
            });
          }
          break;
          
        case 'revoke':
          await revokeCanvaTokens();
          break;
          
        case 'status':
          await init();
          if (tokenCache.access_token) {
            const expiresIn = Math.floor((tokenCache.expires_at - Date.now()) / 1000 / 60);
            console.log(`✅ Access token: Active (expires in ${expiresIn} minutes)`);
            console.log(`✅ Refresh token: ${tokenCache.refresh_token ? 'Available' : 'Not available'}`);
          } else {
            console.log('❌ No active tokens. Run: node canva-auth.mjs authorize');
          }
          break;
          
        default:
          console.log(`
Canva OAuth 2.0 Authentication Handler

Commands:
  authorize    Start browser-based authorization flow
  test         Test API connection and list templates
  status       Show current token status
  revoke       Revoke active tokens

Environment Variables:
  CANVA_CLIENT_ID       Your Canva Connect Client ID
  CANVA_CLIENT_SECRET   Your Canva Connect Client Secret

Setup Guide:
  docs/CANVA-API-SETUP.md
          `);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}

export {
  authorizeCanva,
  getCanvaAccessToken,
  canvaRequest,
  revokeCanvaTokens
};
