const express = require('express');
const DynamicField = require('../models/DynamicField');
const Asset        = require('../models/Asset');
const Employee     = require('../models/Employee');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Count how many documents have a non-empty value for a given customField key.
 * Works for both Asset and Employee (both use Map<String> customFields).
 */
async function countFieldUsage(entityType, fieldName) {
  const Model = entityType === 'asset' ? Asset : Employee;
  const key = `customFields.${fieldName}`;
  return Model.countDocuments({ [key]: { $exists: true, $ne: '' } });
}

// ─── GET /dynamic-fields/schema ───────────────────────────────────────────────
// Returns system-default fields (tenantId: null) + caller's tenant-specific fields.
router.get('/schema', requireAuth, async (req, res) => {
  try {
    const role     = req.authUser?.role;
    const tenantId = req.authUser?.tenantId || null;

    const filter = { isDeleted: { $ne: true } };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.category !== undefined) filter.category = req.query.category;

    // super_admin sees all; others see system defaults + their tenant's fields
    if (role !== 'super_admin') {
      filter.$or = [{ tenantId: null }, { tenantId }];
    }

    const fields = await DynamicField.find(filter, 'name label type required isFixed group options fieldVersion').sort({ order: 1 });
    res.json({ message: 'OK', data: fields });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /dynamic-fields ──────────────────────────────────────────────────────
// Returns system-default fields (tenantId: null) + caller's tenant-specific fields.
router.get('/', requireAuth, async (req, res) => {
  try {
    const role     = req.authUser?.role;
    const tenantId = req.authUser?.tenantId || null;

    const filter = { isDeleted: { $ne: true } };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.category !== undefined) filter.category = req.query.category;

    // super_admin sees all; others see system defaults + their tenant's fields
    if (role !== 'super_admin') {
      filter.$or = [{ tenantId: null }, { tenantId }];
    }

    const fields = await DynamicField.find(filter).sort({ order: 1 });
    res.json({ message: 'OK', data: fields });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /dynamic-fields/:id/usage ───────────────────────────────────────────
/**
 * Returns how many records currently have data for this field.
 * Used by the UI to show a warning before delete or type change.
 */
router.get('/:id/usage', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const tenantId = req.authUser?.tenantId || null;
    const role     = req.authUser?.role;
    const fieldFilter = role === 'super_admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, $or: [{ tenantId: null }, { tenantId }] };

    const field = await DynamicField.findOne(fieldFilter);
    if (!field) return res.status(404).json({ message: 'Not found' });
    if (field.isFixed) return res.json({ count: 0, message: 'Fixed field — usage not tracked' });
    const count = await countFieldUsage(field.entityType, field.name);
    res.json({ count, fieldName: field.name, label: field.label });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /dynamic-fields ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { entityType, category, name, label, type, required, visible, order, options, group, editableBy } = req.body;
    if (!entityType) return res.status(400).json({ message: 'entityType required' });
    if (!name)       return res.status(400).json({ message: 'name required' });
    if (!label)      return res.status(400).json({ message: 'label required' });

    // Auto-compute order as max(existing) + 1 if not provided
    let resolvedOrder = order;
    if (resolvedOrder === undefined || resolvedOrder === null) {
      const last = await DynamicField.findOne({ entityType, category: category || '', isDeleted: { $ne: true } }).sort({ order: -1 }).select('order');
      resolvedOrder = last ? last.order + 1 : 1;
    }

    const field = new DynamicField({
      entityType,
      category:   category || '',
      name, label, type, required, visible,
      order:      resolvedOrder,
      options:    options    || [],
      group:      group      || '',
      editableBy: editableBy || 'all',
      isFixed:    false,
      fieldVersion: 1,
      // Tenant-specific fields are scoped to the creator's tenant.
      // System-default fields (seeded on boot) have tenantId: null.
      tenantId:   req.authUser?.tenantId || null,
    });
    await field.save();
    res.status(201).json({ message: 'Field created', data: field });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Field name already exists for this entity/category' });
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /dynamic-fields/:id ──────────────────────────────────────────────────
router.put('/:id', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const tenantId = req.authUser?.tenantId || null;
    const role     = req.authUser?.role;
    const fieldFilter = role === 'super_admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, $or: [{ tenantId: null }, { tenantId }] };

    const field = await DynamicField.findOne(fieldFilter);
    if (!field) return res.status(404).json({ message: 'Not found' });
    if (field.isDeleted) return res.status(410).json({ message: 'Field has been deleted' });

    // Strip protected fields from update payload
    const { isFixed: _f, entityType: _e, category: _c, isDeleted: _d, deletedAt: _da, ...updates } = req.body;

    // Fixed fields cannot be renamed
    if (field.isFixed) delete updates.name;

    // Enforce editableBy permission
    const userRole = req.session?.user?.role;
    if (field.editableBy === 'admin' && userRole !== 'admin') {
      return res.status(403).json({ message: 'Only admins can edit this field' });
    }
    if (field.editableBy === 'editor' && !['admin', 'editor'].includes(userRole)) {
      return res.status(403).json({ message: 'Insufficient permissions to edit this field' });
    }

    // Type change guard: if type is changing and field has existing data, block unless forced
    if (updates.type && updates.type !== field.type && !field.isFixed) {
      const usageCount = await countFieldUsage(field.entityType, field.name);
      if (usageCount > 0 && !req.body.forceTypeChange) {
        return res.status(409).json({
          message: `Cannot change type: ${usageCount} record(s) have data in this field. Pass forceTypeChange=true to override.`,
          usageCount,
          code: 'TYPE_CHANGE_BLOCKED',
        });
      }
      // Record previous type for audit trail
      updates.previousType = field.type;
    }

    // Bump fieldVersion on any meaningful schema change
    const schemaChanging = updates.type || updates.name || updates.required !== undefined;
    if (schemaChanging) updates.fieldVersion = (field.fieldVersion || 1) + 1;

    Object.assign(field, updates);
    await field.save();
    res.json({ message: 'Field updated', data: field });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Field name already exists for this entity/category' });
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /dynamic-fields/:id ───────────────────────────────────────────────
/**
 * Soft-delete: marks isDeleted=true, sets deletedAt.
 * Hard-delete is blocked — data integrity must be preserved.
 * Pass ?force=true to hard-delete (admin only, only when usageCount === 0).
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const tenantId = req.authUser?.tenantId || null;
    const role     = req.authUser?.role;
    const fieldFilter = role === 'super_admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, $or: [{ tenantId: null }, { tenantId }] };

    const field = await DynamicField.findOne(fieldFilter);
    if (!field) return res.status(404).json({ message: 'Not found' });
    if (field.isFixed) return res.status(403).json({ message: 'Cannot delete a fixed field' });
    if (field.isDeleted) return res.json({ message: 'Field already deleted' });

    // Always check usage before any delete
    const usageCount = await countFieldUsage(field.entityType, field.name);

    if (req.query.force === 'true') {
      // Hard delete only allowed when no data exists
      if (usageCount > 0) {
        return res.status(409).json({
          message: `Cannot hard-delete: ${usageCount} record(s) still have data in this field. Soft-delete instead.`,
          usageCount,
          code: 'DELETE_BLOCKED',
        });
      }
      await field.deleteOne();
      return res.json({ message: 'Field permanently deleted', hardDeleted: true });
    }

    // Soft delete — always safe
    field.isDeleted = true;
    field.deletedAt = new Date();
    field.visible   = false;
    await field.save();
    res.json({ message: 'Field soft-deleted', usageCount, softDeleted: true });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /dynamic-fields/admin/clean ────────────────────────────────────────
/**
 * Removes orphaned customField keys from all entity documents.
 * Orphaned = key exists in document but has no active DynamicField definition.
 * Admin-only maintenance endpoint.
 */
router.post('/admin/clean', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { cleanCustomFields } = require('../services/fieldEngine');
    const { entityType, category } = req.body;
    if (!entityType) return res.status(400).json({ message: 'entityType required' });

    const result = await cleanCustomFields(entityType, category || '', req.authUser?.tenantId || null);
    res.json({
      message: `Cleaned ${result.cleaned} document(s)`,
      cleaned: result.cleaned,
      removedKeys: result.removed,
    });
  } catch (e) {
    console.error('[admin/clean]', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
