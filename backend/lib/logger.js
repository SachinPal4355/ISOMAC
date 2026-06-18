/**
 * logger.js — Structured JSON logger (pino)
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info({ userId, action }, 'User logged in');
 *   logger.error({ err }, 'Import failed');
 *
 * Install: npm install pino pino-pretty
 *
 * In production, pipe output to a log aggregator:
 *   pm2 logs | pino-pretty          (local dev)
 *   pm2 logs → CloudWatch/Datadog   (production)
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: {
    service: 'isomac-api',
    env:     process.env.NODE_ENV || 'development',
    pid:     process.pid,
    worker:  process.env.pm_id || 'standalone',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pino-pretty for human-readable output
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  }),
});

module.exports = logger;
