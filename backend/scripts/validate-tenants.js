#!/usr/bin/env node
/**
 * validate-tenants.js — Verify tenantId migration completeness
 *
 * Run after migrate-to-tenants.js to confirm all records have tenantId set.
 * Reports any records still missing tenantId — these need manual investigation.
 *
 * Run: node scripts/validate-tenants.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

require('../models/Asset');
require('../models/Employee');
require('../models/Assignment');
require('../models/MaintenanceLog');
require('../models/SoftwareLicense');
require('../models/Alert');
require('../models/Location');
require('../models/Request');
require('../models/AuditLog');
require('../models/User');

async function validate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected. Validating tenantId coverage...\n');

  const checks = [
    'Asset', 'Employee', 'Assignment', 'MaintenanceLog',
    'SoftwareLicense', 'Alert', 'Location', 'Request', 'AuditLog',
  ];

  let allGood = true;
  for (const modelName of checks) {
    const Model = mongoose.model(modelName);
    const total   = await Model.countDocuments({});
    const missing = await Model.countDocuments({ tenantId: null });
    const pct     = total > 0 ? ((total - missing) / total * 100).toFixed(1) : '100.0';
    const status  = missing === 0 ? '✅' : '⚠️ ';
    console.log(`  ${status} ${modelName.padEnd(20)} total: ${String(total).padStart(6)}  missing: ${String(missing).padStart(6)}  coverage: ${pct}%`);
    if (missing > 0) allGood = false;
  }

  // Users — super_admin is expected to have null tenantId
  const User = mongoose.model('User');
  const totalUsers   = await User.countDocuments({ isDeleted: { $ne: true } });
  const superAdmins  = await User.countDocuments({ role: 'super_admin' });
  const missingUsers = await User.countDocuments({ tenantId: null, role: { $ne: 'super_admin' }, isDeleted: { $ne: true } });
  const userStatus   = missingUsers === 0 ? '✅' : '⚠️ ';
  console.log(`  ${userStatus} ${'User (non-SA)'.padEnd(20)} total: ${String(totalUsers - superAdmins).padStart(6)}  missing: ${String(missingUsers).padStart(6)}`);
  if (missingUsers > 0) allGood = false;

  console.log(allGood
    ? '\n✅ All records have tenantId. Safe to proceed to Phase 12 cleanup.'
    : '\n⚠️  Some records are missing tenantId. Re-run migrate-to-tenants.js or investigate manually.'
  );

  await mongoose.disconnect();
}

validate().catch(err => {
  console.error('❌ Validation failed:', err);
  process.exit(1);
});
