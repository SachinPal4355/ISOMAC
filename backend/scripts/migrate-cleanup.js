#!/usr/bin/env node
/**
 * migrate-cleanup.js — Phase 12: Remove legacy isolation fields
 *
 * ⚠️  RUN ONLY AFTER:
 *   1. migrate-to-tenants.js has completed successfully
 *   2. All tenantId fields are populated (verify with validate-tenants.js)
 *   3. System has been running on tenantId-based isolation for 30+ days
 *   4. No routes are still using domain/organizationId/adminId filters
 *
 * WHAT THIS REMOVES:
 *   - domain field from: Asset, Employee, Assignment, MaintenanceLog,
 *     SoftwareLicense, Alert, Location, Request, User
 *   - organizationId from: User, Request
 *   - adminId from: User
 *
 * Run: node scripts/migrate-cleanup.js --confirm
 */
require('dotenv').config();
const mongoose = require('mongoose');

if (!process.argv.includes('--confirm')) {
  console.error('⚠️  This script removes legacy fields permanently.');
  console.error('   Run with --confirm to proceed: node scripts/migrate-cleanup.js --confirm');
  process.exit(1);
}

async function cleanup() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected. Starting cleanup...\n');

  const collections = [
    { model: 'Asset',           unset: { domain: '' } },
    { model: 'Employee',        unset: { domain: '' } },
    { model: 'Assignment',      unset: { domain: '' } },
    { model: 'MaintenanceLog',  unset: { domain: '' } },
    { model: 'SoftwareLicense', unset: { domain: '' } },
    { model: 'Alert',           unset: { domain: '' } },
    { model: 'Location',        unset: { domain: '' } },
    { model: 'Request',         unset: { domain: '', organizationId: '' } },
    { model: 'User',            unset: { domain: '', organizationId: '', adminId: '' } },
  ];

  for (const { model, unset } of collections) {
    const Model = mongoose.model(model);
    const result = await Model.updateMany({}, { $unset: unset });
    console.log(`  ${model}: removed ${Object.keys(unset).join(', ')} from ${result.modifiedCount} documents`);
  }

  console.log('\n✅ Cleanup complete. Legacy fields removed.');
  console.log('   You can now remove enforceDomainScope and enforceOrganizationScope from auth.js');
  await mongoose.disconnect();
}

// Pre-load all models
require('../models/Asset');
require('../models/Employee');
require('../models/Assignment');
require('../models/MaintenanceLog');
require('../models/SoftwareLicense');
require('../models/Alert');
require('../models/Location');
require('../models/Request');
require('../models/User');

cleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
