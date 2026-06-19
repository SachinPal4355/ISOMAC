const express    = require('express');
const XLSX       = require('xlsx');
const QRCode     = require('qrcode');
const Asset        = require('../models/Asset');
const DynamicField = require('../models/DynamicField');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');
const { castCustomFieldValue } = require('../services/fieldEngine');

const router = express.Router();

const ASSET_CATEGORIES     = ['Laptop', 'MacBook', 'Mac Mini', 'iMac', 'Other'];
const ACCESSORY_CATEGORIES = ['Mouse', 'Keyboard', 'Monitor', 'Headset', 'Docking Station'];

async function typeFromCategory(category, tenantId = null) {
  if (!category) return null;

  // Try querying database AssetCategory
  const AssetCategory = require('../models/AssetCategory');
  try {
    const dbCategory = await AssetCategory.findOne({
      name: { $regex: `^${category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      isActive: true,
      $or: [{ tenantId: null }, { tenantId }]
    }).lean();

    if (dbCategory) {
      return dbCategory.type;
    }
  } catch (err) {
    console.error('Error fetching category type from DB:', err.message);
  }

  // Fallback to defaults
  if (ASSET_CATEGORIES.includes(category))     return 'asset';
  if (ACCESSORY_CATEGORIES.includes(category)) return 'accessory';
  return null;
}

function getRouteType(req) {
  return req.__forcedType || 'asset';
}

const ASSET_EXPORT_KEYS     = ['assetTag','name','category','brand','model','serialno','status','location','purchaseCost','purchaseDate','warrantyExpiry','notes'];
const ACCESSORY_EXPORT_KEYS = ['assetTag','name','category','serialno','location','vendor','status','notes'];

// ─── GET /export — tenant-scoped ──────────────────────────────────────────────
router.get('/export', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { format = 'csv', category, status } = req.query;
    const forcedType  = getRouteType(req);
    const isAccessory = forcedType === 'accessory';

    const filter = { ...req.tenantFilter, type: forcedType, isDeleted: { $ne: true } };
    if (category && category !== 'All') filter.category = category;
    if (status)                         filter.status   = status;

    const assets = await Asset.find(filter).sort({ createdAt: -1 }).lean();
    const FIXED_EXPORT_KEYS = isAccessory ? ACCESSORY_EXPORT_KEYS : ASSET_EXPORT_KEYS;

    let customFieldKeys = [];
    if (!isAccessory) {
      if (category && category !== 'All') {
        const catFields = await DynamicField.find({ entityType: 'asset', category, isFixed: false, visible: true, isDeleted: { $ne: true } }).sort({ order: 1 });
        customFieldKeys = catFields.map(f => f.name);
      } else {
        const categories = [...new Set(assets.map(a => a.category).filter(Boolean))];
        if (categories.length) {
          const allCatFields = await DynamicField.find({ entityType: 'asset', category: { $in: categories }, isFixed: false, visible: true, isDeleted: { $ne: true } }).sort({ order: 1 });
          const seen = new Set();
          allCatFields.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); customFieldKeys.push(f.name); } });
        }
      }
    }

    const allKeys = [...FIXED_EXPORT_KEYS, ...customFieldKeys];
    const rows = assets.map(a => {
      const row = {};
      FIXED_EXPORT_KEYS.forEach(k => {
        if (k === 'purchaseDate' || k === 'warrantyExpiry') {
          row[k] = a[k] ? new Date(a[k]).toISOString().split('T')[0] : '';
        } else if (k === 'vendor') {
          const cf = a.customFields instanceof Map ? Object.fromEntries(a.customFields) : (a.customFields || {});
          row[k] = cf['vendor'] ?? '';
        } else {
          row[k] = a[k] ?? '';
        }
      });
      if (!isAccessory) {
        const cf = a.customFields instanceof Map ? Object.fromEntries(a.customFields) : (a.customFields || {});
        customFieldKeys.forEach(k => { row[k] = cf[k] ?? ''; });
      }
      return row;
    });

    const sheetName = isAccessory ? 'Accessories' : 'Assets';
    const fileName  = isAccessory ? 'accessories_export' : 'assets_export';

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows, { header: allKeys });
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
      return res.send(buf);
    }

    const escape = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
    const csv = '\uFEFF' + [allKeys, ...rows.map(r => allKeys.map(k => escape(r[k])))].map(r => r.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error('[GET /export]', e);
    res.status(500).json({ message: 'Export failed' });
  }
});

// ─── GET / — tenant-scoped list ───────────────────────────────────────────────
router.get('/', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const forcedType = getRouteType(req);
    const filter = { ...req.tenantFilter, type: forcedType, isDeleted: { $ne: true } };
    if (req.query.category && req.query.category !== 'All') filter.category = req.query.category;
    if (req.query.status   && req.query.status   !== 'All') filter.status   = req.query.status;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip  = (page - 1) * limit;

    const [assets, total] = await Promise.all([
      Asset.find(filter)
        .populate('assignedTo', 'username fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Asset.countDocuments(filter),
    ]);
    res.json({ data: assets, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /:id/qr — tenant-scoped ──────────────────────────────────────────────
router.get('/:id/qr', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, ...req.tenantFilter, isDeleted: { $ne: true } }, 'assetTag name').lean();
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const format  = req.query.format || 'png';
    const content = asset.assetTag;

    if (format === 'svg') {
      const svg = await QRCode.toString(content, { type: 'svg', width: 200, margin: 2 });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `inline; filename="${asset.assetTag}.svg"`);
      return res.send(svg);
    }
    if (format === 'dataurl') {
      const dataUrl = await QRCode.toDataURL(content, { width: 300, margin: 2 });
      return res.json({ assetTag: asset.assetTag, name: asset.name, dataUrl });
    }
    const buffer = await QRCode.toBuffer(content, { width: 300, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${asset.assetTag}.png"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[GET /:id/qr]', err.message);
    res.status(500).json({ message: 'QR generation failed' });
  }
});

// ─── POST /qr/bulk — tenant-scoped ────────────────────────────────────────────
router.post('/qr/bulk', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ message: 'ids array required' });
    if (ids.length > 50)
      return res.status(400).json({ message: 'Maximum 50 assets per bulk QR request' });

    const assets = await Asset.find(
      { _id: { $in: ids }, ...req.tenantFilter, isDeleted: { $ne: true } },
      'assetTag name category'
    ).lean();

    const results = await Promise.all(assets.map(async a => ({
      _id:      String(a._id),
      assetTag: a.assetTag,
      name:     a.name,
      category: a.category,
      dataUrl:  await QRCode.toDataURL(a.assetTag, { width: 200, margin: 2 }),
    })));

    res.json({ data: results });
  } catch (err) {
    console.error('[POST /qr/bulk]', err.message);
    res.status(500).json({ message: 'Bulk QR generation failed' });
  }
});

// ─── GET /:id — tenant-scoped ─────────────────────────────────────────────────
router.get('/:id', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, ...req.tenantFilter, isDeleted: { $ne: true } })
      .populate('assignedTo', 'username fullName email');
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST / — stamp tenantId on create ───────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const { assetTag, name, category } = req.body;
    if (!assetTag || !name || !category) return res.status(400).json({ message: 'assetTag, name, category required' });

    const derivedType = await typeFromCategory(category, req.tenantId);
    if (!derivedType) return res.status(400).json({ message: `Unknown category: "${category}".` });

    const routeType = getRouteType(req);
    if (derivedType !== routeType) {
      return res.status(400).json({ message: `Category "${category}" belongs to ${derivedType}s, not ${routeType}s. Use the correct endpoint.` });
    }

    const exists = await Asset.findOne({ assetTag, isDeleted: { $ne: true } });
    if (exists) return res.status(409).json({ message: `Asset tag ${assetTag} already exists` });

    let typedCustomFields = req.body.customFields || {};
    if (Object.keys(typedCustomFields).length) {
      const fieldDefs = await DynamicField.find({ entityType: 'asset', category, isDeleted: { $ne: true } }, 'name type').lean();
      const typeMap   = new Map(fieldDefs.map(f => [f.name, f.type]));
      const casted    = {};
      for (const [k, v] of Object.entries(typedCustomFields)) {
        const val = castCustomFieldValue(v, typeMap.get(k) || 'text');
        if (val !== undefined) casted[k] = val;
      }
      typedCustomFields = casted;
    }

    const asset = new Asset({
      ...req.body,
      customFields: typedCustomFields,
      type:         derivedType,
      tenantId:     req.tenantId || null,
      createdBy:    req.authUser._id || null,
      domain:       req.authUser.domain || null, // legacy
    });
    await asset.save();
    res.status(201).json({ message: `${derivedType === 'asset' ? 'Asset' : 'Accessory'} created`, asset });
  } catch (err) {
    console.error('❌ Create error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /:id — tenant-scoped update ─────────────────────────────────────────
router.put('/:id', requireAuth, requireRole('admin', 'editor'), enforceTenantScope, async (req, res) => {
  try {
    const existing = await Asset.findOne({ _id: req.params.id, ...req.tenantFilter, isDeleted: { $ne: true } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const category    = req.body.category || existing.category;
    const derivedType = await typeFromCategory(category, req.tenantId);
    if (!derivedType) return res.status(400).json({ message: `Unknown category: "${category}"` });

    if (derivedType !== existing.type) {
      return res.status(400).json({ message: `Cannot change type from "${existing.type}" to "${derivedType}" by changing category.` });
    }

    const asset = await Asset.findByIdAndUpdate(req.params.id, { ...req.body, type: derivedType }, { new: true, runValidators: true });
    res.json({ message: 'Updated', asset });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DELETE /:id — tenant-scoped soft delete ──────────────────────────────────
router.delete('/:id', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    );
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted', assetTag: asset.assetTag });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /reclassify — admin only, tenant-scoped ─────────────────────────────
router.post('/reclassify', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const base = { ...req.tenantFilter };
    const assetResult     = await Asset.updateMany({ ...base, category: { $in: ASSET_CATEGORIES } },     { $set: { type: 'asset' } });
    const accessoryResult = await Asset.updateMany({ ...base, category: { $in: ACCESSORY_CATEGORIES } }, { $set: { type: 'accessory' } });
    const assetCount      = await Asset.countDocuments({ ...base, type: 'asset' });
    const accessoryCount  = await Asset.countDocuments({ ...base, type: 'accessory' });
    res.json({
      message:  `Reclassification complete. ${assetResult.modifiedCount + accessoryResult.modifiedCount} records updated.`,
      modified: assetResult.modifiedCount + accessoryResult.modifiedCount,
      breakdown: { assets: assetCount, accessories: accessoryCount },
    });
  } catch (e) {
    console.error('[reclassify]', e);
    res.status(500).json({ message: 'Reclassification failed: ' + e.message });
  }
});

// ─── POST /migrate-from-inventory — admin only, stamps tenantId ───────────────
router.post('/migrate-from-inventory', requireAuth, requireRole('admin'), enforceTenantScope, async (req, res) => {
  try {
    const Inventory = require('../models/Inventory');
    const items = await Inventory.find({}).lean();
    if (!items.length) return res.json({ migrated: 0, skipped: 0, message: 'No inventory records found' });

    const latestBySerial = new Map();
    for (const item of items) {
      const key = (item.serialno || '').trim().toLowerCase() || item._id.toString();
      const existing = latestBySerial.get(key);
      if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) latestBySerial.set(key, item);
    }

    const statusMap   = { 'active':'Assigned','in stock':'Available','disposed':'Retired','expired':'Retired','missing':'Missing','repair':'In Repair','reassigned and active':'Assigned' };
    const categoryMap = { 'laptop':'Laptop','macbook':'MacBook','mac mini':'Mac Mini','imac':'iMac','monitor':'Monitor','keyboard':'Keyboard','mouse':'Mouse','headset':'Headset','docking station':'Docking Station' };

    let migrated = 0, updated = 0;
    const errors = [];

    const allSerials = [...latestBySerial.values()].map(i => (i.serialno || '').trim()).filter(Boolean);
    const existingBySerial = new Map();
    if (allSerials.length) {
      const existing = await Asset.find({ serialno: { $in: allSerials }, ...req.tenantFilter }, '_id serialno type category status').lean();
      existing.forEach(a => existingBySerial.set(a.serialno, a));
    }

    const potentialTags = [...latestBySerial.values()].map(item => {
      const serial = (item.serialno || '').trim();
      return `MIG-${serial || item._id.toString().slice(-6).toUpperCase()}`;
    });
    const existingTags = new Set(
      (await Asset.find({ assetTag: { $in: potentialTags }, ...req.tenantFilter }, 'assetTag').lean()).map(a => a.assetTag)
    );

    const toCreate = [];
    const toUpdate = [];

    for (const [, item] of latestBySerial) {
      try {
        const serial        = (item.serialno || '').trim();
        const itemNameLower = (item.itemName || '').toLowerCase();
        const category      = Object.entries(categoryMap).find(([k]) => itemNameLower.includes(k))?.[1] || 'Other';
        const status        = statusMap[(item.status || '').toLowerCase()] || 'Available';
        const itemType      = (await typeFromCategory(category, req.tenantId)) || 'asset';
        const tagBase       = `MIG-${serial || item._id.toString().slice(-6).toUpperCase()}`;

        if (serial && existingBySerial.has(serial)) {
          toUpdate.push({ id: existingBySerial.get(serial)._id, update: { type: itemType, category, status } });
          updated++;
          continue;
        }

        const assetTag = existingTags.has(tagBase) ? `${tagBase}-${Date.now().toString(36).toUpperCase()}` : tagBase;
        toCreate.push({
          assetTag, name: item.itemName || 'Migrated Item', category, serialno: serial,
          purchaseDate: item.purchaseDate || undefined, status, type: itemType,
          notes: item.comment ? `Migrated. ${item.comment}` : 'Migrated from Inventory',
          source: 'migrated', customFields: {},
          tenantId: req.tenantId || null,
          domain:   req.authUser.domain || null,
        });
        migrated++;
      } catch (e) { errors.push({ serial: item.serialno, error: e.message }); }
    }

    if (toCreate.length) await Asset.insertMany(toCreate, { ordered: false }).catch(e => errors.push({ error: e.message }));
    for (const u of toUpdate) await Asset.findByIdAndUpdate(u.id, { $set: u.update });

    res.json({ message: `Migration complete: ${migrated} new, ${updated} updated`, migrated, updated, errors: errors.slice(0, 20) });
  } catch (e) {
    console.error('[migrate-from-inventory]', e);
    res.status(500).json({ message: 'Migration failed: ' + e.message });
  }
});

module.exports = router;
module.exports.ASSET_CATEGORIES     = ASSET_CATEGORIES;
module.exports.ACCESSORY_CATEGORIES = ACCESSORY_CATEGORIES;
module.exports.typeFromCategory      = typeFromCategory;
