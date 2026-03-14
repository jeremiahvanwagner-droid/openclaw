#!/usr/bin/env node
/**
 * OpenClaw Backup & Disaster Recovery Manager
 * 
 * Features:
 *   - Daily GHL contact/opportunity export
 *   - Cron job config backup
 *   - Skill module versioning
 *   - Selective restore capability
 *   - Integrity verification
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import crypto from 'crypto';

const execAsync = promisify(exec);

// Configuration
const OPENCLAW_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw');
const BACKUP_DIR = path.join(OPENCLAW_DIR, 'backups');
const DATA_DIR = path.join(OPENCLAW_DIR, 'data');
const SKILLS_DIR = path.join(OPENCLAW_DIR, 'workspace', 'skills');

const GHL_API_KEY = process.env.GHL_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'TW8JsPW5NMnA3tfK2XLn';
const TELEGRAM_CHAT_ID = process.env.OPENCLAW_ALERT_TELEGRAM_CHAT_ID || '7737707872';

// Backup retention
const RETENTION_DAYS = 30;
const MAX_BACKUPS = 30;

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
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Send Telegram notification
 */
async function sendNotification(message) {
  try {
    const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await execAsync(`openclaw send --agent main --channel telegram --to ${TELEGRAM_CHAT_ID} "${escaped}"`);
    return true;
  } catch {
    console.error('Failed to send notification');
    return false;
  }
}

/**
 * Calculate file checksum
 */
async function calculateChecksum(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Get today's backup directory
 */
function getTodayBackupDir() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(BACKUP_DIR, today);
}

/**
 * Export all GHL contacts (paginated)
 */
async function exportContacts(backupDir) {
  console.log('\n📇 Exporting GHL contacts...\n');
  
  const allContacts = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;
  
  while (hasMore) {
    try {
      const response = await ghlRequest('GET', 
        `/contacts/?locationId=${GHL_LOCATION_ID}&limit=${limit}&skip=${offset}`
      );
      
      const contacts = response.contacts || [];
      allContacts.push(...contacts);
      
      console.log(`  Fetched ${allContacts.length} contacts...`);
      
      hasMore = contacts.length === limit;
      offset += limit;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`  Error at offset ${offset}: ${error.message}`);
      break;
    }
  }
  
  // Save contacts
  const contactsFile = path.join(backupDir, 'contacts.json');
  await fs.writeFile(contactsFile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    locationId: GHL_LOCATION_ID,
    count: allContacts.length,
    contacts: allContacts
  }, null, 2));
  
  console.log(`  ✅ Exported ${allContacts.length} contacts to contacts.json`);
  
  return {
    file: 'contacts.json',
    count: allContacts.length,
    checksum: await calculateChecksum(contactsFile)
  };
}

/**
 * Export all opportunities (paginated)
 */
async function exportOpportunities(backupDir) {
  console.log('\n💼 Exporting GHL opportunities...\n');
  
  // First get all pipelines
  const pipelinesResponse = await ghlRequest('GET', 
    `/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`
  );
  
  const pipelines = pipelinesResponse.pipelines || [];
  const allOpportunities = [];
  
  for (const pipeline of pipelines) {
    console.log(`  Pipeline: ${pipeline.name}`);
    
    let hasMore = true;
    let offset = 0;
    const limit = 100;
    
    while (hasMore) {
      try {
        const response = await ghlRequest('GET', 
          `/opportunities/?locationId=${GHL_LOCATION_ID}&pipelineId=${pipeline.id}&limit=${limit}&skip=${offset}`
        );
        
        const opportunities = response.opportunities || [];
        
        // Add pipeline context
        for (const opp of opportunities) {
          opp._pipelineName = pipeline.name;
          opp._stageName = pipeline.stages?.find(s => s.id === opp.pipelineStageId)?.name;
        }
        
        allOpportunities.push(...opportunities);
        
        hasMore = opportunities.length === limit;
        offset += limit;
        
        await new Promise(r => setTimeout(r, 200));
        
      } catch (error) {
        console.error(`    Error at offset ${offset}: ${error.message}`);
        break;
      }
    }
  }
  
  // Save opportunities
  const oppsFile = path.join(backupDir, 'opportunities.json');
  await fs.writeFile(oppsFile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    locationId: GHL_LOCATION_ID,
    pipelineCount: pipelines.length,
    count: allOpportunities.length,
    pipelines: pipelines,
    opportunities: allOpportunities
  }, null, 2));
  
  console.log(`  ✅ Exported ${allOpportunities.length} opportunities to opportunities.json`);
  
  return {
    file: 'opportunities.json',
    count: allOpportunities.length,
    checksum: await calculateChecksum(oppsFile)
  };
}

/**
 * Backup cron job configuration
 */
async function backupCronConfig(backupDir) {
  console.log('\n⏰ Backing up cron configuration...\n');
  
  try {
    const { stdout } = await execAsync('openclaw cron list --json');
    const cronData = JSON.parse(stdout);
    
    const cronFile = path.join(backupDir, 'cron-jobs.json');
    await fs.writeFile(cronFile, JSON.stringify({
      exportedAt: new Date().toISOString(),
      count: cronData.length || 0,
      jobs: cronData
    }, null, 2));
    
    console.log(`  ✅ Backed up ${cronData.length || 0} cron jobs to cron-jobs.json`);
    
    return {
      file: 'cron-jobs.json',
      count: cronData.length || 0,
      checksum: await calculateChecksum(cronFile)
    };
    
  } catch (error) {
    console.log(`  ⚠ Could not export cron jobs: ${error.message}`);
    return { file: 'cron-jobs.json', count: 0, error: error.message };
  }
}

/**
 * Backup skill modules with versioning
 */
async function backupSkillModules(backupDir) {
  console.log('\n🛠️ Backing up skill modules...\n');
  
  const skillsBackupDir = path.join(backupDir, 'skills');
  await fs.mkdir(skillsBackupDir, { recursive: true });
  
  const skills = [];
  
  try {
    const files = await fs.readdir(SKILLS_DIR);
    
    for (const file of files) {
      if (file.endsWith('.mjs') || file.endsWith('.js')) {
        const srcPath = path.join(SKILLS_DIR, file);
        const destPath = path.join(skillsBackupDir, file);
        
        await fs.copyFile(srcPath, destPath);
        
        const checksum = await calculateChecksum(destPath);
        const stats = await fs.stat(srcPath);
        
        skills.push({
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          checksum
        });
        
        console.log(`  ✅ ${file}`);
      }
    }
    
  } catch (error) {
    console.log(`  ⚠ Could not backup skills: ${error.message}`);
  }
  
  // Save skills manifest
  const manifestFile = path.join(backupDir, 'skills-manifest.json');
  await fs.writeFile(manifestFile, JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: skills.length,
    skills
  }, null, 2));
  
  console.log(`  ✅ Backed up ${skills.length} skill modules`);
  
  return {
    file: 'skills/',
    count: skills.length,
    skills
  };
}

/**
 * Backup OpenClaw config
 */
async function backupConfig(backupDir) {
  console.log('\n⚙️ Backing up OpenClaw config...\n');
  
  const configFiles = ['openclaw.json', 'openclaw.yaml', 'config.json'];
  const backedUp = [];
  
  for (const configFile of configFiles) {
    const srcPath = path.join(OPENCLAW_DIR, configFile);
    
    try {
      await fs.access(srcPath);
      const destPath = path.join(backupDir, configFile);
      await fs.copyFile(srcPath, destPath);
      
      backedUp.push({
        file: configFile,
        checksum: await calculateChecksum(destPath)
      });
      
      console.log(`  ✅ ${configFile}`);
      
    } catch {
      // File doesn't exist, skip
    }
  }
  
  console.log(`  ✅ Backed up ${backedUp.length} config files`);
  
  return {
    file: 'config/',
    count: backedUp.length,
    files: backedUp
  };
}

/**
 * Backup data files
 */
async function backupDataFiles(backupDir) {
  console.log('\n📁 Backing up data files...\n');
  
  const dataBackupDir = path.join(backupDir, 'data');
  await fs.mkdir(dataBackupDir, { recursive: true });
  
  const dataFiles = [];
  
  try {
    const files = await fs.readdir(DATA_DIR);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const srcPath = path.join(DATA_DIR, file);
        const destPath = path.join(dataBackupDir, file);
        
        await fs.copyFile(srcPath, destPath);
        
        dataFiles.push({
          name: file,
          checksum: await calculateChecksum(destPath)
        });
        
        console.log(`  ✅ ${file}`);
      }
    }
    
  } catch {
    console.log('  (No data files to backup)');
  }
  
  return {
    file: 'data/',
    count: dataFiles.length,
    files: dataFiles
  };
}

/**
 * Run full backup
 */
async function runFullBackup() {
  const startTime = Date.now();
  const backupDir = getTodayBackupDir();
  
  console.log('\n' + '═'.repeat(60));
  console.log('💾 OPENCLAW FULL BACKUP');
  console.log('═'.repeat(60));
  console.log(`Date: ${new Date().toLocaleString()}`);
  console.log(`Destination: ${backupDir}`);
  
  await fs.mkdir(backupDir, { recursive: true });
  
  const manifest = {
    createdAt: new Date().toISOString(),
    locationId: GHL_LOCATION_ID,
    components: {}
  };
  
  // Run all backup components
  try {
    manifest.components.contacts = await exportContacts(backupDir);
  } catch (error) {
    manifest.components.contacts = { error: error.message };
    console.error(`  ❌ Contacts backup failed: ${error.message}`);
  }
  
  try {
    manifest.components.opportunities = await exportOpportunities(backupDir);
  } catch (error) {
    manifest.components.opportunities = { error: error.message };
    console.error(`  ❌ Opportunities backup failed: ${error.message}`);
  }
  
  try {
    manifest.components.cron = await backupCronConfig(backupDir);
  } catch (error) {
    manifest.components.cron = { error: error.message };
  }
  
  try {
    manifest.components.skills = await backupSkillModules(backupDir);
  } catch (error) {
    manifest.components.skills = { error: error.message };
  }
  
  try {
    manifest.components.config = await backupConfig(backupDir);
  } catch (error) {
    manifest.components.config = { error: error.message };
  }
  
  try {
    manifest.components.data = await backupDataFiles(backupDir);
  } catch (error) {
    manifest.components.data = { error: error.message };
  }
  
  // Calculate totals
  manifest.summary = {
    contacts: manifest.components.contacts?.count || 0,
    opportunities: manifest.components.opportunities?.count || 0,
    cronJobs: manifest.components.cron?.count || 0,
    skills: manifest.components.skills?.count || 0,
    configFiles: manifest.components.config?.count || 0,
    dataFiles: manifest.components.data?.count || 0,
    durationMs: Date.now() - startTime
  };
  
  // Save manifest
  const manifestFile = path.join(backupDir, 'backup-manifest.json');
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  
  console.log('\n' + '─'.repeat(60));
  console.log('📊 BACKUP SUMMARY\n');
  console.log(`  Contacts:      ${manifest.summary.contacts}`);
  console.log(`  Opportunities: ${manifest.summary.opportunities}`);
  console.log(`  Cron Jobs:     ${manifest.summary.cronJobs}`);
  console.log(`  Skill Modules: ${manifest.summary.skills}`);
  console.log(`  Config Files:  ${manifest.summary.configFiles}`);
  console.log(`  Data Files:    ${manifest.summary.dataFiles}`);
  console.log(`  Duration:      ${(manifest.summary.durationMs / 1000).toFixed(1)}s`);
  console.log('═'.repeat(60));
  
  // Send notification
  await sendNotification(
    `💾 Backup Complete\n\n` +
    `📇 ${manifest.summary.contacts} contacts\n` +
    `💼 ${manifest.summary.opportunities} opportunities\n` +
    `🛠️ ${manifest.summary.skills} skills\n` +
    `⏱️ ${(manifest.summary.durationMs / 1000).toFixed(1)}s`
  );
  
  // Cleanup old backups
  await cleanupOldBackups();
  
  return manifest;
}

/**
 * List available backups
 */
async function listBackups() {
  console.log('\n📁 AVAILABLE BACKUPS\n');
  
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const backups = [];
    
    for (const entry of entries.sort().reverse()) {
      const backupPath = path.join(BACKUP_DIR, entry);
      const manifestPath = path.join(backupPath, 'backup-manifest.json');
      
      try {
        const stats = await fs.stat(backupPath);
        if (!stats.isDirectory()) continue;
        
        let manifest = null;
        try {
          manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        } catch {}
        
        const size = await getDirectorySize(backupPath);
        
        backups.push({
          date: entry,
          size,
          contacts: manifest?.summary?.contacts || '?',
          opportunities: manifest?.summary?.opportunities || '?',
          skills: manifest?.summary?.skills || '?'
        });
        
      } catch {}
    }
    
    console.log('Date'.padEnd(12) + 'Size'.padStart(10) + 'Contacts'.padStart(12) + 'Opps'.padStart(8) + 'Skills'.padStart(8));
    console.log('─'.repeat(50));
    
    for (const backup of backups) {
      console.log(
        backup.date.padEnd(12) +
        formatSize(backup.size).padStart(10) +
        backup.contacts.toString().padStart(12) +
        backup.opportunities.toString().padStart(8) +
        backup.skills.toString().padStart(8)
      );
    }
    
    console.log('');
    return backups;
    
  } catch {
    console.log('No backups found.');
    return [];
  }
}

/**
 * Get directory size
 */
async function getDirectorySize(dirPath) {
  let size = 0;
  
  try {
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        size += await getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch {}
  
  return size;
}

/**
 * Format file size
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Restore from backup
 */
async function restoreFromBackup(backupDate, components = ['all']) {
  const backupDir = path.join(BACKUP_DIR, backupDate);
  
  console.log('\n' + '═'.repeat(60));
  console.log('🔄 OPENCLAW RESTORE');
  console.log('═'.repeat(60));
  console.log(`Source: ${backupDir}`);
  console.log(`Components: ${components.join(', ')}`);
  console.log('');
  
  try {
    await fs.access(backupDir);
  } catch {
    console.error(`❌ Backup not found: ${backupDate}`);
    return false;
  }
  
  const manifest = JSON.parse(
    await fs.readFile(path.join(backupDir, 'backup-manifest.json'), 'utf8')
  );
  
  const shouldRestore = (component) => 
    components.includes('all') || components.includes(component);
  
  // Restore skills
  if (shouldRestore('skills')) {
    console.log('🛠️ Restoring skills...');
    const skillsBackupDir = path.join(backupDir, 'skills');
    
    try {
      const files = await fs.readdir(skillsBackupDir);
      
      for (const file of files) {
        const srcPath = path.join(skillsBackupDir, file);
        const destPath = path.join(SKILLS_DIR, file);
        
        await fs.copyFile(srcPath, destPath);
        console.log(`  ✅ ${file}`);
      }
    } catch (error) {
      console.log(`  ⚠ Skills restore failed: ${error.message}`);
    }
  }
  
  // Restore config
  if (shouldRestore('config')) {
    console.log('\n⚙️ Restoring config...');
    
    for (const configFile of manifest.components.config?.files || []) {
      try {
        const srcPath = path.join(backupDir, configFile.file);
        const destPath = path.join(OPENCLAW_DIR, configFile.file);
        
        await fs.copyFile(srcPath, destPath);
        console.log(`  ✅ ${configFile.file}`);
      } catch {}
    }
  }
  
  // Restore data files
  if (shouldRestore('data')) {
    console.log('\n📁 Restoring data files...');
    const dataBackupDir = path.join(backupDir, 'data');
    
    try {
      const files = await fs.readdir(dataBackupDir);
      
      for (const file of files) {
        const srcPath = path.join(dataBackupDir, file);
        const destPath = path.join(DATA_DIR, file);
        
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.copyFile(srcPath, destPath);
        console.log(`  ✅ ${file}`);
      }
    } catch {}
  }
  
  // Note: Contacts/Opportunities must be restored via GHL API (not implemented here)
  if (shouldRestore('contacts') || shouldRestore('opportunities')) {
    console.log('\n⚠️ Contact/Opportunity restore requires GHL API import.');
    console.log('   Export files are available in the backup directory.');
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Restore complete');
  console.log('');
  
  return true;
}

/**
 * Verify backup integrity
 */
async function verifyBackup(backupDate) {
  const backupDir = path.join(BACKUP_DIR, backupDate);
  
  console.log('\n🔍 VERIFYING BACKUP INTEGRITY\n');
  console.log(`Backup: ${backupDate}\n`);
  
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(backupDir, 'backup-manifest.json'), 'utf8')
    );
    
    let passed = 0;
    let failed = 0;
    
    // Verify contacts
    if (manifest.components.contacts?.checksum) {
      const currentChecksum = await calculateChecksum(path.join(backupDir, 'contacts.json'));
      if (currentChecksum === manifest.components.contacts.checksum) {
        console.log('  ✅ contacts.json - checksum verified');
        passed++;
      } else {
        console.log('  ❌ contacts.json - checksum mismatch');
        failed++;
      }
    }
    
    // Verify opportunities
    if (manifest.components.opportunities?.checksum) {
      const currentChecksum = await calculateChecksum(path.join(backupDir, 'opportunities.json'));
      if (currentChecksum === manifest.components.opportunities.checksum) {
        console.log('  ✅ opportunities.json - checksum verified');
        passed++;
      } else {
        console.log('  ❌ opportunities.json - checksum mismatch');
        failed++;
      }
    }
    
    // Verify skills
    for (const skill of manifest.components.skills?.skills || []) {
      const currentChecksum = await calculateChecksum(path.join(backupDir, 'skills', skill.name));
      if (currentChecksum === skill.checksum) {
        console.log(`  ✅ skills/${skill.name} - checksum verified`);
        passed++;
      } else {
        console.log(`  ❌ skills/${skill.name} - checksum mismatch`);
        failed++;
      }
    }
    
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    
    return failed === 0;
    
  } catch (error) {
    console.error(`❌ Verification failed: ${error.message}`);
    return false;
  }
}

/**
 * Cleanup old backups
 */
async function cleanupOldBackups() {
  console.log('\n🧹 Cleaning up old backups...\n');
  
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const backups = entries.sort().reverse();
    
    // Keep only MAX_BACKUPS
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      
      for (const backup of toDelete) {
        const backupPath = path.join(BACKUP_DIR, backup);
        await fs.rm(backupPath, { recursive: true });
        console.log(`  🗑️ Deleted: ${backup}`);
      }
      
      console.log(`  Removed ${toDelete.length} old backups`);
    } else {
      console.log('  No cleanup needed');
    }
    
  } catch {}
}

// CLI Interface
const [,, command, ...args] = process.argv;

switch (command) {
  case 'backup':
  case 'run':
    runFullBackup();
    break;
    
  case 'list':
    listBackups();
    break;
    
  case 'restore':
    if (!args[0]) {
      console.log('Usage: backup-manager.mjs restore <date> [components]');
      console.log('Components: all, skills, config, data');
    } else {
      restoreFromBackup(args[0], args.slice(1).length > 0 ? args.slice(1) : ['all']);
    }
    break;
    
  case 'verify':
    if (!args[0]) {
      console.log('Usage: backup-manager.mjs verify <date>');
    } else {
      verifyBackup(args[0]);
    }
    break;
    
  case 'cleanup':
    cleanupOldBackups();
    break;
    
  default:
    console.log(`
Backup & Disaster Recovery Manager

Usage:
  backup-manager.mjs backup             - Run full backup
  backup-manager.mjs list               - List available backups
  backup-manager.mjs restore <date> [components] - Restore from backup
  backup-manager.mjs verify <date>      - Verify backup integrity
  backup-manager.mjs cleanup            - Remove old backups

Components for restore:
  all       - Everything (default)
  skills    - Skill modules only
  config    - Configuration files only
  data      - Data files only

Examples:
  backup-manager.mjs backup
  backup-manager.mjs restore 2026-03-11 skills config
  backup-manager.mjs verify 2026-03-11
`);
}

export { runFullBackup, restoreFromBackup, verifyBackup, listBackups };
