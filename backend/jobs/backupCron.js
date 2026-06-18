/**
 * backupCron.js — Schedules daily MongoDB backup at 02:00 AM
 *
 * Runs the backup script in a child process so it doesn't block
 * the main Express event loop.
 */
const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');

function startBackupCron() {
  // Daily at 02:00 AM server time
  cron.schedule('0 2 * * *', () => {
    console.log('[backup-cron] Starting scheduled backup...');
    const child = spawn(
      process.execPath, // node binary
      [path.join(__dirname, '..', 'scripts', 'backup.js')],
      { stdio: 'inherit', env: process.env }
    );
    child.on('close', code => {
      if (code === 0) console.log('[backup-cron] ✅ Backup completed');
      else            console.error(`[backup-cron] ❌ Backup exited with code ${code}`);
    });
  });

  console.log('[backup-cron] ✅ Scheduled daily at 02:00 AM');
}

module.exports = { startBackupCron };
