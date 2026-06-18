/**
 * assetCategoryField.routes.js — DEPRECATED SHIM
 *
 * This route is superseded by /dynamic-fields which is fully tenant-scoped.
 * All endpoints return 410 Gone to force callers to migrate.
 * The AssetCategoryField model has no tenantId and must not be used for new data.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const GONE = (_req, res) =>
  res.status(410).json({ message: 'This endpoint is deprecated. Use /dynamic-fields instead.' });

router.get('/',    requireAuth, GONE);
router.post('/',   requireAuth, GONE);
router.put('/:id', requireAuth, GONE);
router.delete('/:id', requireAuth, GONE);

module.exports = router;
