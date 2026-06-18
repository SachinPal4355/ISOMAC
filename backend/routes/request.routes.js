/**
 * request.routes.js — Employee request workflow
 * Fully migrated to tenantId-based isolation.
 */
const express  = require('express');
const Request  = require('../models/Request');
const { requireAuth, requireRole, enforceTenantScope, normaliseRole } = require('../middleware/auth');

const router = express.Router();

// POST /requests — employee creates a request, stamped with tenantId
router.post('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'title is required' });

    const request = await Request.create({
      title:       title.trim(),
      description: description || '',
      requestedBy: req.authUser._id,
      tenantId:    req.tenantId || null,
      domain:      req.authUser.domain || null, // legacy
    });

    res.status(201).json({ message: 'Request submitted', data: request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /requests — tenant-scoped; employee sees own only
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const role   = normaliseRole(req.authUser.role);
    const filter = { ...req.tenantFilter };

    if (role === 'employee') {
      filter.requestedBy = req.authUser._id;
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    if (req.query.status) filter.status = req.query.status;

    const [requests, total] = await Promise.all([
      Request.find(filter)
        .populate('requestedBy', 'username fullName email')
        .populate('assignedTo',  'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Request.countDocuments(filter),
    ]);

    res.json({ data: requests, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /requests/:id — approve or reject, tenant-scoped
router.patch('/:id', requireAuth, enforceTenantScope, requireRole('editor'), async (req, res) => {
  try {
    const { status, rejectionReason, assignedTo } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be "approved" or "rejected"' });
    }

    const request = await Request.findOne({ _id: req.params.id, ...req.tenantFilter });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ message: `Request is already ${request.status}` });
    }

    request.status          = status;
    request.assignedTo      = assignedTo || req.authUser._id;
    request.rejectionReason = status === 'rejected' ? (rejectionReason || '') : '';
    await request.save();

    res.json({ message: `Request ${status}`, data: request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /requests/:id — tenant-scoped single request
router.get('/:id', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const role   = normaliseRole(req.authUser.role);
    const filter = { _id: req.params.id, ...req.tenantFilter };
    if (role === 'employee') filter.requestedBy = req.authUser._id;

    const request = await Request.findOne(filter)
      .populate('requestedBy', 'username fullName email')
      .populate('assignedTo',  'username fullName')
      .lean();

    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json({ data: request });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
