#!/usr/bin/env node
/**
 * backup.js — MongoDB backup script
 *
 * Runs mongodump and stores the output in ./backups/YYYY-MM-DD/
 * Automatically deletes backups older than BACKUP_RETAIN_DAYS (default 7).
 *
 * Usage:
 *   node scripts/backup.js
 *
 * Schedule with node-cron (see jobs/backupCron.js) or OS cron:
 *   0 2 * * * cd /path/to/backend && node scripts/backup.js >> logs/backup.log 2>&1
 *
 * Environment variables:
 *   MONGO_URI           — MongoDB connection string (required)
 *   BACKUP_RETAIN_DAYS  — how many days of backups to keep (default 7)
 *   BACKUP_DIR          — override backup directory (default ./backups)
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');

const MONGO_URI    = process.env.MONGO_URI;
const RETAIN_DAYS  = parseInt(process.env.BACKUP_RETAIN_DAYS || '7');
const BACKUP_ROOT  = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

if (!MONGO_URI) {
  console.error('[backup] ❌ MONGO_URI not set');
  process.exit(1);
}

// ── Create dated backup directory ─────────────────────────────────────────────
const today     = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const backupDir = path.join(BACKUP_ROOT, today);
fs.mkdirSync(backupDir, { recursive: true });

// ── Run mongodump ─────────────────────────────────────────────────────────────
console.log(`[backup] Starting backup → ${backupDir}`);
const start = Date.now();

try {
  execSync(
    `mongodump --uri="${MONGO_URI}" --out="${backupDir}" --gzip`,
    { stdio: 'inherit' }
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[backup] ✅ Backup complete in ${elapsed}s → ${backupDir}`);
} catch (err) {
  console.error('[backup] ❌ mongodump failed:', err.message);
  process.exit(1);
}

// ── Prune old backups ─────────────────────────────────────────────────────────
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - RETAIN_DAYS);

let pruned = 0;
try {
  const entries = fs.readdirSync(BACKUP_ROOT);
  for (const entry of entries) {
    const entryPath = path.join(BACKUP_ROOT, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory() && stat.mtime < cutoff) {
      fs.rmSync(entryPath, { recursive: true, force: true });
      console.log(`[backup] 🗑  Pruned old backup: ${entry}`);
      pruned++;
    }
  }
  if (pruned === 0) console.log('[backup] No old backups to prune');
} catch (err) {
  console.warn('[backup] ⚠️  Prune failed:', err.message);
}
