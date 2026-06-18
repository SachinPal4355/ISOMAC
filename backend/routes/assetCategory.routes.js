const express     = require('express');
const AssetCategory = require('../models/AssetCategory');
const Asset         = require('../models/Asset');
const DynamicField  = require('../models/DynamicField');
const { requireAuth, requireRole, enforceTenantScope, normaliseRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET /asset-categories ────────────────────────────────────────────────────
// Returns system-default categories (tenantId: null) + tenant-specific categories.
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const role     = normaliseRole(req.authUser?.role);
    const tenantId = req.authUser?.tenantId || null;

    const filter = { isActive: true };
    if (role !== 'super_admin') {
      // System defaults (null) + this tenant's custom categories
      filter.$or = [{ tenantId: null }, { tenantId }];
    }
    if (req.query.type) filter.type = req.query.type;

    const cats = await AssetCategory.find(filter).sort({ name: 1 });
    res.json({
      data:                cats,
      assetCategories:     cats.filter(c => c.type === 'asset'),
      accessoryCategories: cats.filter(c => c.type === 'accessory'),
    });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /asset-categories ───────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Category name is required' });
    if (!type || !['asset', 'accessory'].includes(type)) return res.status(400).json({ message: 'type must be "asset" or "accessory"' });

    const tenantId = req.authUser?.tenantId || null;
    const role     = normaliseRole(req.authUser?.role);

    // Check for duplicate within this tenant's scope (system + tenant)
    const dupFilter = {
      name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      type,
      isActive: true,
    };
    if (role !== 'super_admin') {
      dupFilter.$or = [{ tenantId: null }, { tenantId }];
    }
    const exists = await AssetCategory.findOne(dupFilter);
    if (exists) return res.status(409).json({ message: `Category "${name}" already exists for type "${type}"` });

    const cat = new AssetCategory({
      name:      name.trim(),
      type,
      icon:      '',
      createdBy: req.authUser._id,
      tenantId:  tenantId,   // stamp tenant — null for super_admin (system default)
    });
    await cat.save();
    res.status(201).json({ message: 'Category created', data: cat });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Category already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /asset-categories/:id ────────────────────────────────────────────────
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { name } = req.body;
    const tenantId = req.authUser?.tenantId || null;
    const role     = normaliseRole(req.authUser?.role);

    // Only allow editing categories that belong to this tenant (or system if super_admin)
    const catFilter = role === 'super_admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, $or: [{ tenantId: null }, { tenantId }] };

    const cat = await AssetCategory.findOne(catFilter);
    if (!cat) return res.status(404).json({ message: 'Category not found' });

    if (name && name.trim() !== cat.name) {
      const dupFilter = {
        _id:  { $ne: cat._id },
        name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        type: cat.type,
        isActive: true,
      };
      if (role !== 'super_admin') {
        dupFilter.$or = [{ tenantId: null }, { tenantId }];
      }
      const exists = await AssetCategory.findOne(dupFilter);
      if (exists) return res.status(409).json({ message: `Category "${name}" already exists` });

      const oldName = cat.name;
      cat.name = name.trim();

      // Cascade rename — scoped to this tenant's data
      const tenantScope = role === 'super_admin' ? {} : { tenantId };
      await DynamicField.updateMany({ category: oldName, ...tenantScope }, { category: cat.name });
      await Asset.updateMany({ category: oldName, ...tenantScope }, { category: cat.name });
    }
    await cat.save();
    res.json({ message: 'Category updated', data: cat });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /asset-categories/:id ─────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const tenantId = req.authUser?.tenantId || null;
    const role     = normaliseRole(req.authUser?.role);

    const catFilter = role === 'super_admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, $or: [{ tenantId: null }, { tenantId }] };

    const cat = await AssetCategory.findOne(catFilter);
    if (!cat) return res.status(404).json({ message: 'Category not found' });

    // Count usage scoped to this tenant
    const tenantScope = role === 'super_admin' ? {} : { tenantId };
    const inUse = await Asset.countDocuments({ category: cat.name, ...tenantScope });
    if (inUse > 0) {
      return res.status(409).json({
        message: `Cannot delete — ${inUse} record${inUse > 1 ? 's' : ''} use this category. Reassign them first.`,
      });
    }

    cat.isActive = false;
    await cat.save();
    res.json({ message: 'Category deleted' });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
