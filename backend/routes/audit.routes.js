const express  = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, normaliseRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET /audit — tenant-scoped audit logs
// FIXED: was filtering by organizationId which doesn't exist on AuditLog schema
//        → all tenants' logs were visible to any admin (data leak)
router.get('/', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const role  = normaliseRole(req.authUser.role);
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    const skip  = (page - 1) * limit;

    // super_admin sees all; everyone else is scoped to their tenant
    const filter = role === 'super_admin' ? {} : { ...req.tenantFilter };
    if (req.query.entity) filter.entity = req.query.entity;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ data: logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
