const express = require('express');
const Region  = require('../models/Region');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    // System regions (tenantId: null) are visible to all; tenant regions only to their tenant
    const filter = Object.keys(req.tenantFilter).length
      ? { $or: [{ tenantId: null }, req.tenantFilter] }
      : {};
    const regions = await Region.find(filter).sort({ name: 1 });
    res.json({ message: 'OK', data: regions });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { name, departments } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const region = new Region({ name, departments, tenantId: req.tenantId || null });
    await region.save();
    res.status(201).json({ message: 'Region created', data: region });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: 'name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
