/**
 * organization.routes.js — Organization management
 *
 * Only super_admin can create/list organizations.
 * company_admin can view their own organization.
 */
const express      = require('express');
const Organization = require('../models/Organization');
const User         = require('../models/User');
const { requireAuth, requireRole, normaliseRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET /organizations — super_admin: all orgs; others: own org ──────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const role = normaliseRole(req.authUser.role);
    if (role === 'super_admin') {
      const orgs = await Organization.find({ isActive: true }).sort({ name: 1 }).lean();
      return res.json({ data: orgs });
    }
    // Non-super_admin: return their own org only
    if (!req.authUser.organizationId) {
      return res.json({ data: [] });
    }
    const org = await Organization.findById(req.authUser.organizationId).lean();
    return res.json({ data: org ? [org] : [] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /organizations — super_admin only ───────────────────────────────────
router.post('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Organization name is required' });

    const exists = await Organization.findOne({ name: name.trim() });
    if (exists) return res.status(409).json({ message: 'Organization name already exists' });

    const org = await Organization.create({ name: name.trim(), createdBy: req.authUser._id });
    console.log(`[org] ✅ Created "${org.name}" by ${req.authUser.username}`);
    res.status(201).json({ message: 'Organization created', data: org });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /organizations/:id/assign-admin — assign company_admin ──────────────
// super_admin assigns a user as company_admin for an org.
// Enforces: only ONE company_admin per organization.
router.post('/:id/assign-admin', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId required' });

    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });

    // Enforce: only one company_admin per org
    const existingAdmin = await User.findOne({
      organizationId: org._id,
      role: 'company_admin',
      isDeleted: { $ne: true },
    });
    if (existingAdmin) {
      return res.status(409).json({
        message: `Organization already has a company_admin: "${existingAdmin.username}". Remove them first.`,
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, isDeleted: { $ne: true } },
      { $set: { role: 'company_admin', organizationId: org._id }, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    console.log(`[org] ✅ "${user.username}" assigned as company_admin of "${org.name}"`);
    res.json({ message: `"${user.username}" is now company_admin of "${org.name}"`, data: { user: { _id: user._id, username: user.username, role: user.role }, org } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /organizations/:id/users — list users in an org ─────────────────────
router.get('/:id/users', requireAuth, requireRole('company_admin'), async (req, res) => {
  try {
    const role = normaliseRole(req.authUser.role);
    // company_admin can only see their own org
    if (role !== 'super_admin' && String(req.authUser.organizationId) !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const users = await User.find(
      { organizationId: req.params.id, isDeleted: { $ne: true } },
      'username fullName email role department createdAt isGoogleUser managerId'
    ).sort({ username: 1 });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
