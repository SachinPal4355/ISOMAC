/**
 * Import Controller — schema-driven via fieldEngine.js
 *
 * COMMIT uses MongoDB transactions (session.withTransaction) so that a
 * mid-import failure rolls back every write in that batch.
 *
 * Transactions require a MongoDB replica set (Atlas always has one).
 * For local standalone MongoDB (dev), we fall back to non-transactional
 * mode automatically and log a warning.
 */
const mongoose  = require('mongoose');
const Asset     = require('../models/Asset');
const { ASSET_CATEGORIES, ACCESSORY_CATEGORIES } = require('../routes/asset.routes');
const Inventory = require('../models/Inventory');
const Location  = require('../models/Location');
const Region    = require('../models/Region');
const Employee  = require('../models/Employee');
const { linkAssetToEmployee } = require('../services/employee.service');
const {
  ASSET_FIXED_ALIASES, EMPLOYEE_FIXED_ALIASES,
  getFields, mapRowToFields, validateImportRow, buildTemplateHeaders,
  castCustomFieldValue,
} = require('../services/fieldEngine');
const {
  parseFile, processRows, mapInventoryRow, mapLocationRow,
  validateInventory, validateLocation,
} = require('../services/import.service');

function safeDate(val) {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Returns true if the current MongoDB connection supports transactions
 * (i.e. is a replica set or sharded cluster, not a standalone instance).
 */
async function supportsTransactions() {
  try {
    const admin = mongoose.connection.db.admin();
    const info  = await admin.command({ isMaster: 1 });
    return !!(info.setName || info.msg === 'isdbgrid');
  } catch {
    return false;
  }
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────────
// Preview is read-only — no transactions needed.
async function preview(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { module: mod } = req.params;
    const rows = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message: 'File is empty' });

    if (mod === 'assets') {
      const category  = req.query.category || req.body.category || '';
      const strict    = req.query.strict === 'true';
      const dynFields = await getFields('asset', category, req.tenantId || null);
      const valid = [], invalid = [], allWarnings = [];
      rows.forEach((row, idx) => {
        const { fixed, customFields } = mapRowToFields(row, ASSET_FIXED_ALIASES, { status: 'Available' });
        if (fixed.category && ACCESSORY_CATEGORIES.includes(fixed.category)) {
          invalid.push({ row: idx + 2, errors: [`Category "${fixed.category}" is an accessory category. Use the accessories import module.`], data: fixed });
          return;
        }
        const result = validateImportRow(fixed, customFields, ['assetTag', 'name', 'category'], dynFields, idx, { strict });
        if (result && result.errors.length) {
          invalid.push(result);
        } else {
          const knownNames = new Set(dynFields.map(f => f.name));
          const safeCustom = {};
          for (const k of knownNames) { if (customFields[k]) safeCustom[k] = customFields[k]; }
          valid.push({ ...fixed, customFields: safeCustom });
          if (result?.warnings?.length) allWarnings.push(...result.warnings.map(w => `Row ${idx + 2}: ${w}`));
        }
      });
      return res.json({ total: rows.length, valid: valid.length, invalid: invalid.length, preview: valid.slice(0, 10), errors: invalid, warnings: allWarnings, category: category || null });
    }

    if (mod === 'employees') {
      const strict    = req.query.strict === 'true';
      const dynFields = await getFields('employee', '', req.tenantId || null);
      const preValid = [], preInvalid = [], allWarnings = [];
      rows.forEach((row, idx) => {
        const { fixed, customFields } = mapRowToFields(row, EMPLOYEE_FIXED_ALIASES, { role: 'User', status: 'Active' });
        const result = validateImportRow(fixed, customFields, ['name', 'email', 'department', 'regionName', 'role'], dynFields, idx, { strict });
        if (result && result.errors.length) {
          preInvalid.push(result);
        } else {
          const knownNames = new Set(dynFields.map(f => f.name));
          const safeCustom = {};
          for (const k of knownNames) { if (customFields[k]) safeCustom[k] = customFields[k]; }
          preValid.push({ ...fixed, customFields: safeCustom });
          if (result?.warnings?.length) allWarnings.push(...result.warnings.map(w => `Row ${idx + 2}: ${w}`));
        }
      });
      const asyncErrors = [], validRows = [];
      for (const row of preValid) {
        const rowErrors = [];
        // Scope email check to this tenant to avoid cross-tenant false positives
        const existing = await Employee.findOne({ email: row.email, tenantId: req.tenantId || null });
        if (existing) rowErrors.push(`email ${row.email} already exists`);
        const region = await Region.findOne({
          name: { $regex: new RegExp('^' + row.regionName, 'i') },
          $or: [{ tenantId: null }, { tenantId: req.tenantId || null }],
        });
        if (!region) rowErrors.push(`regionName "${row.regionName}" not found`);
        if (rowErrors.length) asyncErrors.push({ row: '?', errors: rowErrors, data: row });
        else validRows.push({ ...row, regionId: region._id });
      }
      const assetWarnings = [];
      for (let idx = 0; idx < validRows.length; idx++) {
        const row = validRows[idx];
        if (row.assetTag) {
          // Scope asset lookup to this tenant
          const asset = await Asset.findOne({ assetTag: row.assetTag, tenantId: req.tenantId || null });
          if (!asset) assetWarnings.push(`Row ${idx + 2}: assetTag '${row.assetTag}' not found`);
          else if (asset.employeeRef) assetWarnings.push(`Row ${idx + 2}: Asset '${row.assetTag}' already assigned`);
        }
      }
      return res.json({ total: rows.length, valid: validRows.length, invalid: preInvalid.length + asyncErrors.length, preview: validRows.slice(0, 10), errors: [...preInvalid, ...asyncErrors], warnings: [...allWarnings, ...assetWarnings] });
    }

    if (mod === 'inventory') {
      const result = processRows(rows, mapInventoryRow, validateInventory);
      return res.json({ total: rows.length, valid: result.valid.length, invalid: result.invalid.length, preview: result.preview, errors: result.invalid });
    }

    if (mod === 'accessories') {
      const valid = [], invalid = [];
      rows.forEach((row, idx) => {
        const mapped = {
          name:     row.name || row.itemName || row.item_name || '',
          serialno: row.serialno || row.serial_no || row.serialNumber || '',
          location: row.location || '',
          vendor:   row.vendor || '',
          notes:    row.notes || '',
          category: row.category || '',
          status:   row.status || 'Available',
        };
        if (!mapped.name) {
          invalid.push({ row: idx + 2, errors: ['name is required'] });
        } else if (mapped.category && ASSET_CATEGORIES.includes(mapped.category)) {
          invalid.push({ row: idx + 2, errors: [`Category "${mapped.category}" is an asset category. Use the assets import module.`], data: mapped });
        } else {
          valid.push(mapped);
        }
      });
      return res.json({ total: rows.length, valid: valid.length, invalid: invalid.length, preview: valid.slice(0, 10), errors: invalid });
    }

    if (mod === 'locations') {
      const result = processRows(rows, mapLocationRow, validateLocation);
      return res.json({ total: rows.length, valid: result.valid.length, invalid: result.invalid.length, preview: result.preview, errors: result.invalid });
    }

    return res.status(400).json({ message: `Unknown module: ${mod}` });
  } catch (err) {
    console.error('[import/preview]', err);
    res.status(500).json({ message: err.message || 'Parse error' });
  }
}

// ─── COMMIT ──────────────────────────────────────────────────────────────────
// All DB writes are wrapped in a MongoDB transaction.
// If any write fails the entire batch is rolled back — no partial imports.
async function commit(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { module: mod } = req.params;
    const overlay = req.query.overlay === 'true';
    const rows = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message: 'File is empty' });

    const txSupported = await supportsTransactions();
    if (!txSupported) {
      console.warn('[import/commit] ⚠️  MongoDB standalone detected — running without transaction. Use a replica set in production.');
    }

    // ── ASSETS ──────────────────────────────────────────────────────────────
    if (mod === 'assets') {
      const category  = req.query.category || req.body.category || '';
      const strict    = req.query.strict === 'true';
      const dynFields = await getFields('asset', category, req.tenantId || null);
      const knownNames = new Set(dynFields.map(f => f.name));
      const valid = [], invalid = [];

      rows.forEach((row, idx) => {
        const { fixed, customFields } = mapRowToFields(row, ASSET_FIXED_ALIASES, { status: 'Available' });
        if (fixed.category && ACCESSORY_CATEGORIES.includes(fixed.category)) {
          invalid.push({ row: idx + 2, errors: [`Category "${fixed.category}" is an accessory category.`], data: fixed });
          return;
        }
        const result = validateImportRow(fixed, customFields, ['assetTag', 'name', 'category'], dynFields, idx, { strict });
        if (result && result.errors.length) {
          invalid.push(result);
        } else {
          const safeCustom = {};
          for (const k of knownNames) { if (customFields[k]) safeCustom[k] = customFields[k]; }
          valid.push({ ...fixed, customFields: safeCustom });
        }
      });

      if (!valid.length) return res.json({ inserted: 0, updated: 0, failed: invalid.length, errors: invalid });

      let inserted = 0, updated = 0;
      const errors = [...invalid];

      const doAssetWrites = async (session) => {
        // Build a type lookup map for O(1) access during row processing
        const fieldTypeMap = new Map(dynFields.map(f => [f.name, f.type]));

        for (const row of valid) {
          // Cast each customField value to its declared type
          const customFields = {};
          for (const k of knownNames) {
            if (row.customFields[k] !== undefined && row.customFields[k] !== '') {
              const casted = castCustomFieldValue(row.customFields[k], fieldTypeMap.get(k) || 'text');
              if (casted !== undefined) customFields[k] = casted;
            }
          };
          const doc = {
            name:           row.name,
            category:       row.category || category || '',
            brand:          row.brand    || '',
            model:          row.model    || '',
            serialno:       row.serialno || '',
            status:         row.status   || 'Available',
            location:       row.location || '',
            notes:          row.notes    || '',
            purchaseCost:   row.purchaseCost ? Number(row.purchaseCost) : 0,
            purchaseDate:   safeDate(row.purchaseDate),
            warrantyExpiry: safeDate(row.warrantyExpiry),
            type:           'asset',
            customFields,
            tenantId:       req.tenantId || null,   // ← tenant-stamped
          };
          if (overlay) {
            const r = await Asset.findOneAndUpdate(
              { assetTag: row.assetTag, tenantId: req.tenantId || null },
              { $set: doc },
              { new: true, session }
            );
            if (r) updated++;
            else errors.push({ row: row.assetTag, errors: [`assetTag ${row.assetTag} not found for overlay`] });
          } else {
            await Asset.create([{ ...doc, assetTag: row.assetTag }], { session });
            inserted++;
          }
        }
      };

      if (txSupported) {
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(() => doAssetWrites(dbSession));
        } catch (txErr) {
          console.error('[import/assets] Transaction rolled back:', txErr.message);
          return res.status(500).json({ message: 'Import failed and was rolled back. No records were written.', detail: txErr.message });
        } finally {
          dbSession.endSession();
        }
      } else {
        await doAssetWrites(null);
      }

      return res.json({ inserted, updated, failed: errors.length, errors, transactional: txSupported });
    }

    // ── EMPLOYEES ────────────────────────────────────────────────────────────
    if (mod === 'employees') {
      const strict    = req.query.strict === 'true';
      const dynFields = await getFields('employee', '', req.tenantId || null);
      const knownNames = new Set(dynFields.map(f => f.name));
      const valid = [], invalid = [];

      rows.forEach((row, idx) => {
        const { fixed, customFields } = mapRowToFields(row, EMPLOYEE_FIXED_ALIASES, { role: 'User', status: 'Active' });
        const result = validateImportRow(fixed, customFields, ['name', 'email', 'department', 'regionName', 'role'], dynFields, idx, { strict });
        if (result && result.errors.length) {
          invalid.push(result);
        } else {
          const safeCustom = {};
          for (const k of knownNames) { if (customFields[k]) safeCustom[k] = customFields[k]; }
          valid.push({ ...fixed, customFields: safeCustom });
        }
      });

      const errors = [...invalid];
      const warnings = [];
      let inserted = 0;

      const doEmployeeWrites = async (session) => {
        for (const row of valid) {
          const region = await Region.findOne(
            {
              name: { $regex: new RegExp('^' + row.regionName, 'i') },
              $or: [{ tenantId: null }, { tenantId: req.tenantId || null }],
            },
            null,
            { session }
          );
          if (!region) {
            errors.push({ row: row.email, errors: [`regionName "${row.regionName}" not found`] });
            // In transactional mode, a missing region aborts the whole batch
            if (session) throw new Error(`regionName "${row.regionName}" not found — aborting import`);
            continue;
          }
          const [employee] = await Employee.create([{
            name:         row.name,
            email:        row.email,
            phone:        row.phone       || '',
            department:   row.department,
            regionId:     region._id,
            role:         row.role        || 'User',
            status:       row.status      || 'Active',
            customFields: row.customFields || {},
            tenantId:     req.tenantId    || null,   // ← tenant-stamped
          }], { session });
          inserted++;

          if (row.assetTag) {
            const asset = await Asset.findOne({ assetTag: row.assetTag, tenantId: req.tenantId || null }, null, { session });
            if (!asset) {
              warnings.push({ row: row.email, warning: `assetTag '${row.assetTag}' not found` });
            } else if (asset.employeeRef && String(asset.employeeRef) !== String(employee._id)) {
              warnings.push({ row: row.email, warning: `Asset '${row.assetTag}' already assigned` });
            } else {
              await linkAssetToEmployee(asset._id, employee._id, req.session.user._id, session, req.tenantId || null);
            }
          }
        }
      };

      if (txSupported) {
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(() => doEmployeeWrites(dbSession));
        } catch (txErr) {
          console.error('[import/employees] Transaction rolled back:', txErr.message);
          return res.status(500).json({ message: 'Import failed and was rolled back. No records were written.', detail: txErr.message });
        } finally {
          dbSession.endSession();
        }
      } else {
        try {
          await doEmployeeWrites(null);
        } catch (e) {
          if (e.code === 11000) errors.push({ row: '?', errors: ['Duplicate email detected'] });
          else errors.push({ row: '?', errors: [e.message] });
        }
      }

      return res.json({ inserted, failed: errors.length, errors, warnings, transactional: txSupported });
    }

    // ── INVENTORY ────────────────────────────────────────────────────────────
    if (mod === 'inventory') {
      const result = processRows(rows, mapInventoryRow, validateInventory);
      if (!result.valid.length) return res.json({ inserted: 0, failed: result.invalid.length, errors: result.invalid });
      const docs = result.valid.map(row => ({
        itemName:   row.itemName,
        serialno:   row.serialno.trim(),
        name:       row.name       || '-',
        email:      row.email      || '-',
        purchaseDate: safeDate(row.purchaseDate),
        status:     row.status     || 'In Stock',
        comment:    row.comment    || 'Bulk Import',
        actionType: 'Add',
        createdAt:  new Date(),
      }));
      // Inventory is legacy — no transaction needed, insertMany with ordered:false
      const inserted = await Inventory.insertMany(docs, { ordered: false })
        .catch(e => { console.warn('[inventory insertMany partial]', e.message); return e.insertedDocs || []; });
      return res.json({ inserted: Array.isArray(inserted) ? inserted.length : inserted, failed: result.invalid.length, errors: result.invalid });
    }

    // ── ACCESSORIES ──────────────────────────────────────────────────────────
    if (mod === 'accessories') {
      const valid = [], invalid = [];
      rows.forEach((row, idx) => {
        const mapped = {
          name:     row.name || row.itemName || row.item_name || '',
          serialno: row.serialno || row.serial_no || row.serialNumber || '',
          location: row.location || '',
          vendor:   row.vendor   || '',
          notes:    row.notes    || '',
          category: row.category || 'Other',
          status:   row.status   || 'Available',
        };
        if (!mapped.name) {
          invalid.push({ row: idx + 2, errors: ['name is required'] });
        } else if (ASSET_CATEGORIES.includes(mapped.category)) {
          invalid.push({ row: idx + 2, errors: [`Category "${mapped.category}" is an asset category. Use the assets import module.`], data: mapped });
        } else {
          valid.push(mapped);
        }
      });

      if (!valid.length) return res.json({ inserted: 0, failed: invalid.length, errors: invalid });

      // Batch-fetch existing tags to avoid per-row findOne
      const potentialTags = valid.map(row =>
        `ACC-${(row.serialno || Date.now().toString(36)).toUpperCase().slice(-8)}`
      );
      const existingTagDocs = await Asset.find({ assetTag: { $in: potentialTags }, tenantId: req.tenantId || null }, 'assetTag').lean();
      const existingTagSet  = new Set(existingTagDocs.map(d => d.assetTag));

      const errors = [...invalid];
      let inserted = 0;

      const doAccessoryWrites = async (session) => {
        for (const row of valid) {
          const tagBase  = `ACC-${(row.serialno || Date.now().toString(36)).toUpperCase().slice(-8)}`;
          const assetTag = existingTagSet.has(tagBase) ? `${tagBase}-${Date.now().toString(36).toUpperCase()}` : tagBase;
          existingTagSet.add(assetTag); // prevent duplicates within the same batch
          await Asset.create([{
            assetTag,
            name:         row.name,
            category:     row.category,
            serialno:     row.serialno,
            location:     row.location,
            notes:        row.notes,
            status:       row.status,
            type:         'accessory',
            customFields: { vendor: row.vendor },
            tenantId:     req.tenantId || null,   // ← tenant-stamped
          }], { session });
          inserted++;
        }
      };

      if (txSupported) {
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(() => doAccessoryWrites(dbSession));
        } catch (txErr) {
          console.error('[import/accessories] Transaction rolled back:', txErr.message);
          return res.status(500).json({ message: 'Import failed and was rolled back.', detail: txErr.message });
        } finally {
          dbSession.endSession();
        }
      } else {
        await doAccessoryWrites(null);
      }

      return res.json({ inserted, failed: errors.length, errors, transactional: txSupported });
    }

    // ── LOCATIONS ────────────────────────────────────────────────────────────
    if (mod === 'locations') {
      const result = processRows(rows, mapLocationRow, validateLocation);
      if (!result.valid.length) return res.json({ inserted: 0, failed: result.invalid.length, errors: result.invalid });
      let inserted = 0;
      const errors = [...result.invalid];

      const doLocationWrites = async (session) => {
        for (const row of result.valid) {
          await Location.findOneAndUpdate(
            { name: row.name },
            { $setOnInsert: { name: row.name, description: row.description, address: row.address, tenantId: req.tenantId || null } },
            { upsert: true, new: true, session }
          );
          inserted++;
        }
      };

      if (txSupported) {
        const dbSession = await mongoose.startSession();
        try {
          await dbSession.withTransaction(() => doLocationWrites(dbSession));
        } catch (txErr) {
          console.error('[import/locations] Transaction rolled back:', txErr.message);
          return res.status(500).json({ message: 'Import failed and was rolled back.', detail: txErr.message });
        } finally {
          dbSession.endSession();
        }
      } else {
        await doLocationWrites(null);
      }

      return res.json({ inserted, failed: errors.length, errors, transactional: txSupported });
    }

    return res.status(400).json({ message: `Unknown module: ${mod}` });
  } catch (err) {
    console.error('[import/commit]', err);
    res.status(500).json({ message: err.message || 'Import failed' });
  }
}

// ─── TEMPLATE DOWNLOAD ───────────────────────────────────────────────────────
async function template(req, res) {
  const { module: mod } = req.params;
  const category = req.query.category || '';

  const BASE = {
    assets:      { headers: ['assetTag','name','category','brand','model','serialno','status','location','purchaseCost','purchaseDate','warrantyExpiry','notes'], sample: ['AT-001','Dell Laptop','Laptop','Dell','Latitude 5520','SN123456','Available','Head Office','75000','2023-01-15','2026-01-15','Good condition'] },
    accessories: { headers: ['name','category','serialno','location','vendor','status','notes'], sample: ['Logitech MX Master','Mouse','SN-MOUSE-001','Head Office','Logitech','Available','Wireless mouse'] },
    inventory:   { headers: ['itemName','serialno','name','email','purchaseDate','status','comment'], sample: ['Laptop','SN123456','John Doe','john@company.com','2023-01-15','Active','Assigned to employee'] },
    locations:   { headers: ['name','description','address'], sample: ['Head Office','Main office building','123 Business Park, Mumbai'] },
    employees:   { headers: ['name','email','phone','department','regionName','role','status','assetTag'], sample: ['John Doe','john@company.com','+1234567890','Engineering','North Region','User','Active','AT-001'] },
  };

  const tpl = BASE[mod];
  if (!tpl) return res.status(400).json({ message: 'Unknown module' });

  let dynFields = [];
  try {
    if (mod === 'assets' && category) dynFields = await getFields('asset', category);
    else if (mod === 'employees')     dynFields = await getFields('employee', '');
  } catch (_) {}

  const { headers, sample } = buildTemplateHeaders(tpl.headers, tpl.sample, dynFields);
  const csv = [headers.join(','), sample.join(',')].join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${mod}_template.csv"`);
  res.send('\uFEFF' + csv);
}

module.exports = { preview, commit, template };
