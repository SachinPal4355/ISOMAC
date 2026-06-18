/**
 * authAudit.routes.js — Auth Audit Log API
 * super_admin: sees all logs globally
 * admin/company_admin: sees only their tenant's logs
 */
const express      = require('express');
const AuthAuditLog = require('../models/AuthAuditLog');
const User         = require('../models/User');
const { requireAuth, requireRole, normaliseRole } = require('../middleware/auth');

const router = express.Router();

// GET /auth/audit-logs — tenant-scoped for non-super_admin
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const role  = normaliseRole(req.authUser.role);
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const filter = {};

    // Non-super_admin: scope to users in their tenant only
    if (role !== 'super_admin' && req.authUser.tenantId) {
      const tenantUserIds = await User.find(
        { tenantId: req.authUser.tenantId, isDeleted: { $ne: true } },
        '_id'
      ).lean().then(users => users.map(u => u._id));
      filter.userId = { $in: tenantUserIds };
    }

    if (req.query.userId)   filter.userId   = req.query.userId;
    if (req.query.username) filter.username = { $regex: req.query.username, $options: 'i' };
    if (req.query.action)   filter.action   = req.query.action;
    if (req.query.success !== undefined) filter.success = req.query.success === 'true';
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      AuthAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuthAuditLog.countDocuments(filter),
    ]);

    res.json({ data: logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /auth/audit-logs/actions — distinct action types (tenant-scoped)
router.get('/actions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const role = normaliseRole(req.authUser.role);
    // Build the same userId filter used in the main GET
    const filter = {};
    if (role !== 'super_admin' && req.authUser.tenantId) {
      const tenantUserIds = await User.find(
        { tenantId: req.authUser.tenantId, isDeleted: { $ne: true } },
        '_id'
      ).lean().then(users => users.map(u => u._id));
      filter.userId = { $in: tenantUserIds };
    }
    const actions = await AuthAuditLog.distinct('action', filter);
    res.json({ data: actions.sort() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
