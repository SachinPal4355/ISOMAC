const express    = require('express');
const mongoose   = require('mongoose');
const Assignment = require('../models/Assignment');
const Asset      = require('../models/Asset');
const User       = require('../models/User');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET all assignments — scoped to tenant
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const filter = { ...req.tenantFilter };
    if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip  = (page - 1) * limit;

    const [assignments, total] = await Promise.all([
      Assignment.find(filter)
        .populate('asset',      'assetTag name category')
        .populate('assignedTo', 'username fullName email')
        .populate('assignedBy', 'username')
        .sort({ assignedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(filter),
    ]);
    res.json({ data: assignments, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST assign asset to user — tenant-scoped, transactional
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { assetId, userId, notes } = req.body;
    if (!assetId || !userId) return res.status(400).json({ message: 'assetId and userId required' });

    // Verify asset belongs to this tenant
    const asset = await Asset.findOne({ _id: assetId, ...req.tenantFilter });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (asset.status === 'Assigned') return res.status(409).json({ message: 'Asset already assigned' });

    // Verify target user belongs to this tenant
    const user = await User.findOne({ _id: userId, tenantId: req.tenantId, isDeleted: { $ne: true } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Resolve assignedBy from authUser directly — no extra DB call needed
    const assignedByUser = await User.findOne({ _id: req.authUser._id, isDeleted: { $ne: true } });
    if (!assignedByUser) return res.status(404).json({ message: 'Caller not found' });

    let assignment;
    const txSupported = await supportsTransactions();

    const doWrites = async (session) => {
      [assignment] = await Assignment.create([{
        asset:      assetId,
        assignedTo: userId,
        assignedBy: assignedByUser._id,
        notes:      notes || '',
        tenantId:   req.tenantId || null,
        createdBy:  req.authUser._id || null,
      }], { session });

      await Asset.findByIdAndUpdate(
        assetId,
        { $set: { status: 'Assigned', assignedTo: userId } },
        { session }
      );
    };

    if (txSupported) {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(() => doWrites(dbSession));
      } finally {
        dbSession.endSession();
      }
    } else {
      await doWrites(null);
    }

    res.status(201).json({ message: 'Asset assigned', assignment });
  } catch (err) {
    console.error('❌ Assignment error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT return asset — tenant-scoped, transactional
router.put('/:id/return', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    // Verify assignment belongs to this tenant
    const assignment = await Assignment.findOne({ _id: req.params.id, ...req.tenantFilter }).populate('asset');
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.status === 'Returned') return res.status(400).json({ message: 'Already returned' });

    const txSupported = await supportsTransactions();

    const doReturn = async (session) => {
      assignment.status     = 'Returned';
      assignment.returnedAt = new Date();
      await assignment.save({ session });
      await Asset.findByIdAndUpdate(
        assignment.asset._id,
        { $set: { status: 'Available', assignedTo: null } },
        { session }
      );
    };

    if (txSupported) {
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(() => doReturn(dbSession));
      } finally {
        dbSession.endSession();
      }
    } else {
      await doReturn(null);
    }

    res.json({ message: 'Asset returned', assignment });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

async function supportsTransactions() {
  try {
    const info = await mongoose.connection.db.admin().command({ isMaster: 1 });
    return !!(info.setName || info.msg === 'isdbgrid');
  } catch { return false; }
}

module.exports = router;
