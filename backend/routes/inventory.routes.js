/**
 * Inventory routes — COMPATIBILITY SHIM
 *
 * Inventory has been unified into Assets. These routes return empty/stub
 * responses so any legacy callers don't crash. The real data lives in /assets.
 *
 * Migration: POST /assets/migrate-from-inventory (admin only)
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Return empty array — data now lives in /assets
router.get('/', requireAuth, (_req, res) => {
  res.json([]);
});

// Stub — no new inventory records should be created
router.post('/', requireAuth, (_req, res) => {
  res.status(410).json({ message: 'Inventory module removed. Use /assets instead.' });
});

router.put('/:serialno', requireAuth, (_req, res) => {
  res.status(410).json({ message: 'Inventory module removed. Use /assets instead.' });
});

module.exports = router;
