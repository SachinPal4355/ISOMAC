const express  = require('express');
const Location = require('../models/Location');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

// GET /locations — tenant-scoped
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const locs = await Location.find({ ...req.tenantFilter }).populate('parent', 'name').sort({ name: 1 });
    res.json(locs);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// POST /locations — stamp tenantId
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const loc = new Location({
      ...req.body,
      tenantId:  req.tenantId || null,
      createdBy: req.authUser._id || null,
      domain:   req.authUser.domain || null, // legacy
    });
    await loc.save();
    res.status(201).json({ message: 'Location created', location: loc });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// PUT /locations/:id — tenant-scoped update
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const loc = await Location.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      req.body,
      { new: true }
    );
    if (!loc) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated', location: loc });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /locations/:id — tenant-scoped delete
router.delete('/:id', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const loc = await Location.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!loc) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
