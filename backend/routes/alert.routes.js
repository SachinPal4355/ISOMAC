const express = require('express');
const router  = express.Router();
const Alert   = require('../models/Alert');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');
const { runAllChecks } = require('../services/alert.service');

// GET /alerts — scoped to tenant
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const filter = { ...req.tenantFilter };
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    const alerts = await Alert.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('assetId', 'name assetTag')
      .lean();
    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /alerts/unread-count — scoped to tenant
router.get('/unread-count', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const count = await Alert.countDocuments({ ...req.tenantFilter, status: 'unread' });
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /alerts/read-all — scoped to tenant (must be before /:id routes)
router.put('/read-all', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    await Alert.updateMany({ ...req.tenantFilter, status: 'unread' }, { status: 'read' });
    res.json({ success: true, message: 'All alerts marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /alerts/:id/read — scoped to tenant
router.put('/:id/read', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      { status: 'read' },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /alerts/:id — scoped to tenant
router.delete('/:id', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    await Alert.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    res.json({ success: true, message: 'Alert deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /alerts/run-checks — admin only, scoped to tenant
router.post('/run-checks', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    // Pass the caller's tenantId so manual runs only affect their tenant
    await runAllChecks({ ...req.body, tenantId: req.authUser.tenantId || undefined });
    res.json({ success: true, message: 'Alert checks completed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
