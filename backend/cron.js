/**
 * cron.js — Dedicated single-process cron runner
 *
 * This process is intentionally separate from server.js.
 * PM2 runs this with instances: 1, exec_mode: 'fork' — guaranteed single execution.
 * Never import this into server.js.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { startAlertCron }  = require('./jobs/alertCron');
const { startBackupCron } = require('./jobs/backupCron');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[cron] ❌ MONGO_URI not set. Exiting.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 5,
})
.then(() => {
  console.log('[cron] ✅ MongoDB connected');
  startAlertCron();
  startBackupCron();
})
.catch(err => {
  console.error('[cron] ❌ MongoDB connection failed:', err.message);
  process.exit(1);
});

mongoose.connection.on('disconnected', () => console.warn('[cron] 🟡 MongoDB disconnected'));
mongoose.connection.on('error', err => console.error('[cron] 🔴 MongoDB error:', err.message));

function shutdown(signal) {
  console.log(`[cron] 🔻 ${signal} — shutting down`);
  mongoose.disconnect().finally(() => process.exit(0));
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
