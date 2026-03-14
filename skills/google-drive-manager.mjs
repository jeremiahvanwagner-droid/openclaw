#!/usr/bin/env node
/**
 * OpenClaw Google Drive Manager
 * 
 * Google Drive API operations with structured folder architecture
 * 
 * Features:
 *   - 7-folder content organization system
 *   - File upload/download/sync
 *   - Folder creation and management
 *   - Sharing and permissions
 *   - Version control
 *   - Search and discovery
 * 
 * Usage: node google-drive-manager.mjs <command> [args...]
 * 
 * Commands:
 *   init                              Initialize folder structure
 *   upload <localPath> <folder>       Upload file to folder
 *   download <fileId> <localPath>     Download file
 *   list <folder>                     List files in folder
 *   search <query>                    Search files
 *   share <fileId> <email>            Share file with user
 *   move <fileId> <folder>            Move file to folder
 *   delete <fileId>                   Delete file
 *   sync <localDir> <folder>          Sync local directory
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';

// Configuration
const DATA_DIR = process.env.OPENCLAW_DATA_DIR || 
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'data');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'google-credentials.json');
const TOKEN_FILE = path.join(DATA_DIR, 'google-token.json');
const DRIVE_CACHE_FILE = path.join(DATA_DIR, 'drive-cache.json');

// Folder structure (as per plan)
const FOLDER_STRUCTURE = {
  root: 'Digital-Product-Distribution',
  folders: {
    '01-Research': {
      subfolders: ['Market-Analysis', 'Competitor-Intel', 'Audience-Insights', 'Trend-Reports']
    },
    '02-Content-Pipeline': {
      subfolders: ['Drafts', 'In-Review', 'Approved', 'Published']
    },
    '03-Products': {
      subfolders: ['eBooks', 'Courses', 'Templates', 'Downloads']
    },
    '04-Marketing-Assets': {
      subfolders: ['Graphics', 'Videos', 'Copy', 'Ads']
    },
    '05-Sales-Materials': {
      subfolders: ['Presentations', 'Proposals', 'Scripts']
    },
    '06-Customer-Files': {
      subfolders: ['Deliverables', 'Support-Docs']
    },
    '07-Analytics': {
      subfolders: ['Reports', 'Dashboards']
    }
  }
};

// Folder ID cache
let folderCache = {};

/**
 * Initialize directories
 */
async function initDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Load credentials
 */
async function loadCredentials() {
  try {
    const data = await fs.readFile(CREDENTIALS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Credentials not found. Please run setup first.');
    console.error('Expected file:', CREDENTIALS_FILE);
    return null;
  }
}

/**
 * Load access token
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
 * Save access token
 */
async function saveToken(token) {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
}

/**
 * Load folder cache
 */
async function loadCache() {
  try {
    const data = await fs.readFile(DRIVE_CACHE_FILE, 'utf8');
    folderCache = JSON.parse(data);
  } catch {
    folderCache = {};
  }
  return folderCache;
}

/**
 * Save folder cache
 */
async function saveCache() {
  await fs.writeFile(DRIVE_CACHE_FILE, JSON.stringify(folderCache, null, 2));
}

/**
 * Make Google Drive API request
 */
async function driveRequest(method, endpoint, body = null, isUpload = false) {
  const token = await loadToken();
  if (!token) {
    throw new Error('Not authenticated. Run auth command first.');
  }
  
  const baseUrl = isUpload 
    ? 'https://www.googleapis.com/upload/drive/v3'
    : 'https://www.googleapis.com/drive/v3';
  
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (isUpload && body) {
      options.headers['Content-Type'] = 'application/octet-stream';
      options.headers['Content-Length'] = body.length;
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

/**
 * Create folder
 */
async function createFolder(name, parentId = null) {
  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  
  if (parentId) {
    metadata.parents = [parentId];
  }
  
  const result = await driveRequest('POST', '/files', metadata);
  
  // Update cache
  const cacheKey = parentId ? `${parentId}/${name}` : name;
  folderCache[cacheKey] = result.id;
  await saveCache();
  
  return result;
}

/**
 * Find folder by path
 */
async function findFolder(folderPath) {
  await loadCache();
  
  // Check cache first
  if (folderCache[folderPath]) {
    return folderCache[folderPath];
  }
  
  const parts = folderPath.split('/').filter(p => p);
  let parentId = null;
  let currentPath = '';
  
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    
    if (folderCache[currentPath]) {
      parentId = folderCache[currentPath];
      continue;
    }
    
    // Search for folder
    let query = `name='${part}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }
    
    const response = await driveRequest('GET', `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
    
    if (response.files && response.files.length > 0) {
      parentId = response.files[0].id;
      folderCache[currentPath] = parentId;
    } else {
      return null;
    }
  }
  
  await saveCache();
  return parentId;
}

/**
 * Get or create folder
 */
async function getOrCreateFolder(folderPath) {
  let folderId = await findFolder(folderPath);
  
  if (!folderId) {
    const parts = folderPath.split('/').filter(p => p);
    let parentId = null;
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      folderId = await findFolder(currentPath);
      
      if (!folderId) {
        const result = await createFolder(part, parentId);
        folderId = result.id;
        folderCache[currentPath] = folderId;
      }
      
      parentId = folderId;
    }
    
    await saveCache();
  }
  
  return folderId;
}

/**
 * Initialize folder structure
 */
async function initFolderStructure() {
  console.log('Initializing folder structure...');
  const created = [];
  
  // Create root folder
  const rootId = await getOrCreateFolder(FOLDER_STRUCTURE.root);
  created.push({ path: FOLDER_STRUCTURE.root, id: rootId });
  
  // Create main folders and subfolders
  for (const [folderName, config] of Object.entries(FOLDER_STRUCTURE.folders)) {
    const folderPath = `${FOLDER_STRUCTURE.root}/${folderName}`;
    const folderId = await getOrCreateFolder(folderPath);
    created.push({ path: folderPath, id: folderId });
    
    if (config.subfolders) {
      for (const subfolder of config.subfolders) {
        const subPath = `${folderPath}/${subfolder}`;
        const subId = await getOrCreateFolder(subPath);
        created.push({ path: subPath, id: subId });
      }
    }
    
    console.log(`  Created: ${folderPath}`);
  }
  
  console.log(`\nInitialized ${created.length} folders`);
  return created;
}

/**
 * Upload file
 */
async function uploadFile(localPath, targetFolder, customName = null) {
  const folderId = await getOrCreateFolder(`${FOLDER_STRUCTURE.root}/${targetFolder}`);
  
  const fileName = customName || path.basename(localPath);
  const fileContent = await fs.readFile(localPath);
  
  // Create metadata
  const metadata = {
    name: fileName,
    parents: [folderId]
  };
  
  // Multipart upload
  const boundary = 'openclaw_boundary_' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const multipartBody = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/octet-stream\r\n\r\n';
  
  const bodyBuffer = Buffer.concat([
    Buffer.from(multipartBody),
    fileContent,
    Buffer.from(closeDelimiter)
  ]);
  
  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: '/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(loadToken()).then ? '' : ''}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    };
    
    loadToken().then(token => {
      options.headers['Authorization'] = `Bearer ${token.access_token}`;
      
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
      req.write(bodyBuffer);
      req.end();
    });
  });
  
  console.log(`Uploaded: ${fileName} -> ${targetFolder}`);
  return result;
}

/**
 * Download file
 */
async function downloadFile(fileId, localPath) {
  const token = await loadToken();
  
  // Get file metadata first
  const metadata = await driveRequest('GET', `/files/${fileId}?fields=name,size,mimeType`);
  
  const finalPath = localPath.endsWith('/') 
    ? path.join(localPath, metadata.name)
    : localPath;
  
  // Download content
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/drive/v3/files/${fileId}?alt=media`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`
      }
    };
    
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(finalPath, buffer);
        console.log(`Downloaded: ${metadata.name} -> ${finalPath}`);
        resolve({ success: true, path: finalPath, size: buffer.length });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * List files in folder
 */
async function listFiles(folderPath, pageSize = 100) {
  const folderId = await findFolder(`${FOLDER_STRUCTURE.root}/${folderPath}`);
  
  if (!folderId) {
    return { success: false, error: `Folder not found: ${folderPath}` };
  }
  
  const query = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink)';
  
  const response = await driveRequest('GET', `/files?q=${encodeURIComponent(query)}&fields=${fields}&pageSize=${pageSize}`);
  
  return {
    success: true,
    folder: folderPath,
    files: response.files || []
  };
}

/**
 * Search files
 */
async function searchFiles(query, pageSize = 50) {
  const rootId = await findFolder(FOLDER_STRUCTURE.root);
  
  let searchQuery = `name contains '${query}' and trashed=false`;
  if (rootId) {
    // Limit search to our folder structure (requires recursive parent check)
    // For now, search globally
  }
  
  const fields = 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)';
  
  const response = await driveRequest('GET', `/files?q=${encodeURIComponent(searchQuery)}&fields=${fields}&pageSize=${pageSize}`);
  
  return {
    success: true,
    query: query,
    results: response.files || []
  };
}

/**
 * Move file to folder
 */
async function moveFile(fileId, targetFolder) {
  const targetFolderId = await getOrCreateFolder(`${FOLDER_STRUCTURE.root}/${targetFolder}`);
  
  // Get current parents
  const file = await driveRequest('GET', `/files/${fileId}?fields=parents`);
  const currentParents = file.parents ? file.parents.join(',') : '';
  
  // Update file location
  const result = await driveRequest(
    'PATCH',
    `/files/${fileId}?addParents=${targetFolderId}&removeParents=${currentParents}&fields=id,name,parents`
  );
  
  console.log(`Moved file ${fileId} to ${targetFolder}`);
  return result;
}

/**
 * Delete file
 */
async function deleteFile(fileId, permanent = false) {
  if (permanent) {
    await driveRequest('DELETE', `/files/${fileId}`);
    console.log(`Permanently deleted: ${fileId}`);
  } else {
    await driveRequest('PATCH', `/files/${fileId}`, { trashed: true });
    console.log(`Moved to trash: ${fileId}`);
  }
  
  return { success: true };
}

/**
 * Share file
 */
async function shareFile(fileId, email, role = 'reader') {
  const permission = {
    type: 'user',
    role: role, // 'reader', 'writer', 'commenter', 'owner'
    emailAddress: email
  };
  
  const result = await driveRequest('POST', `/files/${fileId}/permissions`, permission);
  
  console.log(`Shared ${fileId} with ${email} as ${role}`);
  return result;
}

/**
 * Sync local directory to Drive folder
 */
async function syncDirectory(localDir, targetFolder) {
  const files = await fs.readdir(localDir, { withFileTypes: true });
  const synced = [];
  
  for (const file of files) {
    if (file.isFile()) {
      const localPath = path.join(localDir, file.name);
      const result = await uploadFile(localPath, targetFolder);
      synced.push({ local: file.name, remote: result.id });
    } else if (file.isDirectory()) {
      // Recursive sync for subdirectories
      const subTarget = `${targetFolder}/${file.name}`;
      const subPath = path.join(localDir, file.name);
      const subSynced = await syncDirectory(subPath, subTarget);
      synced.push(...subSynced);
    }
  }
  
  console.log(`Synced ${synced.length} files to ${targetFolder}`);
  return synced;
}

/**
 * Get folder path mappings
 */
function getFolderMappings() {
  const mappings = {};
  
  for (const [folderName, config] of Object.entries(FOLDER_STRUCTURE.folders)) {
    const basePath = `${FOLDER_STRUCTURE.root}/${folderName}`;
    mappings[folderName] = basePath;
    
    if (config.subfolders) {
      for (const subfolder of config.subfolders) {
        mappings[`${folderName}/${subfolder}`] = `${basePath}/${subfolder}`;
      }
    }
  }
  
  return mappings;
}

// ============ CLI Interface ============

async function main() {
  const [,, command, ...args] = process.argv;
  
  await initDirs();
  await loadCache();
  
  try {
    switch (command) {
      case 'init': {
        const result = await initFolderStructure();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'upload': {
        const localPath = args[0];
        const folder = args[1] || '02-Content-Pipeline/Drafts';
        if (!localPath) {
          console.error('Usage: upload <localPath> [folder]');
          process.exit(1);
        }
        const result = await uploadFile(localPath, folder);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'download': {
        const fileId = args[0];
        const localPath = args[1] || DATA_DIR;
        if (!fileId) {
          console.error('Usage: download <fileId> [localPath]');
          process.exit(1);
        }
        const result = await downloadFile(fileId, localPath);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'list': {
        const folder = args[0] || '02-Content-Pipeline/Drafts';
        const result = await listFiles(folder);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'search': {
        const query = args.join(' ');
        if (!query) {
          console.error('Usage: search <query>');
          process.exit(1);
        }
        const result = await searchFiles(query);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'move': {
        const fileId = args[0];
        const folder = args[1];
        if (!fileId || !folder) {
          console.error('Usage: move <fileId> <folder>');
          process.exit(1);
        }
        const result = await moveFile(fileId, folder);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'delete': {
        const fileId = args[0];
        const permanent = args[1] === '--permanent';
        if (!fileId) {
          console.error('Usage: delete <fileId> [--permanent]');
          process.exit(1);
        }
        const result = await deleteFile(fileId, permanent);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'share': {
        const fileId = args[0];
        const email = args[1];
        const role = args[2] || 'reader';
        if (!fileId || !email) {
          console.error('Usage: share <fileId> <email> [role]');
          process.exit(1);
        }
        const result = await shareFile(fileId, email, role);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'sync': {
        const localDir = args[0];
        const folder = args[1] || '02-Content-Pipeline/Drafts';
        if (!localDir) {
          console.error('Usage: sync <localDir> [folder]');
          process.exit(1);
        }
        const result = await syncDirectory(localDir, folder);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'folders': {
        console.log('Folder Structure Mappings:');
        console.log(JSON.stringify(getFolderMappings(), null, 2));
        break;
      }
      
      case 'cache': {
        console.log('Folder Cache:');
        console.log(JSON.stringify(folderCache, null, 2));
        break;
      }
      
      case 'test': {
        console.log('Google Drive Manager Module');
        console.log('===========================');
        console.log('\nFolder Structure:', FOLDER_STRUCTURE.root);
        for (const [name, config] of Object.entries(FOLDER_STRUCTURE.folders)) {
          console.log(`  ${name}/`);
          if (config.subfolders) {
            for (const sub of config.subfolders) {
              console.log(`    ${sub}/`);
            }
          }
        }
        console.log('\nCommands:');
        console.log('  init                     - Initialize folder structure');
        console.log('  upload <path> [folder]   - Upload file');
        console.log('  download <id> [path]     - Download file');
        console.log('  list [folder]            - List files');
        console.log('  search <query>           - Search files');
        console.log('  move <id> <folder>       - Move file');
        console.log('  delete <id> [--permanent]- Delete file');
        console.log('  share <id> <email> [role]- Share file');
        console.log('  sync <dir> [folder]      - Sync directory');
        console.log('  folders                  - Show folder mappings');
        console.log('  cache                    - Show folder cache');
        break;
      }
      
      default:
        console.log('Google Drive Manager - OpenClaw');
        console.log('Run with "test" to see available commands');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for module use
export {
  initFolderStructure,
  uploadFile,
  downloadFile,
  listFiles,
  searchFiles,
  moveFile,
  deleteFile,
  shareFile,
  syncDirectory,
  findFolder,
  getOrCreateFolder,
  getFolderMappings,
  FOLDER_STRUCTURE
};

// Run CLI
main().catch(console.error);
