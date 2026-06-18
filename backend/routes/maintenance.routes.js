const express        = require('express');
const MaintenanceLog = require('../models/MaintenanceLog');
const User           = require('../models/User');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET all maintenance logs — scoped to tenant
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const filter = { ...req.tenantFilter };
    if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
    if (req.query.type   && req.query.type   !== 'All') filter.type   = req.query.type;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      MaintenanceLog.find(filter)
        .populate('asset',    'assetTag name category')
        .populate('loggedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MaintenanceLog.countDocuments(filter),
    ]);
    res.json({ data: logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create maintenance log — stamp tenantId
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { asset, type, description } = req.body;
    if (!asset || !type || !description) return res.status(400).json({ message: 'asset, type, description required' });

    const loggedByUser = await User.findOne({ _id: req.authUser._id, isDeleted: { $ne: true } });
    const log = new MaintenanceLog({
      ...req.body,
      loggedBy:  loggedByUser?._id,
      tenantId:  req.tenantId || null,
      createdBy: req.authUser._id || null,
      domain:    req.authUser.domain || null,
    });
    await log.save();
    res.status(201).json({ message: 'Maintenance log created', log });
  } catch (err) {
    console.error('❌ Maintenance log error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update maintenance log status — scoped to tenant
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const log = await MaintenanceLog.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      req.body,
      { new: true }
    );
    if (!log) return res.status(404).json({ message: 'Log not found' });
    res.json({ message: 'Log updated', log });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
