/**
 * alert.service.js — Tenant-isolated alert generation
 *
 * PERFORMANCE MODEL (unchanged):
 *   2 DB calls per check type regardless of collection size:
 *   1. Batch fetch expiring items (with tenantId filter)
 *   2. Batch fetch today's existing alerts (with tenantId filter)
 *   3. insertMany for new alerts
 *
 * TENANT ISOLATION (fixed):
 *   All three check functions now accept a tenantId parameter.
 *   - Asset/License/MaintenanceLog queries are scoped to { tenantId }
 *   - fetchAlertedIds dedup is scoped to { tenantId }
 *   - Every inserted alert carries { tenantId }
 *
 *   runAllChecks() iterates over all active tenants and runs checks
 *   per-tenant, so alerts are never mixed across tenant boundaries.
 *
 *   runAllChecks() also accepts an optional tenantId for manual
 *   single-tenant runs (e.g. triggered from the Settings UI).
 */
const Alert           = require('../models/Alert');
const Asset           = require('../models/Asset');
const SoftwareLicense = require('../models/SoftwareLicense');
const MaintenanceLog  = require('../models/MaintenanceLog');
const Tenant          = require('../models/Tenant');
const { sendAlertDigest } = require('./email.service');

/** Midnight of today (UTC) — dedup window */
function todayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Fetch alert refIds already created today for a given type + tenant.
 * Scoped to tenantId so dedup never crosses tenant boundaries.
 *
 * @param {string}   type      - e.g. 'warranty_expiry'
 * @param {string}   refField  - e.g. 'assetId'
 * @param {ObjectId} tenantId
 * @returns {Set<string>}
 */
async function fetchAlertedIds(type, refField, tenantId) {
  const existing = await Alert.find(
    { type, tenantId, createdAt: { $gte: todayUTC() } },
    { [refField]: 1, _id: 0 }
  ).lean();
  return new Set(existing.map(a => String(a[refField])));
}

// ─── WARRANTY EXPIRY ─────────────────────────────────────────────────────────
async function checkWarrantyExpiry(days = 30, tenantId) {
  const cutoff = new Date(Date.now() + days * 86400000);

  const assets = await Asset.find({
    tenantId,
    warrantyExpiry: { $lte: cutoff, $gte: new Date() },
    status:         { $ne: 'Retired' },
    isDeleted:      { $ne: true },
  }, 'name assetTag warrantyExpiry tenantId _id').lean();

  if (!assets.length) return 0;

  const alreadyAlerted = await fetchAlertedIds('warranty_expiry', 'assetId', tenantId);

  const toInsert = [];
  for (const asset of assets) {
    if (alreadyAlerted.has(String(asset._id))) continue;
    const daysLeft = Math.ceil((new Date(asset.warrantyExpiry) - Date.now()) / 86400000);
    const severity = daysLeft <= 7 ? 'high' : daysLeft <= 14 ? 'medium' : 'low';
    toInsert.push({
      type:     'warranty_expiry',
      message:  `Asset "${asset.name}" (${asset.assetTag}) warranty expires in ${daysLeft} day(s).`,
      severity,
      assetId:  asset._id,
      tenantId,                                          // ← tenant-stamped
      meta:     { assetTag: asset.assetTag, warrantyExpiry: asset.warrantyExpiry, daysLeft },
    });
  }

  if (toInsert.length) {
    await Alert.insertMany(toInsert, { ordered: false });
    console.log(`[alert] warranty_expiry: ${toInsert.length} new alert(s) for tenant ${tenantId}`);
  }
  return toInsert.length;
}

// ─── LICENSE EXPIRY ──────────────────────────────────────────────────────────
async function checkLicenseExpiry(days = 30, tenantId) {
  const cutoff = new Date(Date.now() + days * 86400000);

  const licenses = await SoftwareLicense.find({
    tenantId,
    expiryDate: { $lte: cutoff, $gte: new Date() },
    status:     'Active',
  }, 'softwareName expiryDate tenantId _id').lean();

  if (!licenses.length) return 0;

  const alreadyAlerted = await fetchAlertedIds('license_expiry', 'licenseId', tenantId);

  const toInsert = [];
  for (const lic of licenses) {
    if (alreadyAlerted.has(String(lic._id))) continue;
    const daysLeft = Math.ceil((new Date(lic.expiryDate) - Date.now()) / 86400000);
    const severity = daysLeft <= 7 ? 'high' : daysLeft <= 14 ? 'medium' : 'low';
    toInsert.push({
      type:      'license_expiry',
      message:   `License "${lic.softwareName}" expires in ${daysLeft} day(s).`,
      severity,
      licenseId: lic._id,
      tenantId,                                          // ← tenant-stamped
      meta:      { softwareName: lic.softwareName, expiryDate: lic.expiryDate, daysLeft },
    });
  }

  if (toInsert.length) {
    await Alert.insertMany(toInsert, { ordered: false });
    console.log(`[alert] license_expiry: ${toInsert.length} new alert(s) for tenant ${tenantId}`);
  }
  return toInsert.length;
}

// ─── MAINTENANCE DUE ─────────────────────────────────────────────────────────
async function checkMaintenanceDue(days = 3, tenantId) {
  const cutoff = new Date(Date.now() + days * 86400000);

  const logs = await MaintenanceLog.find({
    tenantId,
    status:        'Scheduled',
    scheduledDate: { $lte: cutoff },
  }).populate('asset', 'name assetTag').lean();

  if (!logs.length) return 0;

  // Dedup on maintenanceId stored in meta, scoped to tenant
  const existing = await Alert.find(
    { type: 'maintenance_due', tenantId, createdAt: { $gte: todayUTC() } },
    { 'meta.maintenanceId': 1, _id: 0 }
  ).lean();
  const alreadyAlerted = new Set(existing.map(a => String(a.meta?.maintenanceId)));

  const toInsert = [];
  for (const log of logs) {
    if (alreadyAlerted.has(String(log._id))) continue;
    const overdue   = new Date(log.scheduledDate) < new Date();
    const severity  = overdue ? 'high' : 'medium';
    const label     = overdue ? 'overdue' : 'due soon';
    const assetName = log.asset?.name || 'Unknown';
    toInsert.push({
      type:    'maintenance_due',
      message: `Maintenance (${log.type}) for "${assetName}" is ${label}.`,
      severity,
      assetId: log.asset?._id || null,
      tenantId,                                          // ← tenant-stamped
      meta:    { maintenanceId: log._id, scheduledDate: log.scheduledDate, type: log.type },
    });
  }

  if (toInsert.length) {
    await Alert.insertMany(toInsert, { ordered: false });
    console.log(`[alert] maintenance_due: ${toInsert.length} new alert(s) for tenant ${tenantId}`);
  }
  return toInsert.length;
}

// ─── RUN ALL CHECKS ───────────────────────────────────────────────────────────
/**
 * Run all alert checks.
 *
 * When called from the cron job (no tenantId): iterates over ALL active
 * tenants and runs checks for each one independently.
 *
 * When called from the Settings UI (tenantId provided): runs checks for
 * that single tenant only.
 *
 * @param {object}   config
 * @param {number}   [config.warrantyDays=30]
 * @param {number}   [config.licenseDays=30]
 * @param {number}   [config.maintenanceDays=3]
 * @param {ObjectId} [config.tenantId]  — if set, only run for this tenant
 */
async function runAllChecks(config = {}) {
  const { warrantyDays = 30, licenseDays = 30, maintenanceDays = 3, tenantId } = config;
  const start = Date.now();

  try {
    // Resolve which tenants to process
    let tenantIds;
    if (tenantId) {
      tenantIds = [tenantId];
    } else {
      // Cron path: fetch all active tenants
      const tenants = await Tenant.find({ isActive: true }, '_id').lean();
      tenantIds = tenants.map(t => t._id);
    }

    if (!tenantIds.length) {
      console.log('[alert-cron] No active tenants — skipping');
      return;
    }

    let totalNew = 0;

    // Run checks per tenant — parallel across tenants, sequential within
    await Promise.all(tenantIds.map(async (tid) => {
      const [w, l, m] = await Promise.all([
        checkWarrantyExpiry(warrantyDays, tid),
        checkLicenseExpiry(licenseDays, tid),
        checkMaintenanceDue(maintenanceDays, tid),
      ]);
      totalNew += (w + l + m);
    }));

    // Email digest — only for cron runs (not manual single-tenant triggers)
    if (!tenantId && totalNew > 0) {
      const since      = new Date(start - 1000);
      const newAlerts  = await Alert.find({ createdAt: { $gte: since } }, 'type message severity').lean();
      if (newAlerts.length) await sendAlertDigest(newAlerts);
    }

    console.log(`[alert-cron] ✅ All checks done in ${Date.now() - start}ms — ${totalNew} new alert(s) across ${tenantIds.length} tenant(s)`);
  } catch (err) {
    console.error('[alert-cron] ❌ Error during alert checks:', err.message);
  }
}

module.exports = { runAllChecks, checkWarrantyExpiry, checkLicenseExpiry, checkMaintenanceDue };
