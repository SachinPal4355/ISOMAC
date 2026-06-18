#!/usr/bin/env node
/**
 * migrate-to-tenants.js — Phase 5 migration: Organization → Tenant
 *
 * WHAT THIS DOES:
 *   1. Creates a Tenant record for every existing Organization
 *   2. Backfills tenantId on all Users in each org
 *   3. Backfills tenantId on all data records (Asset, Employee, Assignment, etc.)
 *      using domain matching (since data was previously isolated by domain)
 *   4. Backfills AuditLog.tenantId via performedBy → User lookup
 *   5. Reports counts — does NOT delete legacy fields (that is Phase 12)
 *
 * SAFE TO RUN MULTIPLE TIMES — uses upsert/findOneAndUpdate, skips already-migrated records.
 *
 * Run: node scripts/migrate-to-tenants.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Organization      = require('../models/Organization');
const Tenant            = require('../models/Tenant');
const User              = require('../models/User');
const Asset             = require('../models/Asset');
const Employee          = require('../models/Employee');
const Assignment        = require('../models/Assignment');
const MaintenanceLog    = require('../models/MaintenanceLog');
const SoftwareLicense   = require('../models/SoftwareLicense');
const Alert             = require('../models/Alert');
const Location          = require('../models/Location');
const AuditLog          = require('../models/AuditLog');
const Request           = require('../models/Request');
const EmployeeAssetHistory = require('../models/EmployeeAssetHistory');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const orgs = await Organization.find({}).lean();
  console.log(`\nFound ${orgs.length} organization(s) to migrate\n`);

  let totalUsers = 0, totalAssets = 0, totalEmployees = 0,
      totalAssignments = 0, totalMaintenance = 0, totalLicenses = 0,
      totalAlerts = 0, totalLocations = 0, totalRequests = 0,
      totalAuditLogs = 0;

  for (const org of orgs) {
    console.log(`\n── Migrating org: "${org.name}" (${org._id})`);

    // 1. Create or find Tenant for this org
    let tenant = await Tenant.findOne({ name: org.name });
    if (!tenant) {
      tenant = await Tenant.create({
        name:      org.name,
        slug:      org.slug || org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        isActive:  org.isActive !== false,
        createdBy: org.createdBy,
        // Add domain as unverified — admin must verify via DNS
        domains:   org.domain ? [{ domain: org.domain, isVerified: false }] : [],
      });
      console.log(`  ✅ Created tenant: ${tenant._id}`);
    } else {
      console.log(`  ℹ️  Tenant already exists: ${tenant._id}`);
    }

    const tenantId = tenant._id;

    // 2. Backfill Users
    const userResult = await User.updateMany(
      { organizationId: org._id, tenantId: null },
      { $set: { tenantId } }
    );
    totalUsers += userResult.modifiedCount;
    console.log(`  Users backfilled: ${userResult.modifiedCount}`);

    // 3. Backfill data records by domain (primary isolation mechanism pre-migration)
    if (org.domain) {
      const domainFilter = { domain: org.domain, tenantId: null };

      const assetRes = await Asset.updateMany(domainFilter, { $set: { tenantId } });
      totalAssets += assetRes.modifiedCount;

      const empRes = await Employee.updateMany(domainFilter, { $set: { tenantId } });
      totalEmployees += empRes.modifiedCount;

      const asgRes = await Assignment.updateMany(domainFilter, { $set: { tenantId } });
      totalAssignments += asgRes.modifiedCount;

      const mntRes = await MaintenanceLog.updateMany(domainFilter, { $set: { tenantId } });
      totalMaintenance += mntRes.modifiedCount;

      const licRes = await SoftwareLicense.updateMany(domainFilter, { $set: { tenantId } });
      totalLicenses += licRes.modifiedCount;

      const alertRes = await Alert.updateMany(domainFilter, { $set: { tenantId } });
      totalAlerts += alertRes.modifiedCount;

      const locRes = await Location.updateMany(domainFilter, { $set: { tenantId } });
      totalLocations += locRes.modifiedCount;

      const reqRes = await Request.updateMany(
        { organizationId: org._id, tenantId: null },
        { $set: { tenantId } }
      );
      totalRequests += reqRes.modifiedCount;

      console.log(`  Assets: ${assetRes.modifiedCount}, Employees: ${empRes.modifiedCount}, Assignments: ${asgRes.modifiedCount}`);
      console.log(`  Maintenance: ${mntRes.modifiedCount}, Licenses: ${licRes.modifiedCount}, Alerts: ${alertRes.modifiedCount}`);
      console.log(`  Locations: ${locRes.modifiedCount}, Requests: ${reqRes.modifiedCount}`);
    }
  }

  // 4. Backfill AuditLog via performedBy → User lookup (no domain on AuditLog)
  console.log('\n── Backfilling AuditLog.tenantId via user lookup...');
  const unmigratedLogs = await AuditLog.find({ tenantId: null }).lean();
  console.log(`  Found ${unmigratedLogs.length} audit logs without tenantId`);

  // Build username → tenantId map to avoid N+1 queries
  const usernameMap = new Map();
  const uniqueUsernames = [...new Set(unmigratedLogs.map(l => l.performedBy).filter(Boolean))];
  const users = await User.find({ username: { $in: uniqueUsernames } }, 'username tenantId').lean();
  users.forEach(u => { if (u.tenantId) usernameMap.set(u.username, u.tenantId); });

  const auditBulk = [];
  for (const log of unmigratedLogs) {
    const tid = usernameMap.get(log.performedBy);
    if (tid) auditBulk.push({ updateOne: { filter: { _id: log._id }, update: { $set: { tenantId: tid } } } });
  }
  if (auditBulk.length) {
    const auditRes = await AuditLog.bulkWrite(auditBulk, { ordered: false });
    totalAuditLogs = auditRes.modifiedCount;
  }
  console.log(`  AuditLogs backfilled: ${totalAuditLogs}`);

  // 5. Backfill EmployeeAssetHistory via employeeId → Employee.tenantId
  console.log('\n── Backfilling EmployeeAssetHistory.tenantId...');
  const unmigratedHistory = await EmployeeAssetHistory.find({ tenantId: null }).lean();
  const empIds = [...new Set(unmigratedHistory.map(h => String(h.employeeId)))];
  const empDocs = await Employee.find({ _id: { $in: empIds } }, 'tenantId').lean();
  const empTenantMap = new Map(empDocs.map(e => [String(e._id), e.tenantId]));

  const histBulk = unmigratedHistory
    .filter(h => empTenantMap.get(String(h.employeeId)))
    .map(h => ({ updateOne: { filter: { _id: h._id }, update: { $set: { tenantId: empTenantMap.get(String(h.employeeId)) } } } }));
  if (histBulk.length) await EmployeeAssetHistory.bulkWrite(histBulk, { ordered: false });
  console.log(`  EmployeeAssetHistory backfilled: ${histBulk.length}`);

  console.log('\n══════════════════════════════════════════');
  console.log('Migration complete. Summary:');
  console.log(`  Users:              ${totalUsers}`);
  console.log(`  Assets:             ${totalAssets}`);
  console.log(`  Employees:          ${totalEmployees}`);
  console.log(`  Assignments:        ${totalAssignments}`);
  console.log(`  Maintenance logs:   ${totalMaintenance}`);
  console.log(`  Licenses:           ${totalLicenses}`);
  console.log(`  Alerts:             ${totalAlerts}`);
  console.log(`  Locations:          ${totalLocations}`);
  console.log(`  Requests:           ${totalRequests}`);
  console.log(`  Audit logs:         ${totalAuditLogs}`);
  console.log('══════════════════════════════════════════');
  console.log('\nNext steps:');
  console.log('  1. Verify data in MongoDB — check tenantId is set on all records');
  console.log('  2. Run the app and test multi-tenant isolation');
  console.log('  3. After 30-day validation, run migrate-cleanup.js to remove legacy fields');

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
