const express         = require('express');
const SoftwareLicense = require('../models/SoftwareLicense');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET all licenses — scoped to tenant
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const filter = { ...req.tenantFilter };
    if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip  = (page - 1) * limit;

    const [licenses, total] = await Promise.all([
      SoftwareLicense.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SoftwareLicense.countDocuments(filter),
    ]);
    res.json({ data: licenses, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create license — stamp tenantId
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { softwareName } = req.body;
    if (!softwareName) return res.status(400).json({ message: 'softwareName required' });

    const license = new SoftwareLicense({
      ...req.body,
      tenantId:  req.tenantId || null,
      createdBy: req.authUser._id || null,
      domain:   req.authUser.domain || null, // legacy
    });
    await license.save();
    res.status(201).json({ message: 'License created', license });
  } catch (err) {
    console.error('❌ License error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update license — scoped to tenant
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const license = await SoftwareLicense.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      req.body,
      { new: true }
    );
    if (!license) return res.status(404).json({ message: 'License not found' });
    res.json({ message: 'License updated', license });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE license — scoped to tenant
router.delete('/:id', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const license = await SoftwareLicense.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!license) return res.status(404).json({ message: 'License not found' });
    res.json({ message: 'License deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
